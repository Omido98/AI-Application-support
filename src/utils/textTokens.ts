/**
 * Shared word tokenization for the deterministic CV grounding checks.
 *
 * Kept in one module so the cached profile context and the claim audit use the
 * exact same stop-word list and token rules.
 */
const CLAIM_STOPWORDS = new Set(
  [
    "about",
    "after",
    "again",
    "also",
    "among",
    "and",
    "are",
    "been",
    "before",
    "being",
    "both",
    "built",
    "can",
    "could",
    "created",
    "delivered",
    "designed",
    "developed",
    "did",
    "does",
    "each",
    "for",
    "from",
    "had",
    "has",
    "have",
    "implemented",
    "into",
    "led",
    "made",
    "managed",
    "more",
    "most",
    "not",
    "other",
    "our",
    "over",
    "responsible",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "through",
    "using",
    "was",
    "were",
    "which",
    "while",
    "will",
    "with",
    "work",
    "worked",
    "working",
    "would",
    "your",
  ].map((word) => word.toLowerCase()),
);

/** Lowercase content words used for the claim-overlap audit. */
export function contentTokens(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [])
    .map((token) => token.replace(/[.,]+$/g, ""))
    .filter(
      (token) =>
        token.length >= 3 &&
        !/^\d+$/.test(token) &&
        !CLAIM_STOPWORDS.has(token),
    );
}
