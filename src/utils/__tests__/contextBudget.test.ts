import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@/stores/chatStore";
import {
  fitHistoryToBudget,
  getContextBudget,
  MESSAGE_OVERHEAD_TOKENS,
} from "@/utils/contextBudget";
import { estimateTokens } from "@/utils/tokens";

function message(role: "user" | "assistant", content: string): ChatMessage {
  return { role, content, timestamp: "2026-01-01T00:00:00.000Z" };
}

describe("getContextBudget", () => {
  it("splits the default window into reply space and an input budget", () => {
    const budget = getContextBudget();
    expect(budget.contextWindow).toBe(128_000);
    expect(budget.outputReserve).toBe(8_000);
    expect(budget.inputBudget).toBe(118_000);
  });

  it("keeps a proportionate reserve for small windows", () => {
    const budget = getContextBudget(5_000);
    expect(budget.contextWindow).toBe(5_000);
    expect(budget.outputReserve).toBe(1_250);
    expect(budget.inputBudget).toBe(1_750);
  });

  it("falls back to the default for invalid or tiny values", () => {
    expect(getContextBudget(100).contextWindow).toBe(128_000);
    expect(getContextBudget(Number.NaN).contextWindow).toBe(128_000);
    expect(getContextBudget(null).contextWindow).toBe(128_000);
  });
});

describe("fitHistoryToBudget", () => {
  it("keeps the newest messages that fit and reports the dropped count", () => {
    // 40 chars = 10 estimated tokens, plus 4 tokens of framing = 14 each.
    const messages = Array.from({ length: 10 }, (_, index) =>
      message("user", `m${index} `.padEnd(40, "x")),
    );
    const fitted = fitHistoryToBudget(messages, { inputBudget: 50 });

    expect(fitted.messages).toHaveLength(3);
    expect(fitted.messages[2].content).toContain("m9");
    expect(fitted.droppedCount).toBe(7);
    expect(fitted.historyTokens).toBe(
      3 * (estimateTokens(messages[0].content) + MESSAGE_OVERHEAD_TOKENS),
    );
    expect(fitted.overBudget).toBe(false);
  });

  it("does not start the kept history with an assistant message", () => {
    const messages = [
      message("assistant", "old reply"),
      message("user", "question"),
      message("assistant", "answer"),
    ];
    const fitted = fitHistoryToBudget(messages, { inputBudget: 10_000 });

    expect(fitted.messages[0].role).toBe("user");
    expect(fitted.messages).toEqual(messages.slice(1));
    expect(fitted.droppedCount).toBe(1);
  });

  it("always keeps the newest message even when it alone exceeds the budget", () => {
    const huge = message("user", "x".repeat(4_000));
    const fitted = fitHistoryToBudget([message("user", "old"), huge], {
      inputBudget: 100,
    });

    expect(fitted.messages).toEqual([huge]);
    expect(fitted.overBudget).toBe(true);
  });

  it("subtracts the system prompt and draft reserve from the budget", () => {
    const messages = Array.from({ length: 6 }, (_, index) =>
      message("user", `m${index} `.padEnd(40, "x")),
    );
    const fitted = fitHistoryToBudget(messages, {
      inputBudget: 100,
      reservedTokens: 58,
    });

    // 100 - 58 leaves 42 tokens, enough for exactly three 14-token messages.
    expect(fitted.messages).toHaveLength(3);
    expect(fitted.availableTokens).toBe(42);
  });

  it("returns an empty selection for an empty thread", () => {
    const fitted = fitHistoryToBudget([], { inputBudget: 100 });
    expect(fitted.messages).toEqual([]);
    expect(fitted.droppedCount).toBe(0);
    expect(fitted.overBudget).toBe(false);
  });
});
