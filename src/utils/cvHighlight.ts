export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split text into plain/highlighted segments for a case-insensitive set of
 * terms. Longer terms win, and partial word matches are not highlighted.
 */
export function splitHighlightedText(
  text: string,
  terms: string[],
): HighlightSegment[] {
  const unique = [...new Set(terms.map((term) => term.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 40);
  if (!text || unique.length === 0) {
    return text ? [{ text, highlighted: false }] : [];
  }

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${unique.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), highlighted: false });
    }
    segments.push({ text: match[0], highlighted: true });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false });
  }
  return segments;
}
