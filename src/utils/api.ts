import { invoke, Channel } from "@tauri-apps/api/core";
import type { ApiConfig } from "@/stores/chatStore";
import type { ChatMessage } from "@/stores/chatStore";
import type { ProviderId } from "@/utils/providers";

export interface ApiResponse {
  content: string;
  error?: string;
  /** True when the user stopped generation; `content` holds the partial answer. */
  stopped?: boolean;
}

/** Options for sendMessage: live text rendering and stop support. */
export interface SendMessageOptions {
  /** Called with each chunk of text as it streams in (live rendering). */
  onDelta?: (text: string) => void;
  /** Aborting the signal stops generation; whatever was streamed is returned. */
  signal?: AbortSignal;
}

/** An event emitted by the Rust `zen_chat_stream` command. */
type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; data: unknown }
  | { type: "error"; message: string };

/** A single web search result, as returned by the Rust `zen_web_search` command. */
interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

/** A single Zen pricing entry scraped from the Zen docs page. */
export interface ZenPricingEntry {
  id: string;
  input: number | null;
  output: number | null;
  is_free: boolean;
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

const MAX_TOOL_ROUNDS = 15;

/**
 * Prefix prepended when the tool loop runs out of rounds (or repeats a call)
 * but the model already drafted some text — the draft is still handed back
 * instead of failing the whole message.
 */
const PARTIAL_ANSWER_NOTE =
  "[The model kept researching and did not write a final answer. Here is what it drafted before stopping.]\n\n";

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
 * List available models from a `/models` endpoint (OpenAI-compatible shape,
 * which Anthropic also uses).
 * Runs through Rust so the webview never hits CORS restrictions.
 *
 * @param baseUrl - The API base URL (e.g. https://opencode.ai/zen/v1).
 * @param apiKey  - The API key, sent as the provider's auth header.
 * @param provider - The provider id, which determines the endpoint & auth.
 * @returns The list of model IDs.
 */
export async function listModels(
  baseUrl: string,
  apiKey = "",
  provider: ProviderId = "zen",
): Promise<string[]> {
  try {
    return await invoke<string[]>("zen_list_models", {
      baseUrl,
      apiKey,
      provider,
    });
  } catch (err) {
    throw new Error(
      typeof err === "string" ? err : "Failed to load the model list.",
    );
  }
}

/**
 * Fetch the current OpenCode Zen pricing table from the official docs page.
 * Runs through Rust so the webview never hits CORS restrictions.
 *
 * @returns The list of pricing entries (model id, input/output price, free flag).
 */
export async function fetchZenPricing(): Promise<ZenPricingEntry[]> {
  try {
    return await invoke<ZenPricingEntry[]>("zen_fetch_zen_pricing");
  } catch (err) {
    throw new Error(
      typeof err === "string" ? err : "Failed to import model prices.",
    );
  }
}

/**
 * Send a message to the configured LLM provider. Routes to the correct
 * adapter based on `config.provider` (OpenAI-compatible or Anthropic).
 * Responses stream in chunk-by-chunk; each text chunk is forwarded to
 * `options.onDelta` and the final answer is returned when the stream ends.
 *
 * @param messages - The conversation history including the new user message.
 * @param config   - API configuration (provider, baseUrl, apiKey, model, ...).
 * @param systemPrompt - The system prompt to prepend (not included in messages array).
 * @param options  - Live-text callback and an optional AbortSignal to stop generation.
 * @returns The assistant's reply content, or an error message.
 */
export async function sendMessage(
  messages: ChatMessage[],
  config: ApiConfig,
  systemPrompt: string,
  options: SendMessageOptions = {},
): Promise<ApiResponse> {
  if (config.provider === "anthropic") {
    return sendAnthropicMessage(messages, config, systemPrompt, options);
  }
  return sendOpenAICompatMessage(messages, config, systemPrompt, options);
}

/**
 * Stream a single chat-completions round through the Rust backend.
 * Resolves when the stream ends (or is stopped); text chunks are forwarded
 * to `onChunk` for live rendering.
 */
async function streamChat(
  baseUrl: string,
  apiKey: string,
  provider: string,
  payload: Record<string, unknown>,
  options: SendMessageOptions,
  onChunk: (text: string) => void,
): Promise<{ data?: unknown; error?: string; stopped?: boolean }> {
  if (options.signal?.aborted) {
    return { stopped: true };
  }

  const channel = new Channel<ChatStreamEvent>();
  let requestId = "";
  try {
    requestId = await invoke<string>("zen_chat_stream", {
      baseUrl,
      apiKey,
      provider,
      payload,
      onEvent: channel,
    });
  } catch (err) {
    return {
      error: typeof err === "string" ? err : "An unknown error occurred.",
    };
  }

  return new Promise((resolve) => {
    let settled = false;

    function cleanup() {
      options.signal?.removeEventListener("abort", onAbort);
    }

    function onAbort() {
      if (requestId) {
        // Best-effort: tell Rust to close the HTTP connection.
        void invoke("zen_chat_stream_cancel", { id: requestId }).catch(() => {});
      }
      finish({ stopped: true });
    }

    function finish(result: { data?: unknown; error?: string; stopped?: boolean }) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    options.signal?.addEventListener("abort", onAbort, { once: true });
    channel.onmessage = (event: ChatStreamEvent) => {
      switch (event.type) {
        case "delta":
          onChunk(event.text);
          break;
        case "done":
          finish({ data: event.data });
          break;
        case "error":
          finish({ error: event.message });
          break;
      }
    };
  });
}

/**
 * Send a message to an OpenAI-compatible chat completions endpoint.
 * The request is executed by Rust, bypassing webview CORS restrictions.
 * Response text is streamed (SSE) and forwarded to `options.onDelta` so the
 * chat UI can render it live; the full answer is returned when the stream ends.
 *
 * Runs a tool-calling loop: if the model requests `web_search` or
 * `fetch_page`, the tools are executed through Rust and their results are
 * fed back to the model, up to `MAX_TOOL_ROUNDS` rounds. If the model
 * rejects the `tools` field, the request is retried once without it and a
 * short note is prepended to the reply. Providers that reject streaming
 * fall back to one-shot requests automatically.
 */
async function sendOpenAICompatMessage(
  messages: ChatMessage[],
  config: ApiConfig,
  systemPrompt: string,
  options: SendMessageOptions = {},
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
  // after a tools-related error so the retry works with plain models, or
  // from the start when the user disabled web search.
  let useTools = config.webSearchEnabled !== false;

  // Whether responses are streamed. Set to false when the provider rejects
  // streaming (the answer then appears all at once instead of live).
  let useStream = true;

  // Text the model drafted alongside tool calls; returned if the loop
  // cannot finish (round cap or a repeated call).
  let partialContent: string | null = null;

  // Text streamed so far; returned as the partial answer when the user stops.
  let streamedContent = "";

  // Signatures of every tool call made so far, to detect looping models.
  const seenCalls = new Set<string>();

  const buildPayload = (withTools: boolean, stream: boolean): Record<string, unknown> => {
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

    if (stream) {
      payload["stream"] = true;
    }
    return payload;
  };

  const runNonStreamingRound = async (
    withTools: boolean,
  ): Promise<{ data?: ChatResponse; error?: string; stopped?: boolean }> => {
    try {
      const data = await invoke<ChatResponse>("zen_chat", {
        baseUrl,
        apiKey,
        provider: config.provider,
        payload: buildPayload(withTools, false),
      });
      return { data };
    } catch (err) {
      const message =
        typeof err === "string" ? err : "An unknown error occurred.";
      return { error: message };
    }
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (options.signal?.aborted) {
      return { content: streamedContent, stopped: true };
    }

    let result = useStream
      ? await streamChat(baseUrl, apiKey, config.provider, buildPayload(useTools, true), options, (text) => {
          streamedContent += text;
          options.onDelta?.(text);
        })
      : await runNonStreamingRound(useTools);

    if (result.stopped) {
      return { content: streamedContent, stopped: true };
    }

    if (result.error) {
      // Some providers don't support SSE streaming; retry the round without
      // it (the answer then appears all at once instead of live).
      if (useStream && /stream|sse|chunk|event/i.test(result.error)) {
        useStream = false;
        result = await runNonStreamingRound(useTools);
      }

      if (result.error) {
        // Some models reject the `tools` field; retry once without it.
        if (useTools && /tool/i.test(result.error)) {
          useTools = false;
          // Drop tool artifacts from the history so plain models can parse it.
          for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === "tool") {
              history.splice(i, 1);
            } else {
              delete history[i].tool_calls;
            }
          }

          const retry = await runNonStreamingRound(false);
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
        return { content: "", error: result.error };
      }
    }

    const data = result.data as ChatResponse | undefined;
    const message = data?.choices?.[0]?.message;
    const toolCalls = message?.tool_calls;
    const drafted = message?.content;

    if (toolCalls && toolCalls.length > 0) {
      // Keep any text drafted alongside the tool calls: if the loop cannot
      // finish, that draft is still returned instead of an error.
      if (drafted && !partialContent) {
        partialContent = drafted;
      }

      // If the model requests an identical tool call again, it is stuck in a
      // loop — stop and hand back whatever it drafted.
      const keys = toolCalls.map(
        (call) => `${call.function.name}(${call.function.arguments})`,
      );
      if (keys.some((key) => seenCalls.has(key))) {
        return partialContent
          ? { content: `${PARTIAL_ANSWER_NOTE}${partialContent}` }
          : {
              content: "",
              error:
                "The model got stuck repeating the same web request. Please try again.",
            };
      }
      for (const key of keys) seenCalls.add(key);

      // Record the assistant's tool-call message, then feed back the results.
      history.push({
        role: "assistant",
        content: drafted ?? null,
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

    if (drafted == null) {
      return {
        content: "",
        error: "API response did not contain a message.",
      };
    }
    return { content: drafted };
  }

  // Ran out of tool rounds: return the draft if there is one, otherwise fail.
  if (partialContent) {
    return { content: `${PARTIAL_ANSWER_NOTE}${partialContent}` };
  }
  return {
    content: "",
    error:
      "The model kept requesting web tools without producing a final answer. Please try again.",
  };
}

// ──────────────────────────────────────────────
// Anthropic adapter (Messages API)
// ──────────────────────────────────────────────

/** A single content block in an Anthropic response. */
interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
}

type AnthropicContent = string | AnthropicContentBlock[];

interface AnthropicHistoryMessage {
  role: "user" | "assistant";
  content: AnthropicContent;
}

/** Advertised max output tokens for Anthropic requests (required field). */
const ANTHROPIC_MAX_TOKENS = 4096;
/** Fallback model when none is configured. */
const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";

/** Convert the OpenAI-shaped TOOLS list to Anthropic's `input_schema` format. */
function toAnthropicTools(): Array<Record<string, unknown>> {
  return TOOLS.map((tool) => {
    const fn = tool.function as {
      name: string;
      description: string;
      parameters: unknown;
    };
    return {
      name: fn.name,
      description: fn.description,
      input_schema: fn.parameters,
    };
  });
}

/**
 * Send a message to the Anthropic Messages API (`/v1/messages`).
 * Response text is streamed (SSE) and forwarded to `options.onDelta` for
 * live rendering. Runs a tool-calling loop like the OpenAI path, but with
 * Anthropic's `tool_use` / `tool_result` content blocks.
 */
async function sendAnthropicMessage(
  messages: ChatMessage[],
  config: ApiConfig,
  systemPrompt: string,
  options: SendMessageOptions = {},
): Promise<ApiResponse> {
  const { baseUrl, apiKey, model } = config;

  if (!apiKey) {
    return { content: "", error: "API key is not configured." };
  }

  if (!baseUrl) {
    return { content: "", error: "API base URL is not configured." };
  }

  // Clean text-only history; tool artifacts live in `toolContext` and are
  // dropped entirely if the model rejects the tools field.
  const history: AnthropicHistoryMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  let toolContext: AnthropicHistoryMessage[] = [];

  // Whether the current and future requests advertise tools. Set to false
  // after a tools-related error so the retry works with plain models, or
  // from the start when the user disabled web search.
  let useTools = config.webSearchEnabled !== false;

  // Whether responses are streamed. Set to false when the provider rejects
  // streaming (the answer then appears all at once instead of live).
  let useStream = true;

  // Text the model drafted alongside tool_use blocks; returned if the loop
  // cannot finish (round cap or a repeated call).
  let partialContent: string | null = null;

  // Text streamed so far; returned as the partial answer when the user stops.
  let streamedContent = "";

  // Signatures of every tool call made so far, to detect looping models.
  const seenCalls = new Set<string>();

  const buildPayload = (withTools: boolean, stream: boolean): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      model: model || ANTHROPIC_DEFAULT_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages: [...history, ...toolContext],
    };

    if (withTools) {
      payload["tools"] = toAnthropicTools();
    }

    if (stream) {
      payload["stream"] = true;
    }
    return payload;
  };

  const runNonStreamingRound = async (
    withTools: boolean,
  ): Promise<{ data?: AnthropicResponse; error?: string; stopped?: boolean }> => {
    try {
      const data = await invoke<AnthropicResponse>("zen_chat", {
        baseUrl,
        apiKey,
        provider: "anthropic",
        payload: buildPayload(withTools, false),
      });
      return { data };
    } catch (err) {
      const message =
        typeof err === "string" ? err : "An unknown error occurred.";
      return { error: message };
    }
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (options.signal?.aborted) {
      return { content: streamedContent, stopped: true };
    }

    let result = useStream
      ? await streamChat(baseUrl, apiKey, "anthropic", buildPayload(useTools, true), options, (text) => {
          streamedContent += text;
          options.onDelta?.(text);
        })
      : await runNonStreamingRound(useTools);

    if (result.stopped) {
      return { content: streamedContent, stopped: true };
    }

    if (result.error) {
      // Some providers don't support SSE streaming; retry the round without
      // it (the answer then appears all at once instead of live).
      if (useStream && /stream|sse|chunk|event/i.test(result.error)) {
        useStream = false;
        result = await runNonStreamingRound(useTools);
      }

      if (result.error) {
        // Some models reject the `tools` field; retry once without it.
        if (useTools && /tool/i.test(result.error)) {
          useTools = false;
          toolContext = [];

          const retry = await runNonStreamingRound(false);
          if (retry.error) {
            return { content: "", error: retry.error };
          }
          const text = textFromAnthropicBlocks(retry.data?.content);
          if (text == null) {
            return {
              content: "",
              error: "API response did not contain a message.",
            };
          }
          return {
            content: `[Web search unavailable — answering without it]\n\n${text}`,
          };
        }
        return { content: "", error: result.error };
      }
    }

    const data = result.data as AnthropicResponse | undefined;
    const blocks = data?.content ?? [];
    const toolUses = blocks.filter((b) => b.type === "tool_use");

    if (toolUses.length > 0) {
      // Keep any text drafted alongside the tool calls: if the loop cannot
      // finish, that draft is still returned instead of an error.
      const drafted = textFromAnthropicBlocks(blocks);
      if (drafted && !partialContent) {
        partialContent = drafted;
      }

      // If the model requests an identical tool call again, it is stuck in a
      // loop — stop and hand back whatever it drafted.
      const keys = toolUses.map(
        (call) => `${call.name}(${JSON.stringify(call.input ?? {})})`,
      );
      if (keys.some((key) => seenCalls.has(key))) {
        return partialContent
          ? { content: `${PARTIAL_ANSWER_NOTE}${partialContent}` }
          : {
              content: "",
              error:
                "The model got stuck repeating the same web request. Please try again.",
            };
      }
      for (const key of keys) seenCalls.add(key);

      // Echo the assistant's full content blocks, then feed back the results.
      toolContext.push({ role: "assistant", content: blocks });
      const results: AnthropicContentBlock[] = [];
      for (const call of toolUses) {
        const result = await executeAnthropicTool(call);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: result,
        });
      }
      toolContext.push({ role: "user", content: results });
      continue;
    }

    const text = textFromAnthropicBlocks(blocks);
    if (text == null) {
      return {
        content: "",
        error: "API response did not contain a message.",
      };
    }
    return { content: text };
  }

  // Ran out of tool rounds: return the draft if there is one, otherwise fail.
  if (partialContent) {
    return { content: `${PARTIAL_ANSWER_NOTE}${partialContent}` };
  }
  return {
    content: "",
    error:
      "The model kept requesting web tools without producing a final answer. Please try again.",
  };
}

/** Join all text blocks of an Anthropic response; null if there is no text. */
function textFromAnthropicBlocks(
  blocks?: AnthropicContentBlock[],
): string | null {
  if (!blocks) return null;
  const text = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("");
  return text || null;
}

/**
 * Execute a single Anthropic tool_use block via the Rust backend and return
 * its text result (either the formatted search results or the fetched page).
 */
async function executeAnthropicTool(
  call: AnthropicContentBlock,
): Promise<string> {
  const name = call.name ?? "";
  const args = call.input ?? {};
  try {
    if (name === "web_search") {
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

    if (name === "fetch_page") {
      const url = String(args.url ?? "").trim();
      if (!url) {
        return "Error: fetch_page requires a 'url' string argument.";
      }
      return await invoke<string>("zen_fetch_page", { url });
    }

    return `Error: unknown tool "${name}".`;
  } catch (err) {
    const message =
      typeof err === "string" ? err : "unknown error";
    return `Error while running ${name}: ${message}`;
  }
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
