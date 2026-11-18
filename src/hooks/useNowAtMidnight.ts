import { useEffect, useState } from "react";

/** Milliseconds until the next local midnight (at least one second). */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1_000, next.getTime() - now.getTime());
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/**
 * A clock that wakes at local midnight (and after focus/visibility changes)
 * so "today"/"tomorrow" labels and date-dependent analytics do not freeze when
 * the app is left open overnight. It intentionally does not tick every second.
 */
export function useNowAtMidnight(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      timeout = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msUntilNextLocalMidnight(new Date()));
    };
    schedule();

    const refreshIfDayChanged = () => {
      const current = new Date();
      setNow((previous) =>
        sameLocalDay(previous, current) ? previous : current,
      );
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshIfDayChanged();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", refreshIfDayChanged);
    return () => {
      if (timeout !== null) clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", refreshIfDayChanged);
    };
  }, []);

  return now;
}
