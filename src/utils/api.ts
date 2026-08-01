import { invoke } from "@tauri-apps/api/core";
import type { ApiConfig } from "@/stores/chatStore";
import type { ChatMessage } from "@/stores/chatStore";

export interface ApiResponse {
  content: string;
  error?: string;
}

/** A single web search result, as returned by the Rust `zen_web_search` command. */
interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/** An OpenAI-shaped message used inside the tool-calling loop. */
interface ApiMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** A function call requested by the model (OpenAI tool-calling format). */
interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ToolCall[];
    };
  }>;
}

const MAX_TOOL_ROUNDS = 4;

/** Tools advertised to models that support function calling. */
const TOOLS: Array<Record<string, unknown>> = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information. Returns up to 5 results with title, URL and snippet. Use it to research a company's purpose, industry, and recent news or trends.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query, e.g. a company name or topic.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_page",
      description:
        "Fetch a web page and return its text content (tags stripped, length-limited). Use it to read an actual company page or article.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The full URL (http/https) of the page to fetch.",
          },
        },
        required: ["url"],
      },
    },
  },
];

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
 * Runs a tool-calling loop: if the model requests `web_search` or
 * `fetch_page`, the tools are executed through Rust and their results are
 * fed back to the model, up to `MAX_TOOL_ROUNDS` rounds. If the model
 * rejects the `tools` field, the request is retried once without it and a
 * short note is prepended to the reply.
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
  const { baseUrl, apiKey, model, reasoningEffort } = config;

  if (!apiKey) {
    return { content: "", error: "API key is not configured." };
  }

  if (!baseUrl) {
    return { content: "", error: "API base URL is not configured." };
  }

  // Conversation so far (system prompt is prepended on each request).
  const history: ApiMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Whether the current and future requests advertise tools. Set to false
  // after a tools-related error so the retry works with plain models.
  let useTools = true;

  const runRound = async (
    withTools: boolean,
  ): Promise<{ data?: ChatResponse; error?: string }> => {
    const payload: Record<string, unknown> = {
      model: model || "deepseek-v4-flash-free",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((m) => {
          if (m.role === "tool") {
            return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
          }
          if (m.tool_calls) {
            return { role: m.role, content: m.content, tool_calls: m.tool_calls };
          }
          return { role: m.role, content: m.content };
        }),
      ],
    };

    if (withTools) {
      payload["tools"] = TOOLS;
    }

    // Append reasoning effort as an OpenAI-compatible field if set
    if (reasoningEffort) {
      payload["reasoning_effort"] = reasoningEffort;
    }

    try {
      const data = await invoke<ChatResponse>("zen_chat", {
        baseUrl,
        apiKey,
        payload,
      });
      return { data };
    } catch (err) {
      const message =
        typeof err === "string" ? err : "An unknown error occurred.";
      return { error: message };
    }
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { data, error } = await runRound(useTools);

    if (error) {
      // Some models reject the `tools` field; retry once without it.
      if (useTools && /tool/i.test(error)) {
        useTools = false;
        // Drop tool artifacts from the history so plain models can parse it.
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].role === "tool") {
            history.splice(i, 1);
          } else {
            delete history[i].tool_calls;
          }
        }

        const retry = await runRound(false);
        if (retry.error) {
          return { content: "", error: retry.error };
        }
        const content = retry.data?.choices?.[0]?.message?.content;
        if (content == null) {
          return {
            content: "",
            error: "API response did not contain a message.",
          };
        }
        return {
          content: `[Web search unavailable — answering without it]\n\n${content}`,
        };
      }
      return { content: "", error };
    }

    const message = data?.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      // Record the assistant's tool-call message, then feed back the results.
      history.push({
        role: "assistant",
        content: message?.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const result = await executeTool(call);
        history.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
      }
      continue;
    }

    const content = message?.content;
    if (content == null) {
      return {
        content: "",
        error: "API response did not contain a message.",
      };
    }
    return { content };
  }

  return {
    content: "",
    error:
      "The model kept requesting web tools without producing a final answer. Please try again.",
  };
}

/**
 * Execute a single tool call via the Rust backend and return its text result
 * (either the formatted search results or the fetched page text).
 */
async function executeTool(call: ToolCall): Promise<string> {
  try {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(call.function.arguments || "{}") as Record<
        string,
        unknown
      >;
    } catch {
      args = {};
    }

    if (call.function.name === "web_search") {
      const query = String(args.query ?? "").trim();
      if (!query) {
        return "Error: web_search requires a 'query' string argument.";
      }
      const results = await invoke<WebResult[]>("zen_web_search", {
        query,
      });
      if (!results || results.length === 0) {
        return "The web search returned no results.";
      }
      return results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`,
        )
        .join("\n\n");
    }

    if (call.function.name === "fetch_page") {
      const url = String(args.url ?? "").trim();
      if (!url) {
        return "Error: fetch_page requires a 'url' string argument.";
      }
      return await invoke<string>("zen_fetch_page", { url });
    }

    return `Error: unknown tool "${call.function.name}".`;
  } catch (err) {
    const message =
      typeof err === "string" ? err : "unknown error";
    return `Error while running ${call.function.name}: ${message}`;
  }
}
