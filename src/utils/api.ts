import { invoke } from "@tauri-apps/api/core";
import type { ApiConfig } from "@/stores/chatStore";
import type { ChatMessage } from "@/stores/chatStore";

export interface ApiResponse {
  content: string;
  error?: string;
}

/**
 * List available models from an OpenAI-compatible `/models` endpoint.
 * Runs through Rust so the webview never hits CORS restrictions.
 *
 * @param baseUrl - The API base URL (e.g. https://opencode.ai/zen/v1).
 * @returns The list of model IDs.
 */
export async function listModels(baseUrl: string): Promise<string[]> {
  try {
    return await invoke<string[]>("zen_list_models", { baseUrl });
  } catch (err) {
    throw new Error(
      typeof err === "string" ? err : "Failed to load the model list.",
    );
  }
}

/**
 * Send a message to an OpenAI-compatible chat completions endpoint.
 * The request is executed by Rust, bypassing webview CORS restrictions.
 *
 * @param messages - The conversation history including the new user message.
 * @param config   - API configuration (baseUrl, apiKey, model, thinkingBudget).
 * @param systemPrompt - The system prompt to prepend (not included in messages array).
 * @returns The assistant's reply content, or an error message.
 */
export async function sendMessage(
  messages: ChatMessage[],
  config: ApiConfig,
  systemPrompt: string,
): Promise<ApiResponse> {
  const { baseUrl, apiKey, model, thinkingBudget } = config;

  if (!apiKey) {
    return { content: "", error: "API key is not configured." };
  }

  if (!baseUrl) {
    return { content: "", error: "API base URL is not configured." };
  }

  // Build the payload
  const payload: Record<string, unknown> = {
    model: model || "deepseek-v4-flash-free",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  };

  // Append thinking budget as a provider-specific field if set
  if (thinkingBudget != null && thinkingBudget > 0) {
    payload["thinking_budget"] = thinkingBudget;
  }

  try {
    const data = await invoke<{
      choices?: Array<{ message?: { content?: string } }>;
    }>("zen_chat", { baseUrl, apiKey, payload });

    const content = data?.choices?.[0]?.message?.content;
    if (content == null) {
      return {
        content: "",
        error: "API response did not contain a message.",
      };
    }

    return { content };
  } catch (err) {
    const message =
      typeof err === "string" ? err : "An unknown error occurred.";
    return { content: "", error: message };
  }
}
