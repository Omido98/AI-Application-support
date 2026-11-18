/**
 * Split a multi-line editor value into trimmed, non-empty entries. Used both
 * for committing list fields and for normalizing them on load.
 */
export function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
