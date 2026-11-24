import { describe, expect, it } from "vitest";
import {
  aiLikenessBandForScore,
  parseAiLikenessReview,
} from "@/utils/aiLikeness";
import { buildAiLikenessPrompt } from "@/utils/systemPrompt";

describe("aiLikenessBandForScore", () => {
  it("uses the documented band boundaries", () => {
    expect(aiLikenessBandForScore(0)).toBe("human-leaning");
    expect(aiLikenessBandForScore(35)).toBe("human-leaning");
    expect(aiLikenessBandForScore(36)).toBe("mixed");
    expect(aiLikenessBandForScore(64)).toBe("mixed");
    expect(aiLikenessBandForScore(65)).toBe("ai-leaning");
    expect(aiLikenessBandForScore(100)).toBe("ai-leaning");
  });
});

describe("parseAiLikenessReview", () => {
  const valid = {
    likelihood: 72,
    confidence: "high",
    reasons: [
      {
        signal: "Generic phrasing",
        evidence: "passionate about leveraging",
        direction: "ai",
      },
      {
        signal: "Concrete detail",
        evidence: "cut p95 latency from 900ms to 120ms",
        direction: "human",
      },
    ],
    caveats: ["The draft is short."],
  };

  it("parses a plain JSON object", () => {
    expect(parseAiLikenessReview(JSON.stringify(valid))).toEqual({
      likelihood: 72,
      band: "ai-leaning",
      confidence: "high",
      reasons: valid.reasons,
      caveats: valid.caveats,
    });
  });

  it("parses a fenced JSON block", () => {
    const text = `Here is the assessment:\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
    expect(parseAiLikenessReview(text)?.likelihood).toBe(72);
  });

  it("parses JSON wrapped in prose", () => {
    const text = `Assessment follows. ${JSON.stringify(valid)} End.`;
    expect(parseAiLikenessReview(text)?.confidence).toBe("high");
  });

  it("accepts a numeric string and clamps the range", () => {
    expect(
      parseAiLikenessReview(
        JSON.stringify({ likelihood: "68", confidence: "medium" }),
      )?.likelihood,
    ).toBe(68);
    expect(
      parseAiLikenessReview(JSON.stringify({ likelihood: 140 }))?.likelihood,
    ).toBe(100);
    expect(
      parseAiLikenessReview(JSON.stringify({ likelihood: -3 }))?.likelihood,
    ).toBe(0);
  });

  it("derives the band from the likelihood, ignoring a contradictory band", () => {
    const review = parseAiLikenessReview(
      JSON.stringify({
        likelihood: 20,
        band: "ai-leaning",
        confidence: "low",
      }),
    );
    expect(review?.band).toBe("human-leaning");
  });

  it("defaults missing confidence to medium", () => {
    expect(
      parseAiLikenessReview(JSON.stringify({ likelihood: 50 }))?.confidence,
    ).toBe("medium");
  });

  it("sanitises reasons and caveats", () => {
    const review = parseAiLikenessReview(
      JSON.stringify({
        likelihood: 55,
        reasons: [
          "A bare string observation",
          { signal: "Only evidence", evidence: "quote", direction: "Human" },
          { signal: "", evidence: "" },
          null,
          ...Array.from({ length: 8 }, (_, index) => ({
            signal: `Signal ${index}`,
            evidence: `Evidence ${index}`,
            direction: "ai",
          })),
        ],
        caveats: ["one", 42, "two", "three", "four"],
      }),
    );

    expect(review?.reasons).toHaveLength(6);
    expect(review?.reasons[0]).toEqual({
      signal: "Observation",
      evidence: "A bare string observation",
      direction: "ai",
    });
    expect(review?.reasons[1]).toEqual({
      signal: "Only evidence",
      evidence: "quote",
      direction: "human",
    });
    expect(review?.caveats).toEqual(["one", "two", "three"]);
  });

  it("returns null when no numeric likelihood is present", () => {
    expect(parseAiLikenessReview("No JSON here.")).toBeNull();
    expect(
      parseAiLikenessReview(JSON.stringify({ confidence: "high" })),
    ).toBeNull();
    expect(parseAiLikenessReview("")).toBeNull();
  });
});

describe("buildAiLikenessPrompt", () => {
  it("delimits the draft and asks for a non-conclusive JSON review", () => {
    const prompt = buildAiLikenessPrompt(
      "  Dear Acme Corp, I am writing to express my interest.  ",
    );

    expect(prompt).toContain("<cover_letter>");
    expect(prompt).toContain(
      "Dear Acme Corp, I am writing to express my interest.",
    );
    expect(prompt).toContain("</cover_letter>");
    expect(prompt).toContain('"likelihood"');
    expect(prompt).toContain("not proof");
    expect(prompt).toContain("untrusted data");
    expect(prompt).toContain("0-20");
    expect(prompt).toContain("81-100");
  });
});
