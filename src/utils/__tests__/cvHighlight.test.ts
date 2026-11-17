import { describe, expect, it } from "vitest";
import { splitHighlightedText } from "@/utils/cvHighlight";

describe("splitHighlightedText", () => {
  it("highlights terms case-insensitively and preserves surrounding text", () => {
    expect(
      splitHighlightedText("Built TypeScript systems.", ["typescript"]),
    ).toEqual([
      { text: "Built ", highlighted: false },
      { text: "TypeScript", highlighted: true },
      { text: " systems.", highlighted: false },
    ]);
  });

  it("prefers the longest phrase and avoids partial-word matches", () => {
    const segments = splitHighlightedText("Accessibility testing and a11y.", [
      "accessibility",
      "accessibility testing",
      "a11y",
    ]);
    expect(segments).toEqual([
      { text: "Accessibility testing", highlighted: true },
      { text: " and ", highlighted: false },
      { text: "a11y", highlighted: true },
      { text: ".", highlighted: false },
    ]);
    expect(
      splitHighlightedText("Reactive systems.", ["react"]).every(
        (segment) => !segment.highlighted,
      ),
    ).toBe(true);
  });

  it("handles empty text and terms", () => {
    expect(splitHighlightedText("", ["typescript"])).toEqual([]);
    expect(splitHighlightedText("Plain text", [])).toEqual([
      { text: "Plain text", highlighted: false },
    ]);
  });
});
