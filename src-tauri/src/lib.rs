use ego_tree::NodeRef;
use scraper::{ElementRef, Node, Selector};
use serde::{Deserialize, Serialize};
use std::time::Duration;

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

/// List available models from an OpenAI-compatible `/models` endpoint.
/// Used to populate the model dropdown from OpenCode Zen.
#[tauri::command]
async fn zen_list_models(base_url: String) -> Result<Vec<String>, String> {
    let base = base_url.trim_end_matches('/').to_string();
    let url = format!("{base}/models");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(&url)
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

/// Forward a chat completions request to an OpenAI-compatible endpoint.
/// Runs on the Rust side so the Tauri webview never hits CORS restrictions.
#[tauri::command]
async fn zen_chat(
    base_url: String,
    api_key: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let base = base_url.trim_end_matches('/').to_string();
    let url = format!("{base}/chat/completions");

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        let snippet: String = text.chars().take(500).collect();
        return Err(format!("API error ({status}): {snippet}"));
    }

    serde_json::from_str(&text).map_err(|e| format!("Invalid response from API: {e}"))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            zen_list_models,
            zen_chat,
            zen_web_search,
            zen_fetch_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
