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

/** Format an estimate compactly, e.g. "~12.4k tokens". */
export function formatTokenEstimate(tokens: number): string {
  if (tokens < 1000) return `~${tokens} tokens`;
  const k = tokens / 1000;
  return `~${k >= 100 ? Math.round(k) : k.toFixed(1)}k tokens`;
}