export interface SaveQueue {
  /** Queue one write behind every write already in flight. */
  enqueue(save: () => Promise<boolean>): Promise<boolean>;
  /** Wait for the queue to settle; resolves false if a write failed. */
  whenIdle(): Promise<boolean>;
  /** True while a write is queued or running. */
  hasPending(): boolean;
}

/**
 * Serialize writes that target the same file.
 *
 * Debounced stores can otherwise start a second write while the first is still
 * in flight; two atomic temp-file writes can then complete out of order and
 * leave an older snapshot on disk. A queue also gives `flush*` something to
 * await, so closing the window cannot race the last save.
 */
export function createSaveQueue(): SaveQueue {
  let tail: Promise<boolean> = Promise.resolve(true);
  let pending = 0;

  return {
    enqueue(save) {
      pending += 1;
      const run = tail
        .then(() => save())
        .finally(() => {
          pending -= 1;
        });
      // A thrown save must not break the chain for later writes.
      tail = run.catch(() => false);
      return tail;
    },

    async whenIdle() {
      let result = true;
      while (pending > 0) {
        result = await tail;
      }
      return result;
    },

    hasPending() {
      return pending > 0;
    },
  };
}
