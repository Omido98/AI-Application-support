import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendMessage,
  deslopText,
  reviewDraft,
  reviseDraft,
  improveDraft,
  deepImproveDraft,
  verifyDraft,
  parseReviewVerdict,
  MAX_REVISION_LOOPS,
  setPaceDelayMs,
} from "@/utils/api";
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
  setPaceDelayMs(0);
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

  it("allows a repeated call and finishes normally", async () => {
    const sameCall = openaiToolCall("web_search", "Acme Corp");
    mockChatSequence([
      {
        kind: "stream",
        data: openaiMessage({ content: null, tool_calls: [sameCall] }),
      },
      {
        kind: "stream",
        data: openaiMessage({ content: null, tool_calls: [sameCall] }),
      },
      { kind: "stream", data: openaiMessage({ content: "Acme is a company." }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result).toEqual({ content: "Acme is a company." });
  });

  it("does not treat an interleaved repeat (A, B, A) as a loop", async () => {
    mockChatSequence([
      {
        kind: "stream",
        data: openaiMessage({
          content: null,
          tool_calls: [openaiToolCall("web_search", "Acme Corp")],
        }),
      },
      {
        kind: "stream",
        data: openaiMessage({
          content: null,
          tool_calls: [openaiToolCall("fetch_page", "https://acme.example")],
        }),
      },
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
  });

  it("finishes with a tools-free answer when the model repeats the same call three times", async () => {
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
      {
        kind: "stream",
        data: openaiMessage({ content: null, tool_calls: [sameCall] }),
      },
      { kind: "plain", data: openaiMessage({ content: "Final answer." }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("[Web research stopped");
    expect(result.content).toContain("Final answer.");
  });

  it("fails cleanly when three repeats and the tools-free round draft nothing", async () => {
    const sameCall = openaiToolCall("web_search", "Acme Corp");
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: null, tool_calls: [sameCall] }) },
      { kind: "stream", data: openaiMessage({ content: null, tool_calls: [sameCall] }) },
      { kind: "stream", data: openaiMessage({ content: null, tool_calls: [sameCall] }) },
      { kind: "plain", data: openaiMessage({ content: null }) },
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.error).toMatch(/stuck repeating/);
  });

  it("finishes with a tools-free answer when the round cap is reached with unique calls", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_fetch_page") return "Page text.";
      if (cmd === "zen_chat_stream_cancel") return null;
      if (cmd === "zen_chat") return openaiMessage({ content: "Final answer." });
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
    expect(result.content).toContain("[Web research stopped");
    expect(result.content).toContain("Final answer.");
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

  it("finishes with a tools-free answer when a tool_use repeats three times", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string, args: unknown) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_chat_stream_cancel") return null;
      if (cmd === "zen_chat") {
        return { content: [anthropicText("Final answer.")] };
      }
      if (cmd === "zen_chat_stream") {
        round += 1;
        setTimeout(() => {
          streamOnEvent(args)?.onmessage({
            type: "done",
            data: {
              content: [anthropicToolUse(`t${round}`, "Acme Corp")],
            },
          });
        });
        return `req-${round}`;
      }
      return null;
    });
    const result = await sendMessage([], anthropicConfig, "system");
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("[Web research stopped");
    expect(result.content).toContain("Final answer.");
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

describe("reviewDraft", () => {
  const appContext = {
    company: "Acme Corp",
    jobDescription: "Build the platform",
    language: "English",
    requirements: "Cover letter",
    companyResearch: "",
  };

  it("sends the review prompt with tools enabled and the draft embedded", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Review feedback." }) },
    ]);
    const result = await reviewDraft(
      "Dear Acme Corp, ...",
      appContext,
      null,
      baseConfig,
    );
    expect(result).toEqual({ content: "Review feedback." });

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
      expect(payload.tools).toBeDefined();
      expect(payload.messages[0].role).toBe("system");
      expect(payload.messages[0].content).toContain("hiring manager proxy");
      expect(payload.messages[0].content).toContain("Dear Acme Corp, ...");
      expect(payload.messages[0].content).toContain("- Company: Acme Corp");
      expect(payload.messages[1]).toEqual({
        role: "user",
        content: "Review the draft above.",
      });
    }
  });

  it("returns an error when the API key is missing", async () => {
    const result = await reviewDraft(
      "Draft.",
      appContext,
      null,
      { ...baseConfig, apiKey: "" },
    );
    expect(result.content).toBe("");
    expect(result.error).toMatch(/API key/i);
  });
});

describe("verifyDraft", () => {
  it("sends the check-reading prompt with no tools", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "VERDICT: PASS" }) },
    ]);
    const result = await verifyDraft("Revised draft.", "Review feedback.", baseConfig);
    expect(result).toEqual({ content: "VERDICT: PASS" });

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
      expect(payload.messages[0].content).toContain("check-reading");
      expect(payload.messages[0].content).toContain("VERDICT: PASS");
      expect(payload.messages[0].content).toContain("Revised draft.");
      expect(payload.messages[0].content).toContain("Review feedback.");
      expect(payload.messages[1]).toEqual({
        role: "user",
        content: "Verify whether the revised draft above addresses the feedback below.",
      });
    }
  });

  it("returns an error when the API key is missing", async () => {
    const result = await verifyDraft("Draft.", "Review.", {
      ...baseConfig,
      apiKey: "",
    });
    expect(result.content).toBe("");
    expect(result.error).toMatch(/API key/i);
  });
});

describe("parseReviewVerdict", () => {
  it("reads PASS from the trailing verdict line", () => {
    expect(parseReviewVerdict("Looks good.\nVERDICT: PASS")).toBe("pass");
  });

  it("reads REVISE case-insensitively", () => {
    expect(parseReviewVerdict("Needs work.\nVERDICT: revise")).toBe("revise");
  });

  it("returns unknown when no verdict line is present", () => {
    expect(parseReviewVerdict("No verdict here.")).toBe("unknown");
  });

  it("ignores verdict-like text that is not on its own line", () => {
    expect(parseReviewVerdict("Some VERDICT: PASS inline.")).toBe("unknown");
  });
});

describe("reviseDraft", () => {
  it("sends the revision prompt with the draft, review, and no tools", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Revised draft." }) },
    ]);
    const result = await reviseDraft(
      "Dear Acme Corp, ...",
      "Review feedback.",
      null,
      baseConfig,
    );
    expect(result).toEqual({ content: "Revised draft." });

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
      expect(payload.messages[0].content).toContain("senior application writer");
      expect(payload.messages[0].content).toContain("Review feedback.");
      expect(payload.messages[0].content).toContain("Dear Acme Corp, ...");
      expect(payload.messages[0].content).not.toContain("Job Description");
      expect(payload.messages[0].content).not.toContain("Build the platform");
      expect(payload.messages[1]).toEqual({
        role: "user",
        content: "Revise the draft above.",
      });
    }
  });

  it("returns an error when the API key is missing", async () => {
    const result = await reviseDraft(
      "Draft.",
      "Review.",
      null,
      { ...baseConfig, apiKey: "" },
    );
    expect(result.content).toBe("");
    expect(result.error).toMatch(/API key/i);
  });
});

describe("improveDraft", () => {
  const appContext = {
    company: "Acme Corp",
    jobDescription: "Build the platform",
    language: "English",
    requirements: "Cover letter",
    companyResearch: "",
  };

  it("runs only the de-slop pass when the first review passes", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "No issues.\n\nVERDICT: PASS" }) },
      { kind: "stream", data: openaiMessage({ content: "Final draft." }) },
    ]);
    const steps: string[] = [];
    const result = await improveDraft("Original draft.", appContext, null, baseConfig, {
      onStep: (s) => steps.push(s),
    });
    expect(result.content).toBe("Final draft.");
    expect(result.rounds).toBe(0);
    expect(result.verdict).toBe("pass");
    expect(steps).toEqual(["review", "deslop"]);
  });

  it("keeps the draft when the de-slop pass finds nothing to change", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Good.\n\nVERDICT: PASS" }) },
      { kind: "stream", data: openaiMessage({ content: "No changes needed." }) },
    ]);
    const result = await improveDraft("Original draft.", appContext, null, baseConfig);
    expect(result.content).toBe("Original draft.");
    expect(result.rounds).toBe(0);
    expect(result.verdict).toBe("pass");
  });

  it("runs a single revise round and stops in quick mode", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Needs work.\n\nVERDICT: REVISE" }) },
      {
        kind: "stream",
        deltas: ["Improved ", "draft."],
        data: openaiMessage({ content: "Improved draft." }),
      },
    ]);
    const steps: string[] = [];
    const deltas: string[] = [];
    const result = await improveDraft("Original draft.", appContext, null, baseConfig, {
      onStep: (s) => steps.push(s),
      onDelta: (t) => deltas.push(t),
    });
    expect(result.content).toBe("Improved draft.");
    expect(result.rounds).toBe(1);
    expect(result.verdict).toBe("revise");
    expect(steps).toEqual(["review", "revise"]);
    expect(deltas).toEqual(["Improved ", "draft."]);
  });

  it("surfaces review errors and reports zero rounds", async () => {
    mockChatSequence([{ kind: "streamError", message: "boom" }]);
    const result = await improveDraft("Draft.", appContext, null, baseConfig);
    expect(result.error).toBe("boom");
    expect(result.rounds).toBe(0);
    expect(result.verdict).toBe("unknown");
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await improveDraft("Draft.", appContext, null, baseConfig, {
      signal: controller.signal,
    });
    expect(result.stopped).toBe(true);
    expect(result.content).toBe("");
    expect(result.rounds).toBe(0);
  });
});

describe("deepImproveDraft", () => {
  const appContext = {
    company: "Acme Corp",
    jobDescription: "Build the platform",
    language: "English",
    requirements: "Cover letter",
    companyResearch: "",
  };

  it("verifies after each round and stops when the verifier passes", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "Needs work.\n\nVERDICT: REVISE" }) },
      {
        kind: "stream",
        deltas: ["Improved ", "draft."],
        data: openaiMessage({ content: "Improved draft." }),
      },
      { kind: "stream", data: openaiMessage({ content: "Better.\n\nVERDICT: PASS" }) },
    ]);
    const steps: string[] = [];
    const deltas: string[] = [];
    const result = await deepImproveDraft("Original draft.", appContext, null, baseConfig, {
      onStep: (s) => steps.push(s),
      onDelta: (t) => deltas.push(t),
    });
    expect(result.content).toBe("Improved draft.");
    expect(result.rounds).toBe(1);
    expect(result.verdict).toBe("pass");
    expect(steps).toEqual(["review", "revise", "verify"]);
    expect(deltas).toEqual(["Improved ", "draft."]);
  });

  it("iterates until the verifier passes and revises against the original review feedback", async () => {
    mockChatSequence([
      { kind: "stream", data: openaiMessage({ content: "REVISE round 1.\n\nVERDICT: REVISE" }) },
      { kind: "stream", data: openaiMessage({ content: "Draft v1." }) },
      { kind: "stream", data: openaiMessage({ content: "STILL REVISE.\n\nVERDICT: REVISE" }) },
      { kind: "stream", data: openaiMessage({ content: "Draft v2." }) },
      { kind: "stream", data: openaiMessage({ content: "Acceptable.\n\nVERDICT: PASS" }) },
    ]);
    const steps: string[] = [];
    const result = await deepImproveDraft("Original draft.", appContext, null, baseConfig, {
      onStep: (s) => steps.push(s),
    });
    expect(result.content).toBe("Draft v2.");
    expect(result.rounds).toBe(2);
    expect(result.verdict).toBe("pass");
    expect(steps).toEqual([
      "review",
      "revise",
      "verify",
      "revise",
      "verify",
    ]);

    // Every revise call must embed the same original review report as feedback.
    const payloads = mockedInvoke.mock.calls
      .filter((c) => c[0] === "zen_chat_stream")
      .map((c) => (c[1] as { payload: { messages: Array<{ role: string; content?: string | null }> } }).payload);
    const reviseSystemPrompts = payloads
      .map((p) => p.messages[0].content ?? "")
      .filter((c) => c.includes("senior application writer"));
    expect(reviseSystemPrompts.length).toBe(2);
    expect(reviseSystemPrompts[0]).toContain("REVISE round 1.");
    expect(reviseSystemPrompts[1]).toContain("REVISE round 1.");
  });

  it("caps the loop at MAX_REVISION_LOOPS and returns the last draft", async () => {
    const rounds: Round[] = [];
    rounds.push({ kind: "stream", data: openaiMessage({ content: "REVISE.\n\nVERDICT: REVISE" }) });
    for (let i = 1; i <= MAX_REVISION_LOOPS; i++) {
      rounds.push({ kind: "stream", data: openaiMessage({ content: `Draft v${i}.` }) });
      rounds.push({ kind: "stream", data: openaiMessage({ content: "REVISE.\n\nVERDICT: REVISE" }) });
    }
    mockChatSequence(rounds);
    const result = await deepImproveDraft("Original draft.", appContext, null, baseConfig);
    expect(result.content).toBe(`Draft v${MAX_REVISION_LOOPS}.`);
    expect(result.rounds).toBe(MAX_REVISION_LOOPS);
    expect(result.verdict).toBe("revise");
  });
});
