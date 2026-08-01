use serde::Deserialize;
use std::time::Duration;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![zen_list_models, zen_chat])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
