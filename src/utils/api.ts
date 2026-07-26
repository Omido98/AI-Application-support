import type { ApiConfig } from "@/stores/chatStore";
import type { ChatMessage } from "@/stores/chatStore";

export interface ApiResponse {
  content: string;
  error?: string;
}

/**
 * Send a message to an OpenAI-compatible chat completions endpoint.
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
    model: model || "gpt-4",
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

  // Normalise baseUrl — strip trailing slash and append path
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        errorBody = `HTTP ${response.status}`;
      }
      return {
        content: "",
        error: `API error (${response.status}): ${errorBody}`,
      };
    }

    const data = await response.json();

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
      err instanceof Error ? err.message : "An unknown error occurred.";
    return { content: "", error: `Network error: ${message}` };
  }
}
