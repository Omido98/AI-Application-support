use ego_tree::NodeRef;
use futures_util::StreamExt;
use keyring::Entry;
use scraper::{ElementRef, Node, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio_util::sync::CancellationToken;

mod logging;

/// Service name under which API keys are stored in the OS keychain.
const KEYCHAIN_SERVICE: &str = "com.ai-application-support.app";

/// Browser-like user agent so DuckDuckGo and typical websites serve normal
/// HTML instead of bot-blocking pages.
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// Shared HTTP clients, built once and reused so connection pools, DNS
/// lookups and TLS sessions persist between calls ("reqwest::Client" is an
/// internally reference-counted handle and cheap to clone).
#[derive(Clone)]
struct HttpClients {
    /// Client for chat/model endpoints. Deliberately has NO overall request
    /// timeout: streamed responses may legitimately run for many minutes and
    /// already end via "[DONE]"/"message_stop" or user cancellation, so only
    /// the connect phase is bounded.
    chat: reqwest::Client,
    /// Client for HTML scraping with a browser user agent and bounded
    /// redirects. Call sites apply their own per-request timeouts.
    scrape: reqwest::Client,
}

impl HttpClients {
    fn new() -> Result<Self, String> {
        let chat = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
        let scrape = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .user_agent(BROWSER_USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
        Ok(Self { chat, scrape })
    }
}

/// Upper bound on tool calls tracked for a single streamed response, so a
/// malformed stream advertising huge index values cannot balloon memory.
const MAX_STREAM_TOOL_CALLS: usize = 128;

/// Hard cap on page bytes handed to the HTML parser in "zen_fetch_page";
/// readable article content sits far below this and larger downloads would
/// only spend parse time on text that gets truncated away anyway.
const MAX_PAGE_BYTES: usize = 1024 * 1024;

/// Text-collection budget for "zen_fetch_page", slightly above the
/// 8000-character output cap so whitespace normalisation cannot undershoot.
const FETCH_TEXT_BUDGET_CHARS: usize = 9000;

// ──────────────────────────────────────────────
// Pre-parsed CSS selectors (compiled once, reused by every scrape call)
// ──────────────────────────────────────────────

static DDG_RESULT_SELECTOR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("div.result").expect("valid static selector"));
static DDG_TITLE_SELECTOR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("a.result__a").expect("valid static selector"));
static DDG_SNIPPET_SELECTOR: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("a.result__snippet, div.result__snippet").expect("valid static selector")
});
static FETCH_SKIP_SELECTOR: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse(
        "script, style, noscript, template, svg, nav, header, footer, aside, iframe, form",
    )
    .expect("valid static selector")
});
static FETCH_BODY_SELECTOR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("body").expect("valid static selector"));
static ZEN_TABLE_SELECTOR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("table").expect("valid static selector"));
static ZEN_ROW_SELECTOR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("tr").expect("valid static selector"));
static ZEN_CELL_SELECTOR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("th, td").expect("valid static selector"));

/// A single web search result.
#[derive(Serialize, Deserialize, Clone)]
pub struct WebResult {
    title: String,
    url: String,
    snippet: String,
}

/// OpenAI-compatible model list response: `{ "data": [{ "id": "..." }] }`.
#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

/// Build the full endpoint URL for the Anthropic API. Accepts the base URL
/// with or without a trailing `/v1` and appends the given path.
fn anthropic_endpoint(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    let base = base.strip_suffix("/v1").unwrap_or(base);
    format!("{base}/v1{path}")
}

/// Hard cap on automatic retries for HTTP 429 (rate limit) responses, and
/// the longest delay we are willing to wait based on a `Retry-After` header.
const MAX_RATE_LIMIT_RETRIES: u32 = 3;
const MAX_RETRY_AFTER_SECS: u64 = 30;

/// Whether a 429 response signals an exhausted quota (not retryable) rather
/// than a transient rate limit. Retrying quota errors would only waste calls.
fn is_quota_error(status: reqwest::StatusCode, body: &str) -> bool {
    if status != reqwest::StatusCode::TOO_MANY_REQUESTS {
        return false;
    }
    let lower = body.to_lowercase();
    lower.contains("free usage") || lower.contains("freeusagelimit") || lower.contains("quota")
}

/// Seconds to wait before retrying, from the `Retry-After` header (capped),
/// or `None` when the header is missing or unparsable.
fn retry_after_secs(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok())
        .map(|secs| secs.min(MAX_RETRY_AFTER_SECS))
}

/// Exponential backoff for retry attempt `attempt` (0-indexed): 1s, 2s, 4s.
fn backoff_secs(attempt: u32) -> u64 {
    [1, 2, 4]
        .get(attempt as usize)
        .copied()
        .unwrap_or(MAX_RETRY_AFTER_SECS)
}

fn friendly_rate_limit_message(status: reqwest::StatusCode, retry_after: Option<u64>) -> String {
    match retry_after {
        Some(secs) => format!(
            "Rate limit reached ({status}). Please try again in about {secs} seconds."
        ),
        None => format!("Rate limit reached ({status}). Please wait a moment and try again."),
    }
}

fn friendly_quota_message(status: reqwest::StatusCode) -> String {
    format!(
        "Free usage limit reached ({status}). The free allowance resets daily, so please try again later."
    )
}

/// Send a POST request to a provider endpoint, retrying HTTP 429 responses
/// up to `MAX_RATE_LIMIT_RETRIES` times with `Retry-After` or exponential
/// backoff. Quota-type 429s fail immediately with a friendly message; any
/// other non-2xx status fails with the usual API error text. Returns the
/// response only for a successful status. When a cancellation token is
/// supplied and it fires during a backoff wait, the request is aborted.
async fn send_with_retry(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    provider: &str,
    payload: &serde_json::Value,
    token: Option<&CancellationToken>,
) -> Result<reqwest::Response, String> {
    for attempt in 0..=MAX_RATE_LIMIT_RETRIES {
        let mut request = client.post(url).json(payload);
        if provider == "anthropic" {
            request = request
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01");
        } else {
            request = request.bearer_auth(api_key);
        }

        let response = request
            .send()
            .await
            .map_err(|e| format!("Network error: {e}"))?;

        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }

        let retry_after = retry_after_secs(&response);
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response: {e}"))?;

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            if is_quota_error(status, &body) {
                return Err(friendly_quota_message(status));
            }
            if attempt < MAX_RATE_LIMIT_RETRIES {
                if token.is_some_and(|t| t.is_cancelled()) {
                    return Err("Request cancelled.".to_string());
                }
                let wait = retry_after.unwrap_or_else(|| backoff_secs(attempt));
                // Abort promptly when cancellation fires during the wait,
                // instead of finishing the sleep and firing another API call.
                let cancelled = match token {
                    Some(t) => {
                        tokio::select! {
                            _ = tokio::time::sleep(Duration::from_secs(wait)) => false,
                            _ = t.cancelled() => true,
                        }
                    }
                    None => {
                        tokio::time::sleep(Duration::from_secs(wait)).await;
                        false
                    }
                };
                if cancelled {
                    return Err("Request cancelled.".to_string());
                }
                continue;
            }
            return Err(friendly_rate_limit_message(status, retry_after));
        }

        let snippet: String = body.chars().take(500).collect();
        return Err(format!("API error ({status}): {snippet}"));
    }
    Err("Rate limit retries exhausted.".to_string())
}

/// List available models from a `/models` endpoint (OpenAI-compatible shape:
/// `{ "data": [{ "id": "..." }] }`, which Anthropic also uses).
/// Used to populate the model dropdown.
#[tauri::command]
async fn zen_list_models(
    clients: State<'_, HttpClients>,
    base_url: String,
    api_key: String,
    provider: String,
) -> Result<Vec<String>, String> {
    let base = base_url.trim_end_matches('/').to_string();
    let url = if provider == "anthropic" {
        anthropic_endpoint(&base, "/models")
    } else {
        format!("{base}/models")
    };

    let mut request = clients.chat.get(&url);
    if !api_key.is_empty() {
        request = if provider == "anthropic" {
            request
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
        } else {
            request.bearer_auth(&api_key)
        };
    }

    let response = request
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Models endpoint returned HTTP {}", response.status()));
    }

    let parsed: ModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid response from models endpoint: {e}"))?;

    // Deduplicate and sort so the dropdown is stable for providers that
    // return repeated or unordered model ids.
    let mut models: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
    models.sort();
    models.dedup();
    Ok(models)
}

/// Forward a chat request to the configured provider's endpoint.
/// OpenAI-compatible providers use `/chat/completions` with a Bearer token;
/// Anthropic uses `/v1/messages` with `x-api-key` + `anthropic-version`.
/// Runs on the Rust side so the Tauri webview never hits CORS restrictions.
#[tauri::command]
async fn zen_chat(
    clients: State<'_, HttpClients>,
    base_url: String,
    api_key: String,
    provider: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let base = base_url.trim_end_matches('/').to_string();
    let url = if provider == "anthropic" {
        anthropic_endpoint(&base, "/messages")
    } else {
        format!("{base}/chat/completions")
    };

    // Overall cap for the one-shot (non-streaming) request, which has no
    // cancellation token; streaming runs without such a cap because its
    // progress and cancellation are observable.
    const NON_STREAM_TIMEOUT: Duration = Duration::from_secs(300);
    let send = send_with_retry(&clients.chat, &url, &api_key, &provider, &payload, None);
    let response = tokio::time::timeout(NON_STREAM_TIMEOUT, send)
        .await
        .map_err(|_| "Chat request timed out after 300 seconds.".to_string())??;

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    serde_json::from_str(&text).map_err(|e| format!("Invalid response from API: {e}"))
}

// ──────────────────────────────────────────────
// Streamed chat (SSE) with cancellation
// ──────────────────────────────────────────────

/// Registry of in-flight streaming requests, keyed by request id. Used so the
/// frontend can cancel a stream mid-generation (see zen_chat_stream_cancel).
#[derive(Clone, Default)]
struct StreamState(Arc<Mutex<HashMap<String, CancellationToken>>>);

impl StreamState {
    /// Lock the registry, recovering from poisoning: registry operations
    /// never leave the map in an invalid state, so a panic while a guard
    /// is held must not wedge cancellation and cleanup for every later
    /// request.
    fn lock(
        &self,
    ) -> std::sync::MutexGuard<'_, HashMap<String, CancellationToken>> {
        self.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

/// Events emitted to the frontend while a chat response streams in.
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ChatStreamEvent {
    /// A chunk of answer text (rendered live by the chat UI).
    Delta { text: String },
    /// The stream finished: `data` is the fully assembled response JSON in
    /// the same shape zen_chat returns (OpenAI or Anthropic).
    Done { data: serde_json::Value },
    /// The stream failed before completing.
    Error { message: String },
}

/// A tool call being assembled from OpenAI streaming deltas.
#[derive(Default)]
struct OpenAIToolCallAcc {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
}

/// A content block being assembled from Anthropic streaming events.
struct AnthropicBlockAcc {
    block_type: String,
    text: String,
    id: Option<String>,
    name: Option<String>,
    input_json: String,
}

/// Accumulates SSE events for one streamed response, in either the OpenAI or
/// the Anthropic wire format, and emits text deltas to the frontend.
struct StreamAccumulator {
    provider: String,
    openai_content: String,
    openai_tool_calls: Vec<OpenAIToolCallAcc>,
    openai_finish_reason: Option<String>,
    openai_finished: bool,
    anthropic_blocks: Vec<AnthropicBlockAcc>,
    anthropic_stop_reason: Option<String>,
    anthropic_finished: bool,
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
}

impl StreamAccumulator {
    fn new(provider: &str) -> Self {
        Self {
            provider: provider.to_string(),
            openai_content: String::new(),
            openai_tool_calls: Vec::new(),
            openai_finish_reason: None,
            openai_finished: false,
            anthropic_blocks: Vec::new(),
            anthropic_stop_reason: None,
            anthropic_finished: false,
            input_tokens: None,
            output_tokens: None,
        }
    }

    /// Record a provider usage object. OpenAI uses prompt/completion tokens;
    /// Anthropic uses input/output tokens. Streaming providers may send usage
    /// in a trailing chunk, so this is merged across events.
    fn record_usage(&mut self, usage: &serde_json::Value) {
        let read = |key: &str| usage.get(key).and_then(|value| value.as_u64());
        if let Some(input) = read("input_tokens").or_else(|| read("prompt_tokens")) {
            self.input_tokens = Some(input);
        }
        if let Some(output) = read("output_tokens").or_else(|| read("completion_tokens")) {
            self.output_tokens = Some(output);
        }
    }

    /// True once the response signals the end of the stream.
    fn is_finished(&self) -> bool {
        if self.provider == "anthropic" {
            self.anthropic_finished
        } else {
            self.openai_finished
        }
    }

    /// Process one SSE `data:` payload. Returns the answer-text delta to
    /// forward to the frontend, if this payload carried one.
    fn feed(&mut self, data: &str) -> Result<Option<String>, String> {
        if data == "[DONE]" {
            self.openai_finished = true;
            return Ok(None);
        }
        let parsed: serde_json::Value = serde_json::from_str(data)
            .map_err(|e| format!("Failed to parse streamed event: {e}"))?;
        // Both providers can emit an in-band error event after the stream has
        // started. Surface it instead of ending with an empty answer.
        if let Some(error) = parsed.get("error") {
            if !error.is_null() {
                let message = error
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("The provider reported a streaming error.");
                return Err(message.to_string());
            }
        }
        if self.provider == "anthropic" {
            self.feed_anthropic(&parsed)
        } else {
            self.feed_openai(&parsed)
        }
    }

    fn feed_openai(&mut self, parsed: &serde_json::Value) -> Result<Option<String>, String> {
        if let Some(usage) = parsed.get("usage") {
            if !usage.is_null() {
                self.record_usage(usage);
            }
        }
        let Some(choice) = parsed.pointer("/choices/0") else {
            return Ok(None);
        };
        if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
            self.openai_finish_reason = Some(reason.to_string());
            self.openai_finished = true;
        }
        let Some(delta) = choice.get("delta") else {
            return Ok(None);
        };

        let mut text_delta: Option<String> = None;
        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
            if !content.is_empty() {
                self.openai_content.push_str(content);
                text_delta = Some(content.to_string());
            }
        }

        if let Some(tool_calls) = delta.get("tool_calls").and_then(|t| t.as_array()) {
            for call in tool_calls {
                let index = call
                    .get("index")
                    .and_then(|i| i.as_u64())
                    .unwrap_or(0) as usize;
                // Guard against malformed streams advertising huge indices.
                if index >= MAX_STREAM_TOOL_CALLS {
                    continue;
                }
                while self.openai_tool_calls.len() <= index {
                    self.openai_tool_calls
                        .push(OpenAIToolCallAcc::default());
                }
                let acc = &mut self.openai_tool_calls[index];
                if let Some(id) = call.get("id").and_then(|i| i.as_str()) {
                    acc.id = Some(id.to_string());
                }
                if let Some(name) = call
                    .pointer("/function/name")
                    .and_then(|n| n.as_str())
                {
                    acc.name = Some(name.to_string());
                }
                if let Some(args) = call
                    .pointer("/function/arguments")
                    .and_then(|a| a.as_str())
                {
                    acc.arguments.push_str(args);
                }
            }
        }
        Ok(text_delta)
    }

    fn feed_anthropic(&mut self, parsed: &serde_json::Value) -> Result<Option<String>, String> {
        let event_type = parsed
            .get("type")
            .and_then(|t| t.as_str())
            .unwrap_or("");
        match event_type {
            "message_start" => {
                if let Some(usage) = parsed.pointer("/message/usage") {
                    self.record_usage(usage);
                }
            }
            "content_block_start" => {
                let block = parsed.get("content_block").cloned().unwrap_or_default();
                let block_type = block
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("text")
                    .to_string();
                let mut acc = AnthropicBlockAcc {
                    block_type,
                    text: String::new(),
                    id: block
                        .get("id")
                        .and_then(|i| i.as_str())
                        .map(|s| s.to_string()),
                    name: block
                        .get("name")
                        .and_then(|n| n.as_str())
                        .map(|s| s.to_string()),
                    input_json: String::new(),
                };
                if acc.block_type != "tool_use" {
                    acc.id = None;
                    acc.name = None;
                }
                self.anthropic_blocks.push(acc);
            }
            "content_block_delta" => {
                let delta = parsed.get("delta").cloned().unwrap_or_default();
                match delta
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                {
                    "text_delta" => {
                        let text = delta
                            .get("text")
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        if !text.is_empty() {
                            if let Some(last) = self.anthropic_blocks.last_mut() {
                                last.text.push_str(text);
                            } else {
                                self.anthropic_blocks.push(AnthropicBlockAcc {
                                    block_type: "text".to_string(),
                                    text: text.to_string(),
                                    id: None,
                                    name: None,
                                    input_json: String::new(),
                                });
                            }
                            return Ok(Some(text.to_string()));
                        }
                    }
                    "input_json_delta" => {
                        let partial = delta
                            .get("partial_json")
                            .and_then(|p| p.as_str())
                            .unwrap_or("");
                        if let Some(last) = self.anthropic_blocks.last_mut() {
                            last.input_json.push_str(partial);
                        }
                    }
                    _ => {}
                }
            }
            "message_delta" => {
                if let Some(usage) = parsed.get("usage") {
                    self.record_usage(usage);
                }
                if let Some(stop) = parsed
                    .pointer("/delta/stop_reason")
                    .and_then(|r| r.as_str())
                {
                    self.anthropic_stop_reason = Some(stop.to_string());
                }
            }
            "message_stop" => {
                self.anthropic_finished = true;
            }
            _ => {}
        }
        Ok(None)
    }

    /// Assemble the final response JSON in the same shape the non-streaming
    /// zen_chat command returns.
    fn finish(&self) -> serde_json::Value {
        if self.provider == "anthropic" {
            let content: Vec<serde_json::Value> = self
                .anthropic_blocks
                .iter()
                .map(|block| {
                    if block.block_type == "tool_use" {
                        let input: serde_json::Value =
                            serde_json::from_str(&block.input_json)
                                .unwrap_or_else(|_| serde_json::json!({}));
                        serde_json::json!({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": input,
                        })
                    } else {
                        serde_json::json!({ "type": "text", "text": block.text })
                    }
                })
                .collect();
            serde_json::json!({
                "content": content,
                "stop_reason": self.anthropic_stop_reason,
                "usage": {
                    "input_tokens": self.input_tokens,
                    "output_tokens": self.output_tokens,
                },
            })
        } else {
            let content = if self.openai_content.is_empty() {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(self.openai_content.clone())
            };
            let tool_calls: Vec<serde_json::Value> = self
                .openai_tool_calls
                .iter()
                .filter(|c| c.id.is_some() && c.name.is_some())
                .map(|c| {
                    serde_json::json!({
                        "id": c.id,
                        "type": "function",
                        "function": { "name": c.name, "arguments": c.arguments },
                    })
                })
                .collect();
            serde_json::json!({
                "choices": [{
                    "finish_reason": self.openai_finish_reason,
                    "message": {
                        "content": content,
                        "tool_calls": if tool_calls.is_empty() {
                            serde_json::Value::Null
                        } else {
                            serde_json::Value::Array(tool_calls)
                        },
                    }
                }],
                "usage": {
                    "input_tokens": self.input_tokens,
                    "output_tokens": self.output_tokens,
                },
            })
        }
    }
}

/// A streamed provider response that stops producing bytes for this long is
/// treated as dead. Without this a silently stalled connection can leave the
/// UI spinning forever.
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

/// Read an SSE response body chunk-by-chunk, feed events into the
/// accumulator (emitting text deltas as they arrive), and finish with the
/// fully assembled response. When `token` is cancelled, the HTTP connection
/// is dropped and whatever text was accumulated so far is still delivered.
async fn stream_sse(
    response: reqwest::Response,
    provider: &str,
    on_event: &Channel<ChatStreamEvent>,
    token: &CancellationToken,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();
    let mut event_data = String::new();
    let mut acc = StreamAccumulator::new(provider);

    let consume = async {
        loop {
            let next = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next())
                .await
                .map_err(|_| {
                    "No data was received from the model for 120 seconds, so the request was cancelled."
                        .to_string()
                })?;
            let Some(chunk) = next else {
                break;
            };
            let chunk = chunk
                .map_err(|e| format!("Failed to read response stream: {e}"))?;
            buffer.extend_from_slice(&chunk);
            loop {
                let Some(pos) = buffer.iter().position(|&b| b == b'\n') else {
                    break;
                };
                let line: Vec<u8> = buffer.drain(..=pos).collect();
                let line = String::from_utf8_lossy(&line);
                let line = line.trim_end_matches(['\r', '\n']);
                if line.is_empty() {
                    if !event_data.is_empty() {
                        if let Some(delta) = acc.feed(&event_data)? {
                            on_event
                                .send(ChatStreamEvent::Delta { text: delta })
                                .map_err(|e| format!("Failed to send stream event: {e}"))?;
                        }
                        event_data.clear();
                        if acc.is_finished() {
                            return Ok::<(), String>(());
                        }
                    }
                } else if let Some(data) = line.strip_prefix("data:") {
                    if !event_data.is_empty() {
                        event_data.push('\n');
                    }
                    event_data.push_str(data.trim_start());
                }
                // "event:", "id:" and "retry:" lines are ignored.
            }
        }
        // A trailing event that was not terminated by a blank line.
        if !event_data.is_empty() {
            if let Some(delta) = acc.feed(&event_data)? {
                on_event
                    .send(ChatStreamEvent::Delta { text: delta })
                    .map_err(|e| format!("Failed to send stream event: {e}"))?;
            }
        }
        Ok::<(), String>(())
    };

    tokio::select! {
        biased;
        _ = token.cancelled() => {}
        result = consume => result?,
    }

    on_event
        .send(ChatStreamEvent::Done {
            data: acc.finish(),
        })
        .map_err(|e| format!("Failed to send stream event: {e}"))
}

/// Send a chat request with `stream: true` and forward the response to the
/// frontend via `on_event`. Returns the fully assembled response JSON in the
/// same shape zen_chat returns (works for providers that ignore streaming
/// and reply with a plain JSON body).
async fn run_stream(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    provider: &str,
    payload: &serde_json::Value,
    on_event: &Channel<ChatStreamEvent>,
    token: &CancellationToken,
) -> Result<(), String> {
    let base = base_url.trim_end_matches('/').to_string();
    let url = if provider == "anthropic" {
        anthropic_endpoint(&base, "/messages")
    } else {
        format!("{base}/chat/completions")
    };

    // Retried on HTTP 429 with backoff. Retries happen while the initial
    // request is rejected, before any SSE data has been emitted, so a retried
    // stream is indistinguishable from a slow first response.
    let response = send_with_retry(client, &url, api_key, provider, payload, Some(token)).await?;

    // Providers that ignore `stream: true` answer with a plain JSON body;
    // treat anything that is not text/event-stream as such.
    let is_sse = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("text/event-stream"))
        .unwrap_or(true);

    if is_sse {
        return stream_sse(response, provider, on_event, token).await;
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;
    let data: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid response from API: {e}"))?;
    on_event
        .send(ChatStreamEvent::Done { data })
        .map_err(|e| format!("Failed to send stream event: {e}"))
}

/// Unique ids for in-flight streaming requests.
static STREAM_COUNTER: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

fn stream_request_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(
        "{nanos}-{}",
        STREAM_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    )
}

/// Start a streamed chat request. Returns a request id immediately; response
/// chunks arrive as events on `on_event` (`delta` / `done` / `error`).
#[tauri::command]
fn zen_chat_stream(
    clients: State<'_, HttpClients>,
    base_url: String,
    api_key: String,
    provider: String,
    payload: serde_json::Value,
    on_event: Channel<ChatStreamEvent>,
    state: State<'_, StreamState>,
) -> Result<String, String> {
    let id = stream_request_id();
    let token = CancellationToken::new();
    state.lock().insert(id.clone(), token.clone());

    let chat_client = clients.inner().clone();
    let registry = state.inner().clone();
    let task_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_stream(
            &chat_client.chat,
            &base_url,
            &api_key,
            &provider,
            &payload,
            &on_event,
            &token,
        )
        .await;
        if let Err(message) = result {
            let _ = on_event.send(ChatStreamEvent::Error { message });
        }
        registry.lock().remove(&task_id);
    });

    Ok(id)
}

/// Cancel an in-flight streaming request started by zen_chat_stream. The
/// HTTP connection is closed and any text accumulated so far is delivered as
/// a final `done` event. No-op when the request already finished.
#[tauri::command]
fn zen_chat_stream_cancel(
    id: String,
    state: State<'_, StreamState>,
) -> Result<(), String> {
    if let Some(token) = state.lock().remove(&id) {
        token.cancel();
    }
    Ok(())
}

/// Search the web via DuckDuckGo's HTML endpoint and return the top ~5 results,
/// so the chat agent can research companies with current information.
#[tauri::command]
async fn zen_web_search(
    clients: State<'_, HttpClients>,
    query: String,
) -> Result<Vec<WebResult>, String> {
    let url = reqwest::Url::parse_with_params(
        "https://html.duckduckgo.com/html/",
        &[("q", query.as_str())],
    )
    .map_err(|e| format!("Failed to build search URL: {e}"))?;

    let response = clients
        .scrape
        .get(url)
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Search endpoint returned HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read search results: {e}"))?;

    let document = scraper::Html::parse_document(&html);

    let mut results = Vec::new();
    for result in document.select(&DDG_RESULT_SELECTOR).take(5) {
        let mut title = String::new();
        let mut url = String::new();
        if let Some(a) = result.select(&DDG_TITLE_SELECTOR).next() {
            title = a.text().collect::<String>().trim().to_string();
            if let Some(href) = a.value().attr("href") {
                url = decode_duckduckgo_href(href);
            }
        }
        if url.is_empty() {
            continue;
        }
        let snippet = result
            .select(&DDG_SNIPPET_SELECTOR)
            .next()
            .map(|s| s.text().collect::<String>().trim().to_string())
            .unwrap_or_default();
        results.push(WebResult {
            title,
            url,
            snippet,
        });
    }

    Ok(results)
}

/// DuckDuckGo result links are redirect URLs (`//duckduckgo.com/l/?uddg=<real url>`);
/// extract the real target when present, otherwise return the link as-is.
fn decode_duckduckgo_href(href: &str) -> String {
    let full = if let Some(rest) = href.strip_prefix("//") {
        format!("https:{rest}")
    } else if let Some(rest) = href.strip_prefix('/') {
        format!("https://duckduckgo.com{rest}")
    } else {
        href.to_string()
    };

    match reqwest::Url::parse(&full) {
        Ok(parsed) => {
            for (key, value) in parsed.query_pairs() {
                if key == "uddg" {
                    return value.to_string();
                }
            }
            parsed.to_string()
        }
        Err(_) => href.to_string(),
    }
}

/// Recursively collect visible text from a node tree, skipping elements that
/// match `skip` (script, style, nav, etc.). Stops early — returning true —
/// once `budget` characters have been gathered: page content worth reading
/// sits at the top of the document, so walking the rest of a huge DOM only
/// wastes time on text that would be truncated anyway.
fn collect_text(
    node: NodeRef<'_, Node>,
    skip: &Selector,
    out: &mut Vec<String>,
    collected: &mut usize,
    budget: usize,
) -> bool {
    if *collected >= budget {
        return true;
    }
    if node.value().is_element() {
        if let Some(el) = ElementRef::wrap(node) {
            if skip.matches(&el) {
                return false;
            }
            for child in el.children() {
                if collect_text(child, skip, out, collected, budget) {
                    return true;
                }
            }
        }
        return false;
    }
    if let Node::Text(text) = node.value() {
        let t = text.text.trim();
        if !t.is_empty() {
            *collected += t.chars().count();
            out.push(t.to_string());
            if *collected >= budget {
                return true;
            }
        }
    }
    false
}

/// Maximum number of HTTP redirects "zen_fetch_page" will follow. Every hop is
/// re-validated so a public URL cannot bounce the request onto localhost or a
/// cloud metadata endpoint.
const MAX_FETCH_REDIRECTS: usize = 5;

/// True when an address is loopback, private, link-local or otherwise not a
/// normal public internet destination. Chat models can be talked into fetching
/// arbitrary URLs, so the page tool must never reach the user's LAN, the local
/// machine, or a cloud metadata service.
fn is_internal_ipv4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || ip.is_unspecified()
        || o[0] == 0 // "this network" 0.0.0.0/8
        || (o[0] == 100 && (64..=127).contains(&o[1])) // CGNAT 100.64.0.0/10
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19)) // benchmarking 198.18.0.0/15
        || (o[0] == 192 && o[1] == 0 && o[2] == 0) // IETF assignments 192.0.0.0/24
        || o[0] >= 240 // reserved 240.0.0.0/4
}

fn is_internal_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_internal_ipv4(ip),
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
                return true;
            }
            if (segments[0] & 0xfe00) == 0xfc00 // unique local fc00::/7
                || (segments[0] & 0xffc0) == 0xfe80 // link local fe80::/10
                || (segments[0] & 0xffc0) == 0xfec0 // deprecated site local fec0::/10
                || (segments[0] == 0x2001 && segments[1] == 0x0db8)
            // documentation 2001:db8::/32
            {
                return true;
            }

            // Wrapped IPv4 forms: ::ffff:a.b.c.d (mapped), the deprecated
            // ::a.b.c.d (compatible), 64:ff9b::/96 (NAT64) and 2002::/16
            // (6to4) all tunnel an IPv4 address that may itself be internal.
            let bytes = ip.octets();
            let mapped = bytes[..10].iter().all(|b| *b == 0)
                && bytes[10] == 0xff
                && bytes[11] == 0xff;
            let compatible = bytes[..12].iter().all(|b| *b == 0)
                && !(bytes[12] == 0
                    && bytes[13] == 0
                    && bytes[14] == 0
                    && (bytes[15] == 0 || bytes[15] == 1));
            let nat64 = segments[0] == 0x0064
                && segments[1] == 0xff9b
                && segments[2..6].iter().all(|s| *s == 0);
            let six_to_four = bytes[0] == 0x20 && bytes[1] == 0x02;

            if mapped || compatible || nat64 {
                return is_internal_ipv4(Ipv4Addr::new(bytes[12], bytes[13], bytes[14], bytes[15]));
            }
            if six_to_four {
                return is_internal_ipv4(Ipv4Addr::new(bytes[2], bytes[3], bytes[4], bytes[5]));
            }
            false
        }
    }
}

/// Validate the static parts of a fetch URL: scheme, credentials, port and
/// literal IP addresses. DNS names are checked separately once resolved.
fn validate_fetch_url(url: &reqwest::Url) -> Result<(String, u16), String> {
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Unsupported URL scheme: {scheme}"));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URLs with embedded credentials are not allowed".to_string());
    }
    let host = url
        .host_str()
        .map(|h| h.trim_start_matches('[').trim_end_matches(']'))
        .filter(|h| !h.is_empty())
        .ok_or_else(|| "URL has no host".to_string())?;
    // 80/443 only: public sites live there, while internal services tend to
    // listen on high ports that would otherwise widen the SSRF surface.
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "URL has no known port".to_string())?;
    if port != 80 && port != 443 {
        return Err(format!("Only ports 80 and 443 can be fetched, got {port}"));
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_internal_ip(ip) {
            return Err("Refusing to fetch a local or private network address".to_string());
        }
    }
    Ok((host.to_string(), port))
}

/// Resolve a hostname and reject the whole host when any answer is internal.
/// Mixed public/private answers are a classic DNS-rebinding setup, so one bad
/// address is enough to refuse the request.
async fn resolve_public_addrs(host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
    let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| format!("Could not resolve {host}: {e}"))?
        .collect();
    if addrs.is_empty() {
        return Err(format!("{host} did not resolve to any address"));
    }
    if addrs.iter().any(|addr| is_internal_ip(addr.ip())) {
        return Err(
            "Refusing to fetch a hostname that resolves to a local or private network".to_string(),
        );
    }
    Ok(addrs)
}

/// Send one validated GET and return the response, pinning the connection to
/// the addresses that were just checked. Pinning closes the TOCTOU window where
/// reqwest would resolve the name a second time and could be handed a private
/// address by a rebinding DNS server.
async fn send_fetch_request(url: &reqwest::Url) -> Result<reqwest::Response, String> {
    let (host, port) = validate_fetch_url(url)?;
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .user_agent(BROWSER_USER_AGENT)
        .redirect(reqwest::redirect::Policy::none());
    if host.parse::<IpAddr>().is_err() {
        let addrs = resolve_public_addrs(&host, port).await?;
        builder = builder.resolve_to_addrs(&host, &addrs);
    }
    let client = builder
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
    client
        .get(url.clone())
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))
}

/// Fetch a web page and return its plain text (tags stripped, ~8000 chars max),
/// so the chat agent can read an actual company page.
#[tauri::command]
async fn zen_fetch_page(url: String) -> Result<String, String> {
    let mut current =
        reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;

    // Follow redirects by hand so every hop passes the same public-address
    // checks. reqwest's automatic redirects would happily visit localhost.
    let mut redirects = 0usize;
    let mut response = loop {
        let candidate = send_fetch_request(&current).await?;
        if !candidate.status().is_redirection() {
            break candidate;
        }
        if redirects >= MAX_FETCH_REDIRECTS {
            return Err(format!(
                "Page redirected more than {MAX_FETCH_REDIRECTS} times"
            ));
        }
        redirects += 1;
        let location = candidate
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| "Redirect response had no Location header".to_string())?;
        current = current
            .join(location)
            .map_err(|e| format!("Invalid redirect URL: {e}"))?;
    };

    if !response.status().is_success() {
        return Err(format!("Page returned HTTP {}", response.status()));
    }

    // Read at most MAX_PAGE_BYTES before parsing. Huge pages would spend
    // seconds inside the HTML parser only for their text to be truncated away.
    let mut html_bytes: Vec<u8> = Vec::with_capacity(64 * 1024);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Failed to read page: {e}"))?
    {
        if html_bytes.len() + chunk.len() >= MAX_PAGE_BYTES {
            let remaining = MAX_PAGE_BYTES - html_bytes.len();
            html_bytes.extend_from_slice(&chunk[..remaining]);
            break;
        }
        html_bytes.extend_from_slice(&chunk);
    }
    let html = String::from_utf8_lossy(&html_bytes);

    let document = scraper::Html::parse_document(&html);

    // Stop collecting as soon as we hold more text than the output cap:
    // everything past that point would be truncated away regardless.
    let mut parts: Vec<String> = Vec::new();
    let mut collected = 0usize;
    if let Some(body) = document.select(&FETCH_BODY_SELECTOR).next() {
        for child in body.children() {
            if collect_text(
                child,
                &FETCH_SKIP_SELECTOR,
                &mut parts,
                &mut collected,
                FETCH_TEXT_BUDGET_CHARS,
            ) {
                break;
            }
        }
    }
    let text = parts
        .iter()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    Ok(text.chars().take(8000).collect())
}

/// A single Zen pricing entry scraped from https://opencode.ai/docs/zen.
#[derive(Serialize, Deserialize, Clone)]
pub struct ZenPricingEntry {
    id: String,
    /// Human-readable display name from the docs endpoints table ("Model"
    /// column), e.g. "claude-sonnet-4-5" -> "Claude Sonnet 4.5". Absent in
    /// older caches and when the endpoints table could not be parsed.
    #[serde(default)]
    name: Option<String>,
    input: Option<f64>,
    output: Option<f64>,
    is_free: bool,
}

/// Parse a pricing cell like "$0.30", "Free" or "-" into (price, is_free).
fn parse_zen_price(text: &str) -> (Option<f64>, bool) {
    let t = text.trim().to_lowercase();
    if t == "free" {
        return (None, true);
    }
    let cleaned = t.trim_start_matches('$').replace(',', "").replace(' ', "");
    match cleaned.parse::<f64>() {
        Ok(v) => (Some(v), false),
        Err(_) => (None, false),
    }
}

/// Fetch the OpenCode Zen pricing table from the docs page and return it as
/// model-id → price entries. Display names are slugified to model IDs
/// (lowercase, spaces to dashes); parenthetical price bands such as
/// "(≤ 200K tokens)" are dropped, keeping the first (base) row per model.
#[tauri::command]
async fn zen_fetch_zen_pricing(clients: State<'_, HttpClients>) -> Result<Vec<ZenPricingEntry>, String> {
    let response = clients
        .scrape
        .get("https://opencode.ai/docs/zen")
        .timeout(Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Pricing page returned HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read pricing page: {e}"))?;

    let document = scraper::Html::parse_document(&html);

    let cell_text = |el: ElementRef| -> String {
        el.text().collect::<String>().trim().to_string()
    };

    // Table helper: returns the table whose first-row cells contain all the
    // given keywords (case-insensitive).
    let find_table = |keywords: &[&str]| -> Option<ElementRef> {
        document.select(&ZEN_TABLE_SELECTOR).find(|table| {
            let header: String = table
                .select(&ZEN_CELL_SELECTOR)
                .take(6)
                .map(cell_text)
                .collect::<Vec<_>>()
                .join(" ")
                .to_lowercase();
            keywords.iter().all(|k| header.contains(k))
        })
    };

    // The endpoints table maps display names to official model IDs
    // (e.g. "Claude Sonnet 4.5" -> "claude-sonnet-4-5"). Both directions are
    // built in this single ordered pass so that the first display name seen
    // for an id always wins, independent of HashMap iteration order.
    let mut name_to_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut id_to_name: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    if let Some(endpoints) = find_table(&["model", "id"]) {
        for row in endpoints.select(&ZEN_ROW_SELECTOR) {
            let cells: Vec<String> =
                row.select(&ZEN_CELL_SELECTOR).map(cell_text).collect();
            if cells.len() >= 2 && !cells[0].is_empty() && !cells[1].is_empty() {
                id_to_name
                    .entry(cells[1].clone())
                    .or_insert_with(|| cells[0].clone());
                name_to_id.insert(cells[0].clone(), cells[1].clone());
            }
        }
    }

    let table = find_table(&["input", "output"])
        .ok_or_else(|| "Could not find the pricing table on the Zen docs page.".to_string())?;

    let mut entries: Vec<ZenPricingEntry> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for row in table.select(&ZEN_ROW_SELECTOR) {
        let cells: Vec<String> =
            row.select(&ZEN_CELL_SELECTOR).map(cell_text).collect();
        if cells.len() < 3 {
            continue;
        }
        // Strip price-band parentheticals, e.g. "Claude Sonnet 4.5 (≤ 200K tokens)".
        let name = cells[0].split('(').next().unwrap_or("").trim();
        let id = name_to_id
            .get(name)
            .cloned()
            .unwrap_or_else(|| name.to_lowercase().replace(' ', "-"));
        if id.is_empty() || id == "model" || seen.contains(&id) {
            continue;
        }
        let (input, input_free) = parse_zen_price(&cells[1]);
        let (output, output_free) = parse_zen_price(&cells[2]);
        seen.insert(id.clone());
        let model_name = id_to_name.get(&id).cloned();
        entries.push(ZenPricingEntry {
            id,
            name: model_name,
            input,
            output,
            is_free: input_free || output_free,
        });
    }

    if entries.is_empty() {
        return Err("No pricing rows found on the Zen docs page.".to_string());
    }

    Ok(entries)
}

// ──────────────────────────────────────────────
// Crash-safe JSON data files
// ──────────────────────────────────────────────

/// Upper bound for one JSON data file accepted from the frontend. Everything
/// this app stores is text; a file this large is either a bug or an attack.
const MAX_DATA_FILE_BYTES: u64 = 32 * 1024 * 1024;

/// Counter used to make temporary file names unique within a process.
static DATA_FILE_TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Result of loading a data file. `recovered` is true when the main file was
/// missing or damaged and the `.bak` copy was used instead.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDataFileResult {
    data: Option<serde_json::Value>,
    recovered: bool,
    error: Option<String>,
}

enum DataFileRead {
    Missing,
    Invalid(String),
    Valid(serde_json::Value),
}

/// Reject anything that is not a plain `*.json` file name in the app data
/// directory. This blocks path traversal and accidental subdirectory writes
/// before the path is ever joined.
fn validate_data_file_name(name: &str) -> Result<(), String> {
    if name.len() > 160 {
        return Err("Data file name is too long.".to_string());
    }
    let Some(stem) = name.strip_suffix(".json") else {
        return Err(format!("Refusing to access \"{name}\": not a .json file."));
    };
    if stem.is_empty() || stem == "." || stem == ".." {
        return Err(format!("Refusing to access \"{name}\": invalid file name."));
    }
    if !stem
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(format!(
            "Refusing to access \"{name}\": only letters, digits, '.', '_' and '-' are allowed."
        ));
    }
    Ok(())
}

fn app_data_file_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    validate_data_file_name(name)?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve the app data directory: {err}"))?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Could not create {}: {err}", dir.display()))?;
    Ok(dir.join(name))
}

fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".bak");
    PathBuf::from(name)
}

fn timestamp_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

fn temp_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    let counter = DATA_FILE_TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    path.with_file_name(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        counter
    ))
}

/// Read and parse one file into the three states the loader cares about.
/// Missing files are a normal first-run state; invalid JSON is recoverable
/// through the backup; I/O errors are fatal for this load.
fn read_json_file(path: &Path) -> Result<DataFileRead, String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DataFileRead::Missing)
        }
        Err(err) => {
            return Err(format!("Could not inspect {}: {err}", path.display()));
        }
    };
    if metadata.len() > MAX_DATA_FILE_BYTES {
        return Err(format!(
            "{} is larger than the {} MB data-file limit.",
            path.display(),
            MAX_DATA_FILE_BYTES / 1024 / 1024
        ));
    }
    let bytes = fs::read(path).map_err(|err| format!("Could not read {}: {err}", path.display()))?;
    match serde_json::from_slice(&bytes) {
        Ok(value) => Ok(DataFileRead::Valid(value)),
        Err(err) => Ok(DataFileRead::Invalid(err.to_string())),
    }
}

/// Move a damaged file aside instead of deleting it, so a user (or support
/// session) can still recover its contents by hand.
fn quarantine_file(path: &Path) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    let target = path.with_file_name(format!(
        "{file_name}.corrupt-{}.json",
        timestamp_nanos()
    ));
    fs::rename(path, &target)
        .map_err(|err| format!("Could not quarantine {}: {err}", path.display()))?;
    Ok(target)
}

fn describe_quarantine(path: Option<&Path>) -> String {
    match path {
        Some(path) => format!("a copy was kept at {}", path.display()),
        None => "the damaged file could not be moved aside".to_string(),
    }
}

/// Load a data file, transparently restoring it from the `.bak` copy when the
/// main file is missing or invalid. A corrupt main file is quarantined, never
/// overwritten in place, and the last known-good backup is preserved.
fn load_data_file_at(path: &Path) -> Result<LoadDataFileResult, String> {
    let backup = backup_path(path);
    match read_json_file(path)? {
        DataFileRead::Valid(value) => Ok(LoadDataFileResult {
            data: Some(value),
            recovered: false,
            error: None,
        }),
        DataFileRead::Missing => match read_json_file(&backup)? {
            DataFileRead::Valid(value) => {
                fs::copy(&backup, path).map_err(|err| {
                    format!(
                        "Recovered data from {}, but could not restore {}: {err}",
                        backup.display(),
                        path.display()
                    )
                })?;
                Ok(LoadDataFileResult {
                    data: Some(value),
                    recovered: true,
                    error: None,
                })
            }
            DataFileRead::Invalid(backup_error) => {
                let quarantined = quarantine_file(&backup).ok();
                Ok(LoadDataFileResult {
                    data: None,
                    recovered: false,
                    error: Some(format!(
                        "{} is missing and its backup is not valid JSON ({backup_error}); {}.",
                        path.display(),
                        describe_quarantine(quarantined.as_deref())
                    )),
                })
            }
            DataFileRead::Missing => Ok(LoadDataFileResult {
                data: None,
                recovered: false,
                error: None,
            }),
        },
        DataFileRead::Invalid(main_error) => match read_json_file(&backup)? {
            DataFileRead::Valid(value) => {
                let quarantined = quarantine_file(path).ok();
                fs::copy(&backup, path).map_err(|err| {
                    format!(
                        "Recovered data from {}, but could not restore {}: {err}",
                        backup.display(),
                        path.display()
                    )
                })?;
                let _ = quarantined;
                Ok(LoadDataFileResult {
                    data: Some(value),
                    recovered: true,
                    error: None,
                })
            }
            DataFileRead::Invalid(backup_error) => {
                let main_quarantine = quarantine_file(path).ok();
                let backup_quarantine = quarantine_file(&backup).ok();
                Ok(LoadDataFileResult {
                    data: None,
                    recovered: false,
                    error: Some(format!(
                        "{} is not valid JSON ({main_error}) and neither is its backup ({backup_error}); {} and {}.",
                        path.display(),
                        describe_quarantine(main_quarantine.as_deref()),
                        describe_quarantine(backup_quarantine.as_deref())
                    )),
                })
            }
            DataFileRead::Missing => {
                let quarantined = quarantine_file(path).ok();
                Ok(LoadDataFileResult {
                    data: None,
                    recovered: false,
                    error: Some(format!(
                        "{} is not valid JSON ({main_error}) and no backup exists; {}.",
                        path.display(),
                        describe_quarantine(quarantined.as_deref())
                    )),
                })
            }
        },
    }
}

#[cfg(unix)]
fn sync_directory(dir: &Path) {
    if let Ok(handle) = fs::File::open(dir) {
        let _ = handle.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_directory(_dir: &Path) {}

/// Write `bytes` to `path` via a synced temporary file, preserving the last
/// valid file as `path.bak`. The destination is never truncated in place.
///
/// Ordering: write+sync temp -> verify/rotate main to .bak -> rename temp over
/// main. A crash between the last two steps leaves the backup recoverable on
/// the next launch.
fn save_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 > MAX_DATA_FILE_BYTES {
        return Err(format!(
            "Refusing to write {}: data is larger than the {} MB limit.",
            path.display(),
            MAX_DATA_FILE_BYTES / 1024 / 1024
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid data file path: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|err| format!("Could not create {}: {err}", parent.display()))?;

    let temp = temp_path(path);
    let result = (|| -> Result<(), String> {
        {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(|err| format!("Could not create {}: {err}", temp.display()))?;
            file.write_all(bytes)
                .map_err(|err| format!("Could not write {}: {err}", temp.display()))?;
            file.sync_all()
                .map_err(|err| format!("Could not flush {}: {err}", temp.display()))?;
        }

        let backup = backup_path(path);
        if path.exists() {
            match read_json_file(path)? {
                DataFileRead::Valid(_) => {
                    if backup.exists() {
                        fs::remove_file(&backup).map_err(|err| {
                            format!("Could not replace backup {}: {err}", backup.display())
                        })?;
                    }
                    fs::rename(path, &backup).map_err(|err| {
                        format!("Could not rotate {} to backup: {err}", path.display())
                    })?;
                }
                DataFileRead::Invalid(_) | DataFileRead::Missing => {
                    // Never let a corrupt main file destroy the last known-good
                    // backup: move it aside instead of rotating it over .bak.
                    let _ = quarantine_file(path);
                }
            }
        }

        if let Err(err) = fs::rename(&temp, path) {
            // Put the old version back if the final rename failed, so a failed
            // save does not leave the main file missing until the next load.
            if !path.exists() && backup.exists() {
                let _ = fs::rename(&backup, path);
            }
            return Err(format!("Could not replace {}: {err}", path.display()));
        }
        sync_directory(parent);
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[tauri::command]
async fn load_data_file(
    app: tauri::AppHandle,
    name: String,
) -> Result<LoadDataFileResult, String> {
    let path = app_data_file_path(&app, &name)?;
    tauri::async_runtime::spawn_blocking(move || load_data_file_at(&path))
        .await
        .map_err(|err| format!("Data load task failed: {err}"))?
}

#[tauri::command]
async fn save_data_file(
    app: tauri::AppHandle,
    name: String,
    data: serde_json::Value,
) -> Result<(), String> {
    let path = app_data_file_path(&app, &name)?;
    let bytes = serde_json::to_vec_pretty(&data)
        .map_err(|err| format!("Could not serialize {name}: {err}"))?;
    tauri::async_runtime::spawn_blocking(move || save_bytes_atomic(&path, &bytes))
        .await
        .map_err(|err| format!("Data save task failed: {err}"))?
}

#[tauri::command]
async fn delete_data_file(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let path = app_data_file_path(&app, &name)?;
    let backup = backup_path(&path);
    tauri::async_runtime::spawn_blocking(move || {
        for target in [path, backup] {
            match fs::remove_file(&target) {
                Ok(()) => {}
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                Err(err) => {
                    return Err(format!("Could not delete {}: {err}", target.display()));
                }
            }
        }
        Ok(())
    })
    .await
    .map_err(|err| format!("Data delete task failed: {err}"))?
}

// ──────────────────────────────────────────────
// Backup file dialogs
// ──────────────────────────────────────────────

/// Upper bound for a backup file. Chat threads plus profile data stay far
/// below this; a larger file is not something this app produced.
const MAX_BACKUP_FILE_BYTES: u64 = 64 * 1024 * 1024;

fn sanitize_backup_name(name: &str) -> String {
    let base = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let base = if base.is_empty() {
        "ai-application-support-backup.json".to_string()
    } else {
        base
    };
    if base.to_ascii_lowercase().ends_with(".json") {
        base
    } else {
        format!("{base}.json")
    }
}

fn ensure_json_extension(path: &Path) -> Result<(), String> {
    let is_json = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"));
    if !is_json {
        return Err("Backup files must use the .json extension.".to_string());
    }
    Ok(())
}

/// Write a user-selected backup to disk. This is intentionally separate from
/// the atomic data-file writer: a backup is a one-off export, not the app's
/// live state, so it must not create a `.bak` next to the user's chosen file.
fn write_text_file_atomic(path: &Path, contents: &str) -> Result<(), String> {
    write_bytes_file_atomic(path, contents.as_bytes())
}

fn write_bytes_file_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("Invalid export path: {}", path.display()))?;
    if !parent.is_dir() {
        return Err(format!("The folder {} does not exist.", parent.display()));
    }
    if path.is_dir() {
        return Err(format!("{} is a folder, not a file.", path.display()));
    }
    let temp = temp_path(path);
    let result = (|| -> Result<(), String> {
        {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(|err| format!("Could not create {}: {err}", temp.display()))?;
            file.write_all(contents)
                .map_err(|err| format!("Could not write {}: {err}", temp.display()))?;
            file.sync_all()
                .map_err(|err| format!("Could not flush {}: {err}", temp.display()))?;
        }
        if path.exists() {
            fs::remove_file(path)
                .map_err(|err| format!("Could not replace {}: {err}", path.display()))?;
        }
        fs::rename(&temp, path)
            .map_err(|err| format!("Could not replace {}: {err}", path.display()))?;
        sync_directory(parent);
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

/// Ask the user where to save a backup and write it there. Returning the path
/// lets the UI show exactly where the file went; the webview never supplies or
/// reads a path itself.
#[tauri::command]
async fn export_backup_file(
    app: tauri::AppHandle,
    default_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    if contents.len() as u64 > MAX_BACKUP_FILE_BYTES {
        return Err("The backup is larger than the 64 MB limit.".to_string());
    }
    let file_name = sanitize_backup_name(&default_name);
    let parent = app.get_webview_window("main");
    let app_for_dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let dialog = app_for_dialog
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
            .set_file_name(file_name);
        let dialog = match parent {
            Some(window) => dialog.set_parent(&window),
            None => dialog,
        };
        dialog.blocking_save_file()
    })
    .await
    .map_err(|err| format!("Backup dialog failed: {err}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|err| format!("Invalid backup path: {err}"))?;
    ensure_json_extension(&path)?;
    let display_path = path.display().to_string();
    let written = tauri::async_runtime::spawn_blocking(move || {
        write_text_file_atomic(&path, &contents)?;
        Ok::<String, String>(display_path)
    })
    .await
    .map_err(|err| format!("Backup write task failed: {err}"))?;

    written.map(Some)
}

/// CSV exports are plain text and page-sized, so a modest cap is plenty.
const MAX_CSV_FILE_BYTES: usize = 8 * 1024 * 1024;

fn sanitize_csv_name(name: &str) -> String {
    let file = Path::new(name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let stem = file
        .trim_end_matches(".csv")
        .trim_end_matches(".CSV")
        .trim();
    let stem = if stem.is_empty() { "applications" } else { stem };
    format!("{stem}.csv")
}

fn ensure_csv_extension(path: &Path) -> Result<(), String> {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension) if extension.eq_ignore_ascii_case("csv") => Ok(()),
        _ => Err("The export file must be a .csv file.".to_string()),
    }
}

/// Save a CSV export chosen through the same native dialog as backups. The
/// webview supplies contents and a suggested name, never a filesystem path.
#[tauri::command]
async fn export_csv_file(
    app: tauri::AppHandle,
    default_name: String,
    contents: String,
) -> Result<Option<String>, String> {
    if contents.len() > MAX_CSV_FILE_BYTES {
        return Err("The CSV export is larger than the 8 MB limit.".to_string());
    }
    let file_name = sanitize_csv_name(&default_name);
    let parent = app.get_webview_window("main");
    let app_for_dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let dialog = app_for_dialog
            .dialog()
            .file()
            .add_filter("CSV", &["csv"])
            .set_file_name(file_name);
        let dialog = match parent {
            Some(window) => dialog.set_parent(&window),
            None => dialog,
        };
        dialog.blocking_save_file()
    })
    .await
    .map_err(|err| format!("CSV dialog failed: {err}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|err| format!("Invalid CSV path: {err}"))?;
    ensure_csv_extension(&path)?;
    let display_path = path.display().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        write_text_file_atomic(&path, &contents)?;
        Ok::<String, String>(display_path)
    })
    .await
    .map_err(|err| format!("CSV write task failed: {err}"))?
    .map(Some)
}

/// Upper bound for generated PDF/DOCX exports and imported CV documents.
const MAX_EXPORT_FILE_BYTES: usize = 20 * 1024 * 1024;
const MAX_IMPORT_DOCUMENT_BYTES: u64 = 8 * 1024 * 1024;

fn sanitize_document_name(name: &str, extension: &str) -> String {
    let file = Path::new(name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .trim();
    let stem = match file.rsplit_once('.') {
        Some((stem, _)) if !stem.trim().is_empty() => stem.trim(),
        _ => file,
    };
    let stem = if stem.is_empty() {
        "cover-letter"
    } else {
        stem
    };
    let stem: String = stem.chars().take(80).collect();
    format!("{stem}.{extension}")
}

fn ensure_export_extension(path: &Path, expected: &str) -> Result<(), String> {
    let actual = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_lowercase();
    if actual != expected {
        return Err(format!("The export file must use the .{expected} extension."));
    }
    Ok(())
}

#[derive(Serialize)]
struct ImportedDocument {
    name: String,
    bytes: Vec<u8>,
}

/// Save a generated PDF or DOCX through the native dialog. The frontend
/// renders the document; Rust only validates the extension/size and writes the
/// bytes atomically to the path the user picked.
#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    default_name: String,
    contents: Vec<u8>,
) -> Result<Option<String>, String> {
    if contents.len() > MAX_EXPORT_FILE_BYTES {
        return Err("The export is larger than the 20 MB limit.".to_string());
    }
    let lower = default_name.to_lowercase();
    let extension = if lower.ends_with(".docx") {
        "docx"
    } else if lower.ends_with(".pdf") {
        "pdf"
    } else {
        return Err("Exports must be PDF or DOCX files.".to_string());
    };
    let file_name = sanitize_document_name(&default_name, extension);
    let (label, filter_extension): (&str, &str) = if extension == "docx" {
        ("Word document", "docx")
    } else {
        ("PDF", "pdf")
    };
    let parent = app.get_webview_window("main");
    let app_for_dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let dialog = app_for_dialog
            .dialog()
            .file()
            .add_filter(label, &[filter_extension])
            .set_file_name(file_name);
        let dialog = match parent {
            Some(window) => dialog.set_parent(&window),
            None => dialog,
        };
        dialog.blocking_save_file()
    })
    .await
    .map_err(|err| format!("Export dialog failed: {err}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|err| format!("Invalid export path: {err}"))?;
    ensure_export_extension(&path, extension)?;
    let display_path = path.display().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        write_bytes_file_atomic(&path, &contents)?;
        Ok::<String, String>(display_path)
    })
    .await
    .map_err(|err| format!("Export write task failed: {err}"))?
    .map(Some)
}

/// Pick a CV/document and return its bytes. Text extraction happens in the
/// webview (DOCX/PDF/TXT parsers) so Rust stays out of document-format code.
#[tauri::command]
async fn read_import_file(app: tauri::AppHandle) -> Result<Option<ImportedDocument>, String> {
    let parent = app.get_webview_window("main");
    let app_for_dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let dialog = app_for_dialog
            .dialog()
            .file()
            .add_filter("Documents", &["pdf", "docx", "txt"]);
        let dialog = match parent {
            Some(window) => dialog.set_parent(&window),
            None => dialog,
        };
        dialog.blocking_pick_file()
    })
    .await
    .map_err(|err| format!("Import dialog failed: {err}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|err| format!("Invalid import path: {err}"))?;
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !matches!(extension.as_str(), "pdf" | "docx" | "txt") {
        return Err("Choose a PDF, DOCX or TXT file.".to_string());
    }
    let metadata = fs::metadata(&path)
        .map_err(|err| format!("Could not inspect {}: {err}", path.display()))?;
    if metadata.len() > MAX_IMPORT_DOCUMENT_BYTES {
        return Err("The selected document is larger than the 8 MB limit.".to_string());
    }
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("cv")
        .to_string();
    let bytes = fs::read(&path)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))?;
    Ok(Some(ImportedDocument { name, bytes }))
}

/// Open a user-selected backup and return its text. The dialog and the read
/// both happen in Rust; the webview has no filesystem read permission.
#[tauri::command]
async fn import_backup_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let parent = app.get_webview_window("main");
    let app_for_dialog = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let dialog = app_for_dialog
            .dialog()
            .file()
            .add_filter("JSON", &["json"]);
        let dialog = match parent {
            Some(window) => dialog.set_parent(&window),
            None => dialog,
        };
        dialog.blocking_pick_file()
    })
    .await
    .map_err(|err| format!("Backup dialog failed: {err}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|err| format!("Invalid backup path: {err}"))?;
    ensure_json_extension(&path)?;

    let metadata = fs::metadata(&path)
        .map_err(|err| format!("Could not inspect {}: {err}", path.display()))?;
    if metadata.len() > MAX_BACKUP_FILE_BYTES {
        return Err("The selected backup is larger than the 64 MB limit.".to_string());
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|err| format!("Could not read {}: {err}", path.display()))
}

/// The only origins the main webview may navigate to. External links are
/// intercepted by the frontend and opened in the system browser; anything
/// else that tries to navigate the app away is blocked here as a backstop.
fn is_allowed_app_url(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "about" => true,
        "http" | "https" => {
            let host = url.host_str().unwrap_or_default();
            if host == "tauri.localhost" {
                return true;
            }
            // Vite's dev server is pinned to port 1420 by vite.config.ts.
            matches!(host, "localhost" | "127.0.0.1") && url.port() == Some(1420)
        }
        _ => false,
    }
}

fn navigation_guard<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|_webview, url| is_allowed_app_url(url))
        .build()
}

/// Get a secret (e.g. the API key) from the OS keychain.
/// Returns `null` when no entry exists. Errors if the keychain is unusable,
/// so the frontend can fall back to storing secrets in config.json.
#[tauri::command]
fn keyring_get(key: String) -> Result<Option<String>, String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| format!("Keychain unavailable: {e}"))?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Keychain error: {e}")),
    }
}

/// Store a secret in the OS keychain (overwrites any existing value).
#[tauri::command]
fn keyring_set(key: String, value: String) -> Result<(), String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| format!("Keychain unavailable: {e}"))?;
    entry.set_password(&value).map_err(|e| format!("Keychain error: {e}"))
}

/// Delete a secret from the OS keychain. Missing entries are not an error.
#[tauri::command]
fn keyring_delete(key: String) -> Result<(), String> {
    let entry =
        Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| format!("Keychain unavailable: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Keychain error: {e}")),
    }
}

/// Bring the existing window back to the foreground when a second copy of the
/// app is launched. Without this the second process would exit silently on
/// some platforms and leave the user staring at nothing, and worse, two
/// concurrently running instances could overwrite each other's JSON data.
#[cfg(desktop)]
fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Marker written by "Reset all data". The actual deletion happens on the next
/// start, before the webview can load or flush anything, so pending saves from
/// the old session cannot resurrect the data.
const RESET_MARKER: &str = ".reset-pending";

fn is_app_data_file(name: &str) -> bool {
    name.ends_with(".json") || name.ends_with(".json.bak") || name.contains(".corrupt-")
}

/// Delete the app's own JSON files (including backups and quarantined copies).
fn clear_app_data_files(dir: &Path) -> Result<usize, String> {
    let mut removed = 0usize;
    let entries = fs::read_dir(dir)
        .map_err(|err| format!("Could not read {}: {err}", dir.display()))?;
    for entry in entries.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_app_data_file(&name) {
            continue;
        }
        fs::remove_file(entry.path())
            .map_err(|err| format!("Could not remove {name}: {err}"))?;
        removed += 1;
    }
    Ok(removed)
}

/// Ask for all user data to be cleared on the next launch. The app restarts
/// immediately after this command; deletion happens in `run`'s setup.
#[tauri::command]
fn request_data_reset(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not resolve the data directory: {err}"))?;
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Could not create the data directory: {err}"))?;
    fs::write(dir.join(RESET_MARKER), b"reset")
        .map_err(|err| format!("Could not schedule the reset: {err}"))
}

/// Open the app-data directory in the system file manager, so users can find
/// their JSON files without guessing where Tauri stores them.
#[tauri::command]
fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve the data directory: {e}"))?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Could not open the data folder: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Shared across every command for connection/TLS/DNS reuse.
    let http_clients = HttpClients::new().expect("failed to initialise HTTP clients");
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .manage(http_clients)
        .manage(StreamState::default());

    // Register this before any other plugin: it is what decides whether the
    // current process is the primary instance. A second launch just raises the
    // existing window and exits, so two instances can never write the same
    // data files concurrently.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(navigation_guard())
        .setup(|app| {
            logging::init(app.handle());
            if let Ok(dir) = app.path().app_data_dir() {
                let marker = dir.join(RESET_MARKER);
                if marker.exists() {
                    match clear_app_data_files(&dir) {
                        Ok(count) => logging::record(
                            "INFO",
                            "app",
                            &format!("Reset removed {count} data files"),
                        ),
                        Err(err) => {
                            logging::record("ERROR", "app", &format!("Reset failed: {err}"))
                        }
                    }
                    let _ = fs::remove_file(&marker);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            zen_list_models,
            zen_chat,
            zen_chat_stream,
            zen_chat_stream_cancel,
            zen_web_search,
            zen_fetch_page,
            zen_fetch_zen_pricing,
            load_data_file,
            save_data_file,
            delete_data_file,
            export_backup_file,
            export_csv_file,
            save_export_file,
            read_import_file,
            import_backup_file,
            keyring_get,
            keyring_set,
            keyring_delete,
            open_data_folder,
            request_data_reset,
            logging::frontend_log,
            logging::get_diagnostics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_endpoint_normalises_base_urls() {
        assert_eq!(
            anthropic_endpoint("https://api.anthropic.com", "/models"),
            "https://api.anthropic.com/v1/models"
        );
        assert_eq!(
            anthropic_endpoint("https://api.anthropic.com/", "/messages"),
            "https://api.anthropic.com/v1/messages"
        );
        // A base that already ends in /v1 must not get a double prefix.
        assert_eq!(
            anthropic_endpoint("https://proxy.example.com/v1/", "/models"),
            "https://proxy.example.com/v1/models"
        );
    }

    #[test]
    fn decode_duckduckgo_href_extracts_real_target() {
        assert_eq!(
            decode_duckduckgo_href("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fjobs"),
            "https://example.com/jobs"
        );
        assert_eq!(
            decode_duckduckgo_href("/l/?uddg=https%3A%2F%2Fexample.org"),
            "https://example.org"
        );
        // Non-redirect links pass through untouched; reqwest::Url
        // normalises special-scheme URLs to gain a trailing slash.
        assert_eq!(decode_duckduckgo_href("https://example.com"), "https://example.com/");
        assert_eq!(decode_duckduckgo_href("not a url"), "not a url");
    }

    #[test]
    fn parse_zen_price_handles_common_cells() {
        assert_eq!(parse_zen_price("Free"), (None, true));
        assert_eq!(parse_zen_price("$0.30"), (Some(0.30), false));
        assert_eq!(parse_zen_price("$1,234.50"), (Some(1234.50), false));
        assert_eq!(parse_zen_price("-"), (None, false));
        assert_eq!(parse_zen_price(""), (None, false));
    }

    #[test]
    fn quota_detection_matches_known_bodies() {
        let limit = reqwest::StatusCode::TOO_MANY_REQUESTS;
        let other = reqwest::StatusCode::BAD_REQUEST;
        assert!(is_quota_error(limit, "You have exceeded your free usage limit"));
        assert!(is_quota_error(limit, "QUOTA_EXHAUSTED"));
        assert!(!is_quota_error(limit, "Slow down and retry shortly"));
        assert!(!is_quota_error(other, "free usage limit exceeded"));
    }

    #[test]
    fn backoff_schedule_is_exponential_then_capped() {
        assert_eq!(backoff_secs(0), 1);
        assert_eq!(backoff_secs(1), 2);
        assert_eq!(backoff_secs(2), 4);
        assert_eq!(backoff_secs(3), MAX_RETRY_AFTER_SECS);
        assert_eq!(backoff_secs(99), MAX_RETRY_AFTER_SECS);
    }

    #[test]
    fn openai_stream_assembles_content_and_tool_calls() {
        let mut acc = StreamAccumulator::new("openai");

        let delta = acc
            .feed(r#"{"choices":[{"delta":{"role":"assistant","content":"Hel"}}]}"#)
            .unwrap();
        assert_eq!(delta.as_deref(), Some("Hel"));

        assert_eq!(
            acc.feed(r#"{"choices":[{"delta":{"content":"lo"}}]}"#).unwrap(),
            Some("lo".to_string())
        );

        acc.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"zen_web_search","arguments":"{\"q\":"}}]}}]}"#,
        )
        .unwrap();
        acc.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"rust\"}"}}]}}]}"#,
        )
        .unwrap();

        // finish_reason marks completion but carries no text.
        assert_eq!(
            acc.feed(r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#)
                .unwrap(),
            None
        );
        assert!(acc.is_finished());

        acc.feed("[DONE]").unwrap();
        acc.feed(r#"{"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7}}"#)
            .unwrap();

        let data = acc.finish();
        assert_eq!(data["choices"][0]["message"]["content"], "Hello");
        assert_eq!(data["choices"][0]["finish_reason"], "tool_calls");
        assert_eq!(data["usage"]["input_tokens"], 11);
        assert_eq!(data["usage"]["output_tokens"], 7);
        let calls = data["choices"][0]["message"]["tool_calls"].as_array().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0]["id"], "call_1");
        assert_eq!(calls[0]["type"], "function");
        assert_eq!(calls[0]["function"]["name"], "zen_web_search");
        assert_eq!(calls[0]["function"]["arguments"], r#"{"q":"rust"}"#);
    }

    #[test]
    fn openai_stream_ignores_absurd_tool_indices() {
        let mut acc = StreamAccumulator::new("openai");
        acc.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":1000000,"id":"x","function":{"name":"n","arguments":""}}]}}]}"#,
        )
        .unwrap();
        assert!(acc.openai_tool_calls.is_empty());
    }

    #[test]
    fn openai_stream_without_tools_has_null_tool_calls() {
        let mut acc = StreamAccumulator::new("openai");
        acc.feed(r#"{"choices":[{"delta":{"content":"hi"}}]}"#).unwrap();
        acc.feed(r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#).unwrap();
        let data = acc.finish();
        assert!(data["choices"][0]["message"]["tool_calls"].is_null());
        assert_eq!(data["choices"][0]["finish_reason"], "stop");
    }

    #[test]
    fn provider_error_events_are_surfaced() {
        let mut anthropic = StreamAccumulator::new("anthropic");
        let error = anthropic
            .feed(
                r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
            )
            .unwrap_err();
        assert!(error.contains("Overloaded"));

        let mut openai = StreamAccumulator::new("openai");
        let error = openai
            .feed(r#"{"error":{"message":"Rate limited"}}"#)
            .unwrap_err();
        assert!(error.contains("Rate limited"));
    }

    #[test]
    fn anthropic_stream_assembles_blocks_and_tool_input() {
        let mut acc = StreamAccumulator::new("anthropic");

        acc.feed(
            r#"{"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":1}}}"#,
        )
        .unwrap();
        acc.feed(r#"{"type":"content_block_start","index":0,"content_block":{"type":"text"}}"#)
            .unwrap();
        let delta = acc
            .feed(r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}"#)
            .unwrap();
        assert_eq!(delta.as_deref(), Some("Hi"));

        acc.feed(
            r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"zen_fetch_page","input":{}}}"#,
        )
        .unwrap();
        // input_json_delta belongs to the tool block and emits no text delta.
        assert_eq!(
            acc.feed(
                r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"url\":\"https://x.dev\"}"}}"#,
            )
            .unwrap(),
            None
        );

        acc.feed(r#"{"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":9}}"#)
            .unwrap();
        acc.feed(r#"{"type":"message_stop"}"#).unwrap();
        assert!(acc.is_finished());

        let data = acc.finish();
        assert_eq!(data["stop_reason"], "tool_use");
        assert_eq!(data["usage"]["input_tokens"], 12);
        assert_eq!(data["usage"]["output_tokens"], 9);
        let blocks = data["content"].as_array().unwrap();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0], serde_json::json!({"type": "text", "text": "Hi"}));
        assert_eq!(blocks[1]["type"], "tool_use");
        assert_eq!(blocks[1]["id"], "toolu_1");
        assert_eq!(blocks[1]["name"], "zen_fetch_page");
        assert_eq!(blocks[1]["input"]["url"], "https://x.dev");
    }

    #[test]
    fn malformed_sse_payload_is_an_error_not_a_panic() {
        let mut acc = StreamAccumulator::new("openai");
        assert!(acc.feed("this is not json").is_err());
    }

    fn test_data_dir(label: &str) -> PathBuf {
        // Keep test scratch files inside target/: system temp is not writable
        // in every sandbox/CI environment.
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-tmp")
            .join(format!(
                "aas-{label}-{}-{}",
                std::process::id(),
                timestamp_nanos()
            ));
        fs::create_dir_all(&dir).expect("create test dir");
        dir
    }

    #[test]
    fn data_file_names_reject_traversal_and_non_json() {
        assert!(validate_data_file_name("applications.json").is_ok());
        assert!(validate_data_file_name("chat_6f1d2d0e-aaaa.json").is_ok());
        assert!(validate_data_file_name("../applications.json").is_err());
        assert!(validate_data_file_name("sub/applications.json").is_err());
        assert!(validate_data_file_name("..\\applications.json").is_err());
        assert!(validate_data_file_name("applications.txt").is_err());
        assert!(validate_data_file_name(".json").is_err());
    }

    #[test]
    fn save_keeps_the_previous_version_as_backup() {
        let dir = test_data_dir("backup");
        let path = dir.join("applications.json");

        save_bytes_atomic(&path, br#"{"version":1}"#).unwrap();
        save_bytes_atomic(&path, br#"{"version":2}"#).unwrap();

        let current: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let backup: serde_json::Value =
            serde_json::from_slice(&fs::read(backup_path(&path)).unwrap()).unwrap();
        assert_eq!(current["version"], 2);
        assert_eq!(backup["version"], 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_recovers_a_corrupt_main_file_from_backup() {
        let dir = test_data_dir("recover");
        let path = dir.join("applications.json");

        save_bytes_atomic(&path, br#"{"version":1}"#).unwrap();
        save_bytes_atomic(&path, br#"{"version":2}"#).unwrap();
        fs::write(&path, b"{ this is not json").unwrap();

        let loaded = load_data_file_at(&path).unwrap();
        assert!(loaded.recovered);
        assert!(loaded.error.is_none());
        assert_eq!(loaded.data.unwrap()["version"], 1);

        // The damaged file was preserved under a .corrupt-* name and the valid
        // backup was copied back into place.
        let restored: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(restored["version"], 1);
        let corrupt_files = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .contains(".corrupt-")
            })
            .count();
        assert_eq!(corrupt_files, 1);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saving_does_not_replace_a_good_backup_with_a_corrupt_main() {
        let dir = test_data_dir("keep-backup");
        let path = dir.join("profile.json");

        save_bytes_atomic(&path, br#"{"version":1}"#).unwrap();
        save_bytes_atomic(&path, br#"{"version":2}"#).unwrap();
        fs::write(&path, b"corrupt").unwrap();

        save_bytes_atomic(&path, br#"{"version":3}"#).unwrap();

        let backup: serde_json::Value =
            serde_json::from_slice(&fs::read(backup_path(&path)).unwrap()).unwrap();
        assert_eq!(backup["version"], 1);
        let current: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(current["version"], 3);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_data_file_is_a_normal_first_run() {
        let dir = test_data_dir("missing");
        let loaded = load_data_file_at(&dir.join("applications.json")).unwrap();
        assert!(!loaded.recovered);
        assert!(loaded.error.is_none());
        assert!(loaded.data.is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn navigation_guard_allows_only_app_origins() {
        let allow = |raw: &str| is_allowed_app_url(&tauri::Url::parse(raw).unwrap());
        assert!(allow("tauri://localhost/"));
        assert!(allow("http://tauri.localhost/"));
        assert!(allow("https://tauri.localhost/"));
        assert!(allow("about:blank"));
        assert!(allow("http://localhost:1420/"));
        assert!(!allow("https://example.com/"));
        assert!(!allow("http://localhost:9999/"));
        assert!(!allow("file:///C:/Windows/System32/"));
    }

    #[test]
    fn backup_names_are_sanitized() {
        assert_eq!(sanitize_backup_name("backup.json"), "backup.json");
        assert_eq!(sanitize_backup_name("backup"), "backup.json");
        assert_eq!(sanitize_backup_name("../../evil.json"), "evil.json");
        assert_eq!(sanitize_backup_name("C:\\temp\\my-backup.JSON"), "my-backup.JSON");
        assert_eq!(
            sanitize_backup_name("   "),
            "ai-application-support-backup.json"
        );
    }

    #[test]
    fn backup_files_must_be_json() {
        assert!(ensure_json_extension(Path::new("backup.json")).is_ok());
        assert!(ensure_json_extension(Path::new("backup.JSON")).is_ok());
        assert!(ensure_json_extension(Path::new("backup.txt")).is_err());
        assert!(ensure_json_extension(Path::new("backup")).is_err());
    }

    #[test]
    fn backup_writer_round_trips_and_overwrites() {
        let dir = test_data_dir("backup-writer");
        let path = dir.join("export.json");

        write_text_file_atomic(&path, r#"{"version":1}"#).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"version":1}"#);

        write_text_file_atomic(&path, r#"{"version":2}"#).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"version":2}"#);
        // A one-off export does not create a .bak beside the user's file.
        assert!(!backup_path(&path).exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn csv_export_names_and_extensions_are_safe() {
        assert_eq!(sanitize_csv_name("applications.csv"), "applications.csv");
        assert_eq!(sanitize_csv_name("My Export.CSV"), "My Export.csv");
        assert_eq!(sanitize_csv_name("../../evil"), "evil.csv");
        assert_eq!(sanitize_csv_name("   "), "applications.csv");
        assert_eq!(
            sanitize_csv_name("C:\\temp\\tracker.csv"),
            "tracker.csv"
        );

        assert!(ensure_csv_extension(Path::new("applications.csv")).is_ok());
        assert!(ensure_csv_extension(Path::new("applications.CSV")).is_ok());
        assert!(ensure_csv_extension(Path::new("applications.json")).is_err());
        assert!(ensure_csv_extension(Path::new("applications")).is_err());
    }

    #[test]
    fn document_export_names_and_extensions_are_safe() {
        assert_eq!(
            sanitize_document_name("Cover Letter.pdf", "pdf"),
            "Cover Letter.pdf"
        );
        assert_eq!(
            sanitize_document_name("../../evil.docx", "docx"),
            "evil.docx"
        );
        assert_eq!(sanitize_document_name("   ", "pdf"), "cover-letter.pdf");
        assert!(ensure_export_extension(Path::new("a.pdf"), "pdf").is_ok());
        assert!(ensure_export_extension(Path::new("a.PDF"), "pdf").is_ok());
        assert!(ensure_export_extension(Path::new("a.docx"), "pdf").is_err());
        assert!(ensure_export_extension(Path::new("a"), "docx").is_err());
    }

    #[test]
    fn reset_removes_only_app_data_files() {
        let dir = test_data_dir("reset");
        fs::write(dir.join("applications.json"), b"{}").unwrap();
        fs::write(dir.join("applications.json.bak"), b"{}").unwrap();
        fs::write(dir.join("applications.json.corrupt-1.json"), b"x").unwrap();
        fs::write(dir.join("notes.txt"), b"keep me").unwrap();
        fs::create_dir(dir.join("nested.json")).unwrap();

        let removed = clear_app_data_files(&dir).unwrap();
        assert_eq!(removed, 3);
        assert!(dir.join("notes.txt").exists());
        assert!(dir.join("nested.json").is_dir());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn ssrf_guard_rejects_internal_addresses() {
        for raw in [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "172.31.255.254",
            "192.168.1.10",
            "169.254.169.254",
            "0.0.0.0",
            "100.64.0.1",
            "198.18.0.1",
            "192.0.0.8",
            "224.0.0.1",
            "255.255.255.255",
            "::1",
            "::",
            "fd12:3456::1",
            "fe80::1",
            "ff02::1",
            "2001:db8::1",
            "::ffff:127.0.0.1",
            "::127.0.0.1",
            "64:ff9b::a00:1",
            "2002:7f00:1::",
        ] {
            let ip: IpAddr = raw.parse().unwrap();
            assert!(is_internal_ip(ip), "{ip} should be treated as internal");
        }
    }

    #[test]
    fn ssrf_guard_allows_public_addresses() {
        for raw in [
            "8.8.8.8",
            "1.1.1.1",
            "93.184.216.34",
            "172.32.0.1",
            "2606:4700:4700::1111",
            "64:ff9b::808:808",
        ] {
            let ip: IpAddr = raw.parse().unwrap();
            assert!(!is_internal_ip(ip), "{ip} should be treated as public");
        }
    }

    #[test]
    fn fetch_url_validation_blocks_local_and_unsafe_urls() {
        let parse = |raw: &str| reqwest::Url::parse(raw).unwrap();

        assert!(validate_fetch_url(&parse("http://127.0.0.1/")).is_err());
        assert!(validate_fetch_url(&parse("https://169.254.169.254/latest/meta-data")).is_err());
        assert!(validate_fetch_url(&parse("https://[::1]/")).is_err());
        assert!(validate_fetch_url(&parse("http://10.0.0.5/")).is_err());
        // WHATWG URL parsing accepts numeric shorthands for IPv4; they must
        // not slip past the literal-IP check.
        assert!(validate_fetch_url(&parse("http://0x7f000001/")).is_err());
        assert!(validate_fetch_url(&parse("http://2130706433/")).is_err());
        assert!(validate_fetch_url(&parse("http://127.1/")).is_err());
        assert!(validate_fetch_url(&parse("ftp://example.com/")).is_err());
        assert!(validate_fetch_url(&parse("https://user:pass@example.com/")).is_err());
        assert!(validate_fetch_url(&parse("https://example.com:8443/")).is_err());

        // Hostnames are only checked after DNS resolution; the static rules
        // still accept ordinary public URLs on ports 80/443.
        assert!(validate_fetch_url(&parse("https://example.com/jobs")).is_ok());
        assert!(validate_fetch_url(&parse("http://example.com:80/")).is_ok());
        assert!(validate_fetch_url(&parse("http://localhost/")).is_ok());
    }
}
