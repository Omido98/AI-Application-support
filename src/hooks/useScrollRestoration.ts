import { useCallback, useEffect, useRef } from "react";
import { readScrollMemory, writeScrollMemory } from "@/utils/scrollMemory";

/**
 * Remember a scroll container's vertical offset for the session, so switching
 * away from a tab and back does not send the user to the top. The element may
 * unmount while its tab is hidden; the offset is re-applied when it mounts.
 *
 * Returns a callback ref: it attaches as soon as the scrollable element
 * exists, which matters for tabs that render a loading state first.
 */
export function useScrollRestoration<T extends HTMLElement>(
  key: string,
): (element: T | null) => void {
  const cleanupRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<number | null>(null);

  const attach = useCallback(
    (element: T | null) => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (!element) return;

      const saved = readScrollMemory(key);
      if (saved) {
        // Wait one frame so the restored content has laid out; applying the
        // offset before a tall list exists would clamp it to zero.
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          element.scrollTop = saved.top;
        });
      }

      const onScroll = () => {
        writeScrollMemory(key, {
          ...readScrollMemory(key),
          top: element.scrollTop,
        });
      };
      element.addEventListener("scroll", onScroll, { passive: true });
      cleanupRef.current = () => {
        element.removeEventListener("scroll", onScroll);
      };
    },
    [key],
  );

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  return attach;
}
