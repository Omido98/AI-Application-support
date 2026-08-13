use ego_tree::NodeRef;
use futures_util::StreamExt;
use keyring::Entry;
use scraper::{ElementRef, Node, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::State;
use tokio_util::sync::CancellationToken;

/// Service name under which API keys are stored in the OS keychain.
const KEYCHAIN_SERVICE: &str = "com.ai-application-support.app";

/// Browser-like user agent so DuckDuckGo and typical websites serve normal
/// HTML instead of bot-blocking pages.
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
                tokio::time::sleep(Duration::from_secs(wait)).await;
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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let mut request = client.get(&url);
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

    Ok(parsed.data.into_iter().map(|m| m.id).collect())
}

/// Forward a chat request to the configured provider's endpoint.
/// OpenAI-compatible providers use `/chat/completions` with a Bearer token;
/// Anthropic uses `/v1/messages` with `x-api-key` + `anthropic-version`.
/// Runs on the Rust side so the Tauri webview never hits CORS restrictions.
#[tauri::command]
async fn zen_chat(
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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = send_with_retry(&client, &url, &api_key, &provider, &payload, None).await?;

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
    openai_finished: bool,
    anthropic_blocks: Vec<AnthropicBlockAcc>,
    anthropic_stop_reason: Option<String>,
    anthropic_finished: bool,
}

impl StreamAccumulator {
    fn new(provider: &str) -> Self {
        Self {
            provider: provider.to_string(),
            openai_content: String::new(),
            openai_tool_calls: Vec::new(),
            openai_finished: false,
            anthropic_blocks: Vec::new(),
            anthropic_stop_reason: None,
            anthropic_finished: false,
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

    /// Process one SSE `data:` payload.
    fn feed(
        &mut self,
        data: &str,
        on_event: &Channel<ChatStreamEvent>,
    ) -> Result<(), String> {
        if data == "[DONE]" {
            self.openai_finished = true;
            return Ok(());
        }
        let parsed: serde_json::Value = serde_json::from_str(data)
            .map_err(|e| format!("Failed to parse streamed event: {e}"))?;
        if self.provider == "anthropic" {
            self.feed_anthropic(&parsed, on_event)
        } else {
            self.feed_openai(&parsed, on_event)
        }
    }

    fn feed_openai(
        &mut self,
        parsed: &serde_json::Value,
        on_event: &Channel<ChatStreamEvent>,
    ) -> Result<(), String> {
        let Some(choice) = parsed.pointer("/choices/0") else {
            return Ok(());
        };
        if let Some(reason) = choice.get("finish_reason") {
            if !reason.is_null() {
                self.openai_finished = true;
            }
        }
        let Some(delta) = choice.get("delta") else {
            return Ok(());
        };

        if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
            if !content.is_empty() {
                self.openai_content.push_str(content);
                on_event
                    .send(ChatStreamEvent::Delta {
                        text: content.to_string(),
                    })
                    .map_err(|e| format!("Failed to send stream event: {e}"))?;
            }
        }

        if let Some(tool_calls) = delta.get("tool_calls").and_then(|t| t.as_array()) {
            for call in tool_calls {
                let index = call
                    .get("index")
                    .and_then(|i| i.as_u64())
                    .unwrap_or(0) as usize;
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
        Ok(())
    }

    fn feed_anthropic(
        &mut self,
        parsed: &serde_json::Value,
        on_event: &Channel<ChatStreamEvent>,
    ) -> Result<(), String> {
        let event_type = parsed
            .get("type")
            .and_then(|t| t.as_str())
            .unwrap_or("");
        match event_type {
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
                            on_event
                                .send(ChatStreamEvent::Delta {
                                    text: text.to_string(),
                                })
                                .map_err(|e| {
                                    format!("Failed to send stream event: {e}")
                                })?;
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
        Ok(())
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
                    "message": {
                        "content": content,
                        "tool_calls": if tool_calls.is_empty() {
                            serde_json::Value::Null
                        } else {
                            serde_json::Value::Array(tool_calls)
                        },
                    }
                }]
            })
        }
    }
}

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
        while let Some(chunk) = stream.next().await {
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
                        acc.feed(&event_data, on_event)?;
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
            acc.feed(&event_data, on_event)?;
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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    // Retried on HTTP 429 with backoff. Retries happen while the initial
    // request is rejected, before any SSE data has been emitted, so a retried
    // stream is indistinguishable from a slow first response.
    let response = send_with_retry(&client, &url, api_key, provider, payload, Some(token)).await?;

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
    base_url: String,
    api_key: String,
    provider: String,
    payload: serde_json::Value,
    on_event: Channel<ChatStreamEvent>,
    state: State<'_, StreamState>,
) -> Result<String, String> {
    let id = stream_request_id();
    let token = CancellationToken::new();
    state
        .0
        .lock()
        .map_err(|e| format!("Stream registry lock poisoned: {e}"))?
        .insert(id.clone(), token.clone());

    let registry = state.inner().clone();
    let task_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let result =
            run_stream(&base_url, &api_key, &provider, &payload, &on_event, &token).await;
        if let Err(message) = result {
            let _ = on_event.send(ChatStreamEvent::Error { message });
        }
        if let Ok(mut map) = registry.0.lock() {
            map.remove(&task_id);
        }
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
    if let Some(token) = state
        .0
        .lock()
        .map_err(|e| format!("Stream registry lock poisoned: {e}"))?
        .remove(&id)
    {
        token.cancel();
    }
    Ok(())
}

/// Search the web via DuckDuckGo's HTML endpoint and return the top ~5 results,
/// so the chat agent can research companies with current information.
#[tauri::command]
async fn zen_web_search(query: String) -> Result<Vec<WebResult>, String> {
    let url = reqwest::Url::parse_with_params(
        "https://html.duckduckgo.com/html/",
        &[("q", query.as_str())],
    )
    .map_err(|e| format!("Failed to build search URL: {e}"))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(BROWSER_USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(url)
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

    let result_selector =
        Selector::parse("div.result").map_err(|e| format!("Bad selector: {e}"))?;
    let title_selector =
        Selector::parse("a.result__a").map_err(|e| format!("Bad selector: {e}"))?;
    let snippet_selector = Selector::parse("a.result__snippet, div.result__snippet")
        .map_err(|e| format!("Bad selector: {e}"))?;

    let mut results = Vec::new();
    for result in document.select(&result_selector).take(5) {
        let mut title = String::new();
        let mut url = String::new();
        if let Some(a) = result.select(&title_selector).next() {
            title = a.text().collect::<String>().trim().to_string();
            if let Some(href) = a.value().attr("href") {
                url = decode_duckduckgo_href(href);
            }
        }
        if url.is_empty() {
            continue;
        }
        let snippet = result
            .select(&snippet_selector)
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

/// Recursively collect visible text from a node tree,
/// skipping elements that match `skip` (script, style, nav, etc.).
fn collect_text(node: NodeRef<'_, Node>, skip: &Selector, out: &mut Vec<String>) {
    if node.value().is_element() {
        if let Some(el) = ElementRef::wrap(node) {
            if skip.matches(&el) {
                return;
            }
            for child in el.children() {
                collect_text(child, skip, out);
            }
        }
        return;
    }
    if let Node::Text(text) = node.value() {
        let t = text.text.trim();
        if !t.is_empty() {
            out.push(t.to_string());
        }
    }
}

/// Fetch a web page and return its plain text (tags stripped, ~8000 chars max),
/// so the chat agent can read an actual company page.
#[tauri::command]
async fn zen_fetch_page(url: String) -> Result<String, String> {
    let parsed =
        reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("Unsupported URL scheme: {scheme}"));
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(BROWSER_USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(parsed)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Page returned HTTP {}", response.status()));
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("Failed to read page: {e}"))?;

    let document = scraper::Html::parse_document(&html);
    let skip = Selector::parse(
        "script, style, noscript, template, svg, nav, header, footer, aside, iframe, form",
    )
    .map_err(|e| format!("Bad selector: {e}"))?;
    let body_selector =
        Selector::parse("body").map_err(|e| format!("Bad selector: {e}"))?;

    let mut parts: Vec<String> = Vec::new();
    if let Some(body) = document.select(&body_selector).next() {
        for child in body.children() {
            collect_text(child, &skip, &mut parts);
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
async fn zen_fetch_zen_pricing() -> Result<Vec<ZenPricingEntry>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(BROWSER_USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get("https://opencode.ai/docs/zen")
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
    let table_selector =
        Selector::parse("table").map_err(|e| format!("Bad selector: {e}"))?;
    let row_selector = Selector::parse("tr").map_err(|e| format!("Bad selector: {e}"))?;
    let cell_selector =
        Selector::parse("th, td").map_err(|e| format!("Bad selector: {e}"))?;

    let cell_text = |el: ElementRef| -> String {
        el.text().collect::<String>().trim().to_string()
    };

    // Table helper: returns the table whose first-row cells contain all the
    // given keywords (case-insensitive).
    let find_table = |keywords: &[&str]| -> Option<ElementRef> {
        document.select(&table_selector).find(|table| {
            let header: String = table
                .select(&cell_selector)
                .take(6)
                .map(cell_text)
                .collect::<Vec<_>>()
                .join(" ")
                .to_lowercase();
            keywords.iter().all(|k| header.contains(k))
        })
    };

    // The endpoints table maps display names to official model IDs
    // (e.g. "Claude Sonnet 4.5" -> "claude-sonnet-4-5").
    let mut name_to_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    if let Some(endpoints) = find_table(&["model", "id"]) {
        for row in endpoints.select(&row_selector) {
            let cells: Vec<String> = row.select(&cell_selector).map(cell_text).collect();
            if cells.len() >= 2 && !cells[0].is_empty() && !cells[1].is_empty() {
                name_to_id.insert(cells[0].clone(), cells[1].clone());
            }
        }
    }

    let table = find_table(&["input", "output"])
        .ok_or_else(|| "Could not find the pricing table on the Zen docs page.".to_string())?;

    let mut entries: Vec<ZenPricingEntry> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for row in table.select(&row_selector) {
        let cells: Vec<String> = row.select(&cell_selector).map(cell_text).collect();
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
        entries.push(ZenPricingEntry {
            id,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(StreamState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            zen_list_models,
            zen_chat,
            zen_chat_stream,
            zen_chat_stream_cancel,
            zen_web_search,
            zen_fetch_page,
            zen_fetch_zen_pricing,
            keyring_get,
            keyring_set,
            keyring_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
