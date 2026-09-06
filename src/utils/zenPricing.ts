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
 * OpenCode Zen model display names, as published on
 * https://opencode.ai/docs/zen (snapshot: August 24, 2026).
 *
 * The Zen `/models` endpoint only returns IDs, so this static map is the
 * offline fallback shown in the model dropdown. Fresh names are scraped
 * live from the docs endpoints table when possible; models missing from
 * both sources fall back to their raw ID.
 */
export const ZEN_MODEL_NAMES: Record<string, string> = {
  "gpt-5.6-sol": "GPT 5.6 Sol",
  "gpt-5.6-terra": "GPT 5.6 Terra",
  "gpt-5.6-luna": "GPT 5.6 Luna",
  "gpt-5.5": "GPT 5.5",
  "gpt-5.5-pro": "GPT 5.5 Pro",
  "gpt-5.4": "GPT 5.4",
  "gpt-5.4-pro": "GPT 5.4 Pro",
  "gpt-5.4-mini": "GPT 5.4 Mini",
  "gpt-5.4-nano": "GPT 5.4 Nano",
  "gpt-5.3-codex": "GPT 5.3 Codex",
  "gpt-5.3-codex-spark": "GPT 5.3 Codex Spark",
  "gpt-5.2": "GPT 5.2",
  "gpt-5.2-codex": "GPT 5.2 Codex",
  "gpt-5.1": "GPT 5.1",
  "gpt-5.1-codex": "GPT 5.1 Codex",
  "gpt-5.1-codex-max": "GPT 5.1 Codex Max",
  "gpt-5.1-codex-mini": "GPT 5.1 Codex Mini",
  "gpt-5": "GPT 5",
  "gpt-5-codex": "GPT 5 Codex",
  "gpt-5-nano": "GPT 5 Nano",
  "claude-fable-5": "Claude Fable 5",
  "claude-opus-5": "Claude Opus 5",
  "claude-opus-4-8": "Claude Opus 4.8",
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-opus-4-5": "Claude Opus 4.5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "gemini-3.7-flash": "Gemini 3.7 Flash",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "grok-4.6": "Grok 4.6",
  "grok-4.5": "Grok 4.5",
  "grok-build-0.1": "Grok Build 0.1",
  "muse-spark-1.2": "Muse Spark 1.2",
  "qwen3.7-max": "Qwen3.7 Max",
  "qwen3.7-plus": "Qwen3.7 Plus",
  "qwen3.6-plus": "Qwen3.6 Plus",
  "qwen3.5-plus": "Qwen3.5 Plus",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "minimax-m3": "MiniMax M3",
  "minimax-m2.7": "MiniMax M2.7",
  "minimax-m2.5": "MiniMax M2.5",
  "glm-5.2": "GLM 5.2",
  "glm-5.1": "GLM 5.1",
  "glm-5": "GLM 5",
  "kimi-k3": "Kimi K3",
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "kimi-k2.6": "Kimi K2.6",
  "kimi-k2.5": "Kimi K2.5",
  "big-pickle": "Big Pickle",
  "x-preview-f-free": "Ox Alpha Free",
  "mimo-v2.5-free": "MiMo-V2.5 Free",
  "hy3-free": "Hy3 Free",
  "nemotron-3-ultra-free": "Nemotron 3 Ultra Free",
  "nemotron-3.5-lightning-free": "Nemotron 3.5 Lightning Free",
  "muse-spark-1.2-contributor-free": "Muse Spark 1.2 Contributor Free",
};

/**
 * Models that are free even though their id does not end in "-free".
 */
const FREE_MODEL_IDS = new Set(["big-pickle"]);

export function isFreeModel(id: string): boolean {
  return id.endsWith("-free") || FREE_MODEL_IDS.has(id);
}

export function formatModelPrice(
  id: string,
  overrides?: Record<string, ModelPrice> | null,
): string | null {
  if (isFreeModel(id)) return "Free";
  const price = overrides?.[id] ?? ZEN_MODEL_PRICES[id];
  if (!price) return null;
  return `$${price.input} in / $${price.output} out per 1M`;
}

/**
 * Models the Zen /models endpoint still advertises but the Zen docs no
 * longer list (endpoints + pricing tables): they were removed or
 * deprecated upstream and likely no longer work.
 *
 * Returns an empty set when pricing is null/empty (docs scrape failed and
 * no cache exists) so nothing gets flagged without evidence.
 */
export function computeRemovedModelIds(
  models: string[],
  pricing: { id: string }[] | null,
): Set<string> {
  if (!pricing || pricing.length === 0) return new Set();
  const documented = new Set(pricing.map((entry) => entry.id));
  return new Set(models.filter((id) => !documented.has(id)));
}
