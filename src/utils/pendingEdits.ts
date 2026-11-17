type PendingEditFlush = () => void;

const flushes = new Set<PendingEditFlush>();

/**
 * Register a synchronous flush for a locally buffered editor value. The CV
 * builder uses this so close/backup/export can commit drafts that are still
 * inside a textarea instead of only flushing the Zustand store.
 */
export function registerPendingEditFlush(flush: PendingEditFlush): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

/** Flush every registered draft. One failing editor must not block the rest. */
export function flushPendingEdits(): void {
  for (const flush of [...flushes]) {
    try {
      flush();
    } catch (error) {
      console.error("[pending-edits] Could not flush an editor draft:", error);
    }
  }
}
