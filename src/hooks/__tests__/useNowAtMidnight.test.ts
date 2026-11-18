import { describe, expect, it } from "vitest";
import { msUntilNextLocalMidnight } from "@/hooks/useNowAtMidnight";

describe("msUntilNextLocalMidnight", () => {
  it("returns the remaining time to the next local day", () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 0, 1, 23, 59, 0))).toBe(
      60_000,
    );
    expect(msUntilNextLocalMidnight(new Date(2026, 0, 1, 12, 0, 0))).toBe(
      12 * 60 * 60 * 1_000,
    );
  });

  it("never returns zero at midnight", () => {
    expect(
      msUntilNextLocalMidnight(new Date(2026, 0, 1, 0, 0, 0)),
    ).toBeGreaterThanOrEqual(1_000);
  });
});
