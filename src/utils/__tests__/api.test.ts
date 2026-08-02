import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendMessage } from "@/utils/api";
import type { ApiConfig } from "@/stores/chatStore";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
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

/** Make zen_chat answer from a sequence of responses (one per round). */
function mockOpenAiSequence(rounds: unknown[]) {
  let round = 0;
  mockedInvoke.mockImplementation(async (cmd: string) => {
    if (cmd === "zen_web_search") return searchResult;
    if (cmd === "zen_fetch_page") return "Page text.";
    if (cmd === "zen_chat") {
      const response = rounds[Math.min(round, rounds.length - 1)];
      round += 1;
      return response;
    }
    return null;
  });
}

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("sendMessage (OpenAI-compatible)", () => {
  it("returns plain text answers without tool calls", async () => {
    mockOpenAiSequence([openaiMessage({ content: "Hello!" })]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result).toEqual({ content: "Hello!" });
  });

  it("runs tool calls and returns the final answer", async () => {
    mockOpenAiSequence([
      openaiMessage({ content: null, tool_calls: [openaiToolCall("web_search", "Acme Corp")] }),
      openaiMessage({ content: "Acme is a company." }),
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result).toEqual({ content: "Acme is a company." });
    expect(mockedInvoke).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ payload: expect.objectContaining({ tools: expect.any(Array) }) }),
    );
  });

  it("advertises no tools when web search is disabled", async () => {
    mockOpenAiSequence([openaiMessage({ content: "Plain answer." })]);
    const result = await sendMessage([], { ...baseConfig, webSearchEnabled: false }, "system");
    expect(result).toEqual({ content: "Plain answer." });
    const chatCalls = mockedInvoke.mock.calls.filter((c) => c[0] === "zen_chat");
    expect(chatCalls.length).toBeGreaterThan(0);
    for (const call of chatCalls) {
      expect(call[1]).not.toHaveProperty("payload.tools");
    }
  });

  it("returns drafted text when the model repeats the same tool call", async () => {
    const sameCall = openaiToolCall("web_search", "Acme Corp");
    mockOpenAiSequence([
      openaiMessage({ content: "Let me research that.", tool_calls: [sameCall] }),
      openaiMessage({ content: null, tool_calls: [sameCall] }),
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("Let me research that.");
  });

  it("fails cleanly when a loop repeats a call without drafting anything", async () => {
    const sameCall = openaiToolCall("web_search", "Acme Corp");
    mockOpenAiSequence([
      openaiMessage({ content: null, tool_calls: [sameCall] }),
      openaiMessage({ content: null, tool_calls: [sameCall] }),
    ]);
    const result = await sendMessage([], baseConfig, "system");
    expect(result.error).toMatch(/stuck repeating/);
  });

  it("returns the draft when the round cap is reached with unique calls", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_fetch_page") return "Page text.";
      if (cmd === "zen_chat") {
        round += 1;
        const query = `query-${round}`;
        return openaiMessage({
          content: `Draft ${round}.`,
          tool_calls: [openaiToolCall("web_search", query)],
        });
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
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_fetch_page") return "Page text.";
      if (cmd === "zen_chat") {
        round += 1;
        return openaiMessage({
          content: null,
          tool_calls: [openaiToolCall("web_search", `query-${round}`)],
        });
      }
      return null;
    });
    const result = await sendMessage([], baseConfig, "system");
    expect(result.content).toBe("");
    expect(result.error).toMatch(/kept requesting web tools/);
  });

  it("retries without tools when the model rejects the tools field", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "zen_chat") {
        round += 1;
        if (round === 1) {
          throw "API error (400): tools are not supported";
        }
        return openaiMessage({ content: "Plain answer without tools." });
      }
      return null;
    });
    const result = await sendMessage([], baseConfig, "system");
    expect(result.content).toContain("[Web search unavailable");
    expect(result.content).toContain("Plain answer without tools.");
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
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_chat") {
        round += 1;
        if (round === 1) return { content: [anthropicToolUse("t1", "Acme Corp")] };
        return { content: [anthropicText("Acme is a company.")] };
      }
      return null;
    });
    const result = await sendMessage([], anthropicConfig, "system");
    expect(result).toEqual({ content: "Acme is a company." });
  });

  it("returns drafted text when a tool_use repeats", async () => {
    let round = 0;
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "zen_web_search") return searchResult;
      if (cmd === "zen_chat") {
        round += 1;
        if (round === 1) {
          return {
            content: [anthropicText("Researching now."), anthropicToolUse("t1", "Acme Corp")],
          };
        }
        return { content: [anthropicToolUse("t2", "Acme Corp")] };
      }
      return null;
    });
    const result = await sendMessage([], anthropicConfig, "system");
    expect(result.error).toBeUndefined();
    expect(result.content).toContain("Researching now.");
  });

  it("advertises no tools when web search is disabled", async () => {
    mockedInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "zen_chat") return { content: [anthropicText("Plain answer.")] };
      return null;
    });
    const result = await sendMessage(
      [],
      { ...anthropicConfig, webSearchEnabled: false },
      "system",
    );
    expect(result).toEqual({ content: "Plain answer." });
    const chatCalls = mockedInvoke.mock.calls.filter((c) => c[0] === "zen_chat");
    for (const call of chatCalls) {
      expect(call[1]).not.toHaveProperty("payload.tools");
    }
  });
});
