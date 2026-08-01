/**
 * OpenCode Zen model prices, per 1M tokens (USD), as published on
 * https://opencode.ai/docs/zen (snapshot: July 31, 2026).
 *
 * The Zen `/models` endpoint does not return pricing, so this static map is
 * the source of truth shown in the model dropdown. Prices may change — see
 * the official docs for the latest table.
 */

export interface ModelPrice {
  input: number;
  output: number;
}

export const ZEN_MODEL_PRICES: Record<string, ModelPrice> = {
  "minimax-m3": { input: 0.3, output: 1.2 },
  "minimax-m2.7": { input: 0.3, output: 1.2 },
  "minimax-m2.5": { input: 0.3, output: 1.2 },
  "glm-5.2": { input: 1.4, output: 4.4 },
  "glm-5.1": { input: 1.4, output: 4.4 },
  "glm-5": { input: 1.0, output: 3.2 },
  "kimi-k2.7-code": { input: 0.95, output: 4.0 },
  "kimi-k3": { input: 3.0, output: 15.0 },
  "kimi-k2.6": { input: 0.95, output: 4.0 },
  "kimi-k2.5": { input: 0.6, output: 3.0 },
  "qwen3.7-max": { input: 2.5, output: 7.5 },
  "qwen3.7-plus": { input: 0.4, output: 1.6 },
  "qwen3.6-plus": { input: 0.5, output: 3.0 },
  "qwen3.5-plus": { input: 0.2, output: 1.2 },
  "deepseek-v4-pro": { input: 1.74, output: 3.48 },
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  "claude-fable-5": { input: 10.0, output: 50.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "claude-opus-4-7": { input: 5.0, output: 25.0 },
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-opus-4-5": { input: 5.0, output: 25.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-pro": { input: 2.0, output: 12.0 },
  "gemini-3-flash": { input: 0.5, output: 3.0 },
  "grok-4.5": { input: 2.0, output: 6.0 },
  "grok-build-0.1": { input: 1.0, output: 2.0 },
  "gpt-5.6-sol": { input: 5.0, output: 30.0 },
  "gpt-5.6-terra": { input: 2.0, output: 12.0 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.5": { input: 5.0, output: 30.0 },
  "gpt-5.5-pro": { input: 30.0, output: 180.0 },
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5.4-pro": { input: 30.0, output: 180.0 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.3-codex": { input: 1.75, output: 14.0 },
  "gpt-5.3-codex-spark": { input: 1.75, output: 14.0 },
  "gpt-5.2": { input: 1.75, output: 14.0 },
  "gpt-5.2-codex": { input: 1.75, output: 14.0 },
  "gpt-5.1": { input: 1.07, output: 8.5 },
  "gpt-5.1-codex": { input: 1.07, output: 8.5 },
  "gpt-5.1-codex-max": { input: 1.25, output: 10.0 },
  "gpt-5.1-codex-mini": { input: 0.25, output: 2.0 },
  "gpt-5": { input: 1.07, output: 8.5 },
  "gpt-5-codex": { input: 1.07, output: 8.5 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

/**
 * Models that are free even though their id does not end in "-free".
 */
const FREE_MODEL_IDS = new Set(["big-pickle"]);

export function isFreeModel(id: string): boolean {
  return id.endsWith("-free") || FREE_MODEL_IDS.has(id);
}

export function formatModelPrice(id: string): string | null {
  if (isFreeModel(id)) return "Free";
  const price = ZEN_MODEL_PRICES[id];
  if (!price) return null;
  return `$${price.input} in / $${price.output} out per 1M`;
}
