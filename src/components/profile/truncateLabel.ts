/** Shorten long sub-item text (courses, projects, achievements) for labels. */
export function truncateLabel(text: string, max = 60): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + "…";
}
