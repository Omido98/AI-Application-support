/**
 * Coalesces streamed text chunks into one update per scheduled frame.
 *
 * The scheduler is injected so the behavior can be tested without a DOM:
 * `requestAnimationFrame`/`cancelAnimationFrame` in the app, a manual fake in
 * tests.
 */

export interface StreamBatcher {
  /** Add a chunk. Schedules one flush if none is pending. */
  push(chunk: string): void;
  /** Emit whatever is buffered immediately and cancel the scheduled flush. */
  flush(): void;
  /** Drop buffered text and cancel the scheduled flush. */
  cancel(): void;
}

export function createStreamBatcher(
  onFlush: (text: string) => void,
  schedule: (callback: () => void) => number,
  cancel: (handle: number) => void,
): StreamBatcher {
  let buffer = "";
  let handle: number | null = null;

  const emit = () => {
    handle = null;
    const text = buffer;
    buffer = "";
    if (text) onFlush(text);
  };

  return {
    push(chunk) {
      if (!chunk) return;
      buffer += chunk;
      if (handle === null) {
        handle = schedule(emit);
      }
    },
    flush() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      emit();
    },
    cancel() {
      if (handle !== null) {
        cancel(handle);
        handle = null;
      }
      buffer = "";
    },
  };
}
