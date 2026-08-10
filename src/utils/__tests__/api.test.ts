import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage, deslopText } from "@/utils/api";
import type { ApiConfig } from "@/stores/chatStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((msg: unknown) => void) | null = null;
  },
}));

import { invoke } from "@tauri-apps/api/core";

const mockedInvoke = vi.mocked(invoke);

const baseConfig: ApiConfig = {
  provider: "zen",
  baseUrl: "https://opencode.ai/zen/v1",
  apiKey: "test-key",
  model: "deepseek-v4-flash-free",
  reasoningEffort: null,
  webSearchEnabled: true,
  systemPromptMode: "standard",
  customSystemPrompt: "",
};

function openaiMessage(message: unknown): unknown {
  return { choices: [{ message }] };
}

function openaiToolCall(name: string, query: string) {
  return {
    id: "call_1",
    type: "function",
    function: { name, arguments: JSON.stringify({ query }) },
  };
}

const searchResult = [
  { title: "Acme Corp", url: "https://acme.example", snippet: "A company." },
];

/** One round of the chat conversation, either streamed or one-shot. */
type Round =
  | { kind: "stream"; deltas?: string[]; data: unknown }
  | { kind: "streamError"; message: string }
  | { kind: "hang"; deltas?: string[] }
  | { kind: "plain"; data: unknown }
  | { kind: "plainError"; message: string };

/**
 * Answer chat requests from a sequence of rounds (one per round).
 * Streamed rounds deliver deltas + a `done` event through the channel;
 * the last round is repeated for round-cap tests.
 */
const streamOnEvent = (args: unknown) =>
  (args as { onEvent?: { onmessage: (msg: unknown) => void } } | undefined)
    ?.onEvent;

function mockChatSequence(rounds: Round[]) {
  let round = 0;
  mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
    const onEvent = streamOnEvent(args);
    if (cmd === "zen_web_search") return searchResult;
    if (cmd === "zen_fetch_page") return "Page text.";
    if (cmd === "zen_chat_stream_cancel") return null;
    if (cmd === "zen_chat_stream") {
      const current = rounds[Math.min(round, rounds.length - 1)];
      round += 1;
      if (current.kind === "stream" || current.kind === "hang") {
        setTimeout(() => {
          for (const delta of current.deltas ?? []) {
            onEvent?.onmessage({ type: "delta", text: delta });
          }
          if (current.kind === "stream") {
            onEvent?.onmessage({ type: "done", data: current.data });
          }
        }, 0);
      } else if (current.kind === "streamError") {
        setTimeout(() => {
          onEvent?.onmessage({ type: "error", message: current.message });
        }, 0);
      }
      return `req-${round}`;
    }
    if (cmd === "zen_chat") {
      const current = rounds[Math.min(round, rounds.length - 1)];
      round += 1;
      if (current.kind === "plain") return current.data;
      if (current.kind === "plainError") throw current.message;
      throw `unexpected zen_chat call (round ${round}, kind ${current.kind})`;
    }
    return null;
  });
}

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("sendMessage (OpenAI-compatible)", () => {
  it("returns plain text answers without tool calls", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Hello!" }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result).toEqual({ content: "Hello!" });
  });

  it("forwards streamed text chunks to onDelta", async () => {
    mockChatSequence([
      {
        kind: "stream",
        deltas: ["Hello", " world", "!"],
        data: openaiMessage({ content: "Hello world!" }),
      },
    ]);
    const deltas: string[] = [];
    const result = await sendMessage([], baseConfig, "system", {
      onDelta: (text) => deltas.push(text),
    });
    expect(result).toEqual({ content: "Hello world!" });
    expect(deltas).toEqual(["Hello", " world", "!"]);
  });

  it("runs tool calls and returns the final answer", async () => {
    mockChatSequence([
      {
        kind: "stream",
        data: openaiMessage({
          content: null,
          tool_calls: [openaiToolCall("web_search", "Acme Corp")],
        }),
      },
      { kind: "stream", data: openaiMessage({ content: "Acme is a company." }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result).toEqual({ content: "Acme is a company." });
    expect(mockedInvoke).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: expect.objectContaining({ tools: expect.any(Array) }) }),
    );
  });

  it("advertises no tools when web search is disabled", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Plain answer." }) },
    ]);
    const result = await sendMessage([], { ...baseConfig, webSearchEnabled: false }, "system");
    expect(result).toEqual({ content: "Plain answer." });
    const chatCalls = mockedInvoke.mock.calls.filter((c) => c[0] === "zen_chat_stream");
    expect(chatCalls.length).toBeGreaterThan(0);
    for (const call of chatCalls) {
      expect(call[1]).not.toHaveProperty("payload.tools");
    }
  });

  it("returns drafted text when the model repeats the same tool call", async () => {
    const sameCall = openaiToolCall("web_search", "Acme Corp");
    mockChatSequence([
      {
        kind: "stream",
        data: openaiMessage({ content: "Let me research that.", tool_calls: [sameCall] }),
      },
      {
        kind: "stream",
        data: openaiMessage({ content: null, tool_calls: [sameCall] }),
      },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("Let me research that.");
  });

  it("fails cleanly when a loop repeats a call without drafting anything", async () => {
    const sameCall = openaiToolCall("web_search", "Acme Corp");
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: null, tool_calls: [sameCall] }) },
      { kind: "stream", data: openaiMessage({ content: null, tool_calls: [sameCall] }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.error).toMatch(/stuck repeating/);
  });

  it("returns the draft when the round cap is reached with unique calls", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_fetch_page") return "Page text.";
      if (cmd === "zen_chat_stream_cancel") return null;
      if (cmd === "zen_chat_stream") {
        round += 1;
        const query = `query-${round}`;
        setTimeout(() => {
          streamOnEvent(args)?.onmessage({
            type: "done",
            data: openaiMessage({
              content: `Draft ${round}.`,
              tool_calls: [openaiToolCall("web_search", query)],
            }),
          });
        });
        return `req-${round}`;
      }
      return null;
    });
    const result = await sendMessage([], baseConfig, "system");
    expect(round).toBe(15);
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("Draft 1.");
  });

  it("errors after the round cap when the model never writes anything", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_fetch_page") return "Page text.";
      if (cmd === "zen_chat_stream_cancel") return null;
      if (cmd === "zen_chat_stream") {
        round += 1;
        setTimeout(() => {
          streamOnEvent(args)?.onmessage({
            type: "done",
            data: openaiMessage({
              content: null,
              tool_calls: [openaiToolCall("web_search", `query-${round}`)],
            }),
          });
        });
        return `req-${round}`;
      }
      return null;
    });
    const result = await sendMessage([], baseConfig, "system");
    expect(result.content).toBe("");
    expect(result.error).toMatch(/kept requesting web tools/);
  });

  it("retries without tools when the model rejects the tools field", async () => {
    mockChatSequence([
      { kind: "streamError", message: "API error (400): tools are not supported" },
      { kind: "plain", data: openaiMessage({ content: "Plain answer without tools." }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.content).toContain("[Web search unavailable");
    expect(result.content).toContain("Plain answer without tools.");
  });

  it("falls back to one-shot requests when the provider rejects streaming", async () => {
    mockChatSequence([
      { kind: "streamError", message: "SSE streaming is not supported by this provider" },
      { kind: "plain", data: openaiMessage({ content: "One-shot answer." }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.content).toBe("One-shot answer.");
  });

  it("returns the partial answer when stopped mid-stream", async () => {
    mockChatSequence([{ kind: "hang", deltas: ["Hello", ", I was cut off"] }]);
    const controller = new AbortController();
    const promise = sendMessage([], baseConfig, "system", {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    const result = await promise;
    expect(result.stopped).toBe(true);
    expect(result.content).toContain("Hello");
    expect(result.content).toContain("cut off");
    expect(mockedInvoke).toHaveBeenCalledWith(
      "zen_chat_stream_cancel",
      expect.objectContaining({ id: expect.any(String) }),
    );
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await sendMessage([], baseConfig, "system", {
      signal: controller.signal,
    });
    expect(result.stopped).toBe(true);
  });
});

describe("sendMessage (Anthropic)", () => {
  const anthropicConfig: ApiConfig = { ...baseConfig, provider: "anthropic" };

  function anthropicToolUse(id: string, query: string) {
    return { type: "tool_use", id, name: "web_search", input: { query } };
  }

  function anthropicText(text: string) {
    return { type: "text", text };
  }

  it("runs tool_use blocks and returns the final text", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_chat_stream_cancel") return null;
      if (cmd === "zen_chat_stream") {
        round += 1;
        setTimeout(() => {
          streamOnEvent(args)?.onmessage({
            type: "done",
            data:
              round === 1
                ? { content: [anthropicToolUse("t1", "Acme Corp")] }
                : { content: [anthropicText("Acme is a company.")] },
          });
        });
        return `req-${round}`;
      }
      return null;
    });
    const result = await sendMessage([], anthropicConfig, "system");
    expect(result).toEqual({ content: "Acme is a company." });
  });

  it("returns drafted text when a tool_use repeats", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_chat_stream_cancel") return null;
      if (cmd === "zen_chat_stream") {
        round += 1;
        setTimeout(() => {
          streamOnEvent(args)?.onmessage({
            type: "done",
            data:
              round === 1
                ? {
                    content: [
                      anthropicText("Researching now."),
                      anthropicToolUse("t1", "Acme Corp"),
                    ],
                  }
                : { content: [anthropicToolUse("t2", "Acme Corp")] },
          });
        });
        return `req-${round}`;
      }
      return null;
    });
    const result = await sendMessage([], anthropicConfig, "system");
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("Researching now.");
  });

  it("advertises no tools when web search is disabled", async () => {
    mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "zen_chat_stream_cancel") return null;
      if (cmd === "zen_chat_stream") {
        setTimeout(() => {
          streamOnEvent(args)?.onmessage({
            type: "done",
            data: { content: [anthropicText("Plain answer.")] },
          });
        });
        return "req-1";
      }
      return null;
    });
    const result = await sendMessage(
      [],
      { ...anthropicConfig, webSearchEnabled: false },
      "system",
    );
    expect(result).toEqual({ content: "Plain answer." });
    const chatCalls = mockedInvoke.mock.calls.filter((c) => c[0] === "zen_chat_stream");
    for (const call of chatCalls) {
      expect(call[1]).not.toHaveProperty("payload.tools");
    }
  });
});

describe("deslopText", () => {
  it("sends the draft as the only user message with the de-slop prompt and no tools", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Clean draft." }) },
    ]);
    const result = await deslopText("A sloppy draft.", baseConfig);
    expect(result).toEqual({ content: "Clean draft." });

    const chatCalls = mockedInvoke.mock.calls.filter(
      (c) => c[0] === "zen_chat_stream",
    );
    expect(chatCalls.length).toBeGreaterThan(0);
    for (const call of chatCalls) {
      const payload = (call[1] as {
        payload: {
          messages: Array<{ role: string; content?: string | null }>;
          tools?: unknown;
        };
      }).payload;
      expect(payload.tools).toBeUndefined();
      expect(payload.messages[0].role).toBe("system");
      expect(payload.messages[0].content).toContain("Anti-slop writing rules");
      expect(payload.messages[0].content).toContain("No changes needed");
      expect(payload.messages[1]).toEqual({
        role: "user",
        content: "A sloppy draft.",
      });
    }
  });

  it("returns an error when the API key is missing", async () => {
    const result = await deslopText("Draft.", { ...baseConfig, apiKey: "" });
    expect(result.content).toBe("");
    expect(result.error).toMatch(/API key/i);
  });
});
