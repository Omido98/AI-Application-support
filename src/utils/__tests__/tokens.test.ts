import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  formatTokenEstimate,
  TOKEN_WARN_THRESHOLD,
} from "@/utils/tokens";

describe("estimateTokens", () => {
  it("estimates roughly one token per 4 characters", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("a".repeat(401))).toBe(101);
  });
});

describe("formatTokenEstimate", () => {
  it("formats small counts and thousands", () => {
    expect(formatTokenEstimate(0)).toBe("~0 tokens");
    expect(formatTokenEstimate(900)).toBe("~900 tokens");
    expect(formatTokenEstimate(1234)).toBe("~1.2k tokens");
    expect(formatTokenEstimate(123456)).toBe("~123k tokens");
  });
});

describe("TOKEN_WARN_THRESHOLD", () => {
  it("warns above the threshold", () => {
    expect(TOKEN_WARN_THRESHOLD).toBe(10_000);
    expect(
      estimateTokens("a".repeat(TOKEN_WARN_THRESHOLD * 4 + 1)),
    ).toBeGreaterThan(TOKEN_WARN_THRESHOLD);
  });
});