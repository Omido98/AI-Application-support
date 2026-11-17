import { describe, expect, it } from "vitest";
import {
  getCvLayout,
  PT_TO_HALF_POINTS,
  PT_TO_PX,
  PT_TO_TWIPS,
} from "@/utils/cvLayout";

describe("CV layout metrics", () => {
  it("keeps DOCX, PDF and preview values derived from the same points", () => {
    const classic = getCvLayout("a4", "classic");

    expect(classic.marginPt).toBe(36);
    expect(classic.marginPt * PT_TO_TWIPS).toBe(720);
    expect(classic.bodyPt * PT_TO_HALF_POINTS).toBe(21);
    expect(classic.marginPx).toBe(classic.marginPt * PT_TO_PX);
    expect(classic.bodyPx).toBe(classic.bodyPt * PT_TO_PX);
    expect(classic.pageWidthPx).toBe(794);
    expect(classic.pageHeightPx).toBe(1123);
  });

  it("uses compact metrics and the correct letter page dimensions", () => {
    const compact = getCvLayout("letter", "compact");

    expect(compact.marginPt).toBe(30);
    expect(compact.marginPt * PT_TO_TWIPS).toBe(600);
    expect(compact.bodyPt).toBe(10);
    expect(compact.marginPx).toBe(40);
    expect(compact.pageWidthPx).toBe(816);
    expect(compact.pageHeightPx).toBe(1056);
    expect(compact.linePx).toBeLessThan(
      getCvLayout("letter", "classic").linePx,
    );
  });
});
