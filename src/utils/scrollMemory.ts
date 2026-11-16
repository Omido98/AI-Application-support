/**
 * Session-only scroll offsets for containers that unmount when the user
 * switches sections. Restoring the last position is a convenience, not user
 * data, so it lives in memory for this launch and is never persisted.
 */
export interface ScrollMemoryEntry {
  /** Vertical offset in pixels. */
  top: number;
  /** Whether a chat view was pinned to the newest message (chat only). */
  atBottom?: boolean;
}

const memory = new Map<string, ScrollMemoryEntry>();

export function readScrollMemory(key: string): ScrollMemoryEntry | undefined {
  return memory.get(key);
}

export function writeScrollMemory(key: string, entry: ScrollMemoryEntry): void {
  memory.set(key, entry);
}
