/**
 * A small word-level diff for draft revisions.
 *
 * The inputs are cover-letter-sized text. An LCS table is simple and fast
 * enough at that scale; above a safety threshold the diff degrades to
 * "everything removed / everything added" rather than allocating a huge table.
 */

export type DiffSegmentType = "same" | "add" | "remove";

export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

export interface WordDiff {
  segments: DiffSegment[];
  added: number;
  removed: number;
  /** True when the text was too large for the word-level table. */
  truncated: boolean;
}

const MAX_DP_CELLS = 4_000_000;

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function isVisibleToken(text: string): boolean {
  return text.trim().length > 0;
}

function countVisible(tokens: string[]): number {
  return tokens.filter(isVisibleToken).length;
}

function fallbackDiff(before: string, after: string): WordDiff {
  const segments: DiffSegment[] = [];
  if (before) segments.push({ type: "remove", text: before });
  if (after) segments.push({ type: "add", text: after });
  return {
    segments,
    added: countVisible(tokenize(after)),
    removed: countVisible(tokenize(before)),
    truncated: true,
  };
}

export function diffWords(before: string, after: string): WordDiff {
  if (before === after) {
    return {
      segments: before ? [{ type: "same", text: before }] : [],
      added: 0,
      removed: 0,
      truncated: false,
    };
  }

  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > MAX_DP_CELLS) {
    return fallbackDiff(before, after);
  }

  // dp[i][j] = LCS length of a[i..] and b[j..].
  const dp: Uint32Array[] = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segments: DiffSegment[] = [];
  const push = (type: DiffSegmentType, text: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.text += text;
      return;
    }
    segments.push({ type, text });
  };

  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      if (isVisibleToken(a[i])) removed += 1;
      push("remove", a[i]);
      i += 1;
    } else {
      if (isVisibleToken(b[j])) added += 1;
      push("add", b[j]);
      j += 1;
    }
  }
  while (i < a.length) {
    if (isVisibleToken(a[i])) removed += 1;
    push("remove", a[i]);
    i += 1;
  }
  while (j < b.length) {
    if (isVisibleToken(b[j])) added += 1;
    push("add", b[j]);
    j += 1;
  }

  return { segments, added, removed, truncated: false };
}
