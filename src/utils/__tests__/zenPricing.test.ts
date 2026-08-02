import { describe, it, expect } from "vitest";
import {
  isFreeModel,
  formatModelPrice,
  ZEN_MODEL_PRICES,
} from "@/utils/zenPricing";

describe("isFreeModel", () => {
  it("returns true for ids ending in -free", () => {
    expect(isFreeModel("deepseek-v4-flash-free")).toBe(true);
  });

  it("returns true for explicitly free model ids", () => {
    expect(isFreeModel("big-pickle")).toBe(true);
  });

  it("returns false for paid models", () => {
    expect(isFreeModel("claude-sonnet-4-5")).toBe(false);
    expect(isFreeModel("deepseek-v4-pro")).toBe(false);
  });
});

describe("formatModelPrice", () => {
  it("returns 'Free' for free models", () => {
    expect(formatModelPrice("deepseek-v4-flash-free")).toBe("Free");
  });

  it("formats a known price from the static map", () => {
    expect(formatModelPrice("deepseek-v4-pro")).toBe(
      "$1.74 in / $3.48 out per 1M",
    );
  });

  it("prefers override prices over the static map", () => {
    expect(
      formatModelPrice("deepseek-v4-pro", {
        "deepseek-v4-pro": { input: 9.99, output: 19.99 },
      }),
    ).toBe("$9.99 in / $19.99 out per 1M");
  });

  it("returns null for unknown models without overrides", () => {
    expect(formatModelPrice("totally-unknown-model")).toBeNull();
  });

  it("contains entries for the default Zen model", () => {
    expect(ZEN_MODEL_PRICES["deepseek-v4-flash"]).toBeDefined();
  });
});
