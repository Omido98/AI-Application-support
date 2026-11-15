import { describe, it, expect } from "vitest";
import { diffWords } from "@/utils/diff";

function joined(before: string, after: string) {
  const diff = diffWords(before, after);
  return {
    before: diff.segments
      .filter((segment) => segment.type !== "add")
      .map((segment) => segment.text)
      .join(""),
    after: diff.segments
      .filter((segment) => segment.type !== "remove")
      .map((segment) => segment.text)
      .join(""),
  };
}

describe("diffWords", () => {
  it("returns one same segment for identical text", () => {
    const diff = diffWords("Hello world.", "Hello world.");
    expect(diff.segments).toEqual([{ type: "same", text: "Hello world." }]);
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.truncated).toBe(false);
  });

  it("marks an inserted word as added", () => {
    const diff = diffWords("Hello world.", "Hello brave world.");

    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(0);
    expect(diff.segments.some((segment) => segment.type === "add")).toBe(true);
    expect(joined("Hello world.", "Hello brave world.")).toEqual({
      before: "Hello world.",
      after: "Hello brave world.",
    });
  });

  it("marks a replaced word as removed and added", () => {
    const diff = diffWords("I build systems.", "I ship systems.");

    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(joined("I build systems.", "I ship systems.")).toEqual({
      before: "I build systems.",
      after: "I ship systems.",
    });
  });

  it("does not count whitespace-only changes as visible changes", () => {
    const diff = diffWords("Hello  world", "Hello world");
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it("falls back instead of allocating a huge table", () => {
    const before = Array.from({ length: 2_500 }, () => "word").join(" ");
    const after = Array.from({ length: 2_500 }, () => "other").join(" ");
    const diff = diffWords(before, after);

    expect(diff.truncated).toBe(true);
    expect(diff.added).toBe(2_500);
    expect(diff.removed).toBe(2_500);
    expect(diff.segments.map((segment) => segment.type)).toEqual([
      "remove",
      "add",
    ]);
  });
});
