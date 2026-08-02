import { describe, it, expect } from "vitest";
import {
  getProvider,
  detectProviderFromKey,
  inferProviderFromBaseUrl,
  isKnownProviderId,
  PROVIDERS,
} from "@/utils/providers";

describe("getProvider", () => {
  it("returns the matching provider definition", () => {
    expect(getProvider("anthropic").label).toBe("Anthropic");
  });

  it("falls back to the first provider for unknown ids", () => {
    expect(getProvider("unknown" as never)).toBe(PROVIDERS[0]);
    expect(getProvider(null)).toBe(PROVIDERS[0]);
    expect(getProvider(undefined)).toBe(PROVIDERS[0]);
  });

  it("every provider has a default base URL and model", () => {
    for (const p of PROVIDERS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(typeof p.defaultBaseUrl).toBe("string");
    }
  });
});

describe("detectProviderFromKey", () => {
  it("detects Anthropic keys by prefix", () => {
    expect(detectProviderFromKey("sk-ant-api03-abcdef")).toBe("anthropic");
  });

  it("returns null for empty or whitespace keys", () => {
    expect(detectProviderFromKey("")).toBeNull();
    expect(detectProviderFromKey("   ")).toBeNull();
  });

  it("returns null for keys without a known prefix", () => {
    expect(detectProviderFromKey("zk-anything")).toBeNull();
  });

  it("does not auto-detect OpenAI from generic sk- keys", () => {
    expect(detectProviderFromKey("sk-123456")).toBeNull();
  });
});

describe("inferProviderFromBaseUrl", () => {
  it("infers zen from opencode.ai/zen URLs", () => {
    expect(inferProviderFromBaseUrl("https://opencode.ai/zen/v1")).toBe("zen");
  });

  it("infers anthropic from api.anthropic.com", () => {
    expect(inferProviderFromBaseUrl("https://api.anthropic.com")).toBe(
      "anthropic",
    );
  });

  it("infers openai from api.openai.com", () => {
    expect(inferProviderFromBaseUrl("https://api.openai.com/v1")).toBe(
      "openai",
    );
  });

  it("defaults to custom for anything else", () => {
    expect(inferProviderFromBaseUrl("https://my-endpoint.example.com")).toBe(
      "custom",
    );
    expect(inferProviderFromBaseUrl(undefined)).toBe("custom");
  });
});

describe("isKnownProviderId", () => {
  it("accepts known provider ids", () => {
    expect(isKnownProviderId("zen")).toBe(true);
    expect(isKnownProviderId("custom")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isKnownProviderId("nonsense")).toBe(false);
    expect(isKnownProviderId(42)).toBe(false);
    expect(isKnownProviderId(null)).toBe(false);
  });
});
