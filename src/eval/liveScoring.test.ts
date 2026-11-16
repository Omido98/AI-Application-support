import { describe, expect, it } from "vitest";
import {
  countSlopPhrases,
  scoreAntiSlop,
  scoreGrounding,
  scoreRequirementCoverage,
  scoreVerdict,
} from "@/eval/liveScoring";

describe("live eval scoring", () => {
  it("counts distinct banned phrases case-insensitively", () => {
    const text = "I am passionate about seamless tools. Let's delve in.";
    expect(countSlopPhrases(text)).toBe(3);
    expect(scoreAntiSlop("A plain, specific letter.")).toBe(1);
    expect(scoreAntiSlop(text)).toBeCloseTo(0.4);
  });

  it("scores grounding by required facts", () => {
    expect(
      scoreGrounding("Northstar Labs is hiring a Senior Frontend Engineer.", [
        "Northstar Labs",
        "Senior Frontend Engineer",
        "Astrid Nyholm",
      ]),
    ).toBeCloseTo(2 / 3);
    expect(scoreGrounding("", ["Northstar Labs"])).toBe(0);
  });

  it("scores requirement coverage by key phrases", () => {
    const text =
      "I have five years of TypeScript and React work, including design system ownership and accessibility reviews.";
    expect(
      scoreRequirementCoverage(text, [
        "TypeScript",
        "React",
        "design system",
        "accessibility",
        "offline sync",
      ]),
    ).toBeCloseTo(0.8);
  });

  it("scores the parsed review verdict", () => {
    expect(scoreVerdict("Feedback...\nVERDICT: PASS")).toBe(1);
    expect(scoreVerdict("Feedback...\nVERDICT: REVISE")).toBe(0);
    expect(scoreVerdict("No structured verdict.")).toBe(0.5);
  });
});
