/**
 * Rough input-token estimate for a request (chars / 4, the common
 * approximation for English text). Used for the live usage readout and the
 * pre-send warning; exact billing may differ.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Warn when a single request's estimated input tokens exceed this. */
export const TOKEN_WARN_THRESHOLD = 10_000;

/** Conservative default for models whose real context window is unknown. */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** Smallest context window the UI accepts. Local models below this are rare. */
export const MIN_CONTEXT_WINDOW = 4_000;

/** Tokens reserved for the reply so the prompt does not consume the window. */
export const DEFAULT_CONTEXT_OUTPUT_RESERVE = 8_000;

/** Extra headroom for provider-side formatting and estimation error. */
export const CONTEXT_SAFETY_MARGIN = 2_000;

/** Format an estimate compactly, e.g. "~12.4k tokens". */
export function formatTokenEstimate(tokens: number): string {
  if (tokens < 1000) return `~${tokens} tokens`;
  const k = tokens / 1000;
  return `~${k >= 100 ? Math.round(k) : k.toFixed(1)}k tokens`;
}

/** Format a token limit without the estimate tilde, e.g. "128k". */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  const k = tokens / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
}
