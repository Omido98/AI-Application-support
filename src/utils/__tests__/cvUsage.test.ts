import { describe, expect, it } from "vitest";
import type { ApiConfig } from "@/stores/chatStore";
import { formatCvUsage, makeCvUsage } from "@/utils/cvUsage";

const zenConfig = {
  provider: "zen",
  baseUrl: "https://example.com/v1",
  model: "deepseek-v4-flash-free",
  apiKey: "key",
} as ApiConfig;

describe("makeCvUsage", () => {
  it("sums tokens across a retry and marks free Zen models free", () => {
    const usage = makeCvUsage("generate", zenConfig, [
      { inputTokens: 1_000, outputTokens: 500 },
      { inputTokens: 300, outputTokens: 200 },
    ]);

    expect(usage).toMatchObject({
      kind: "generate",
      model: "deepseek-v4-flash-free",
      inputTokens: 1_300,
      outputTokens: 700,
      costUsd: 0,
    });
    expect(usage?.at).toBeTruthy();
  });

  it("leaves cost unknown for non-Zen providers and empty usage undefined", () => {
    const usage = makeCvUsage("rewrite", { ...zenConfig, provider: "openai" }, [
      { inputTokens: 100, outputTokens: 50 },
    ]);
    expect(usage?.inputTokens).toBe(100);
    expect(usage?.costUsd).toBeUndefined();
    expect(makeCvUsage("generate", zenConfig, [{}, undefined])).toBeUndefined();
  });
});

describe("formatCvUsage", () => {
  it("formats tokens and known cost compactly", () => {
    expect(
      formatCvUsage({
        kind: "generate",
        at: "2026-01-01T00:00:00.000Z",
        model: "free",
        inputTokens: 1_234,
        outputTokens: 900,
        costUsd: 0,
      }),
    ).toBe("1.2k in · 900 out · free");
    expect(
      formatCvUsage({
        kind: "rewrite",
        at: "2026-01-01T00:00:00.000Z",
        model: "unknown",
        inputTokens: 100,
        outputTokens: 20,
      }),
    ).toBe("100 in · 20 out");
  });
});
