/**
 * Opt-in live eval against an OpenAI-compatible provider.
 *
 * Skipped unless EVAL_API_KEY, EVAL_BASE_URL and EVAL_MODEL are set. This is a
 * manual quality check, not the CI gate: the offline suite (`npm run eval`)
 * stays deterministic and free. See docs/live-eval.md.
 */
import { describe, expect, it } from "vitest";
import {
  buildDeslopPrompt,
  buildDraftReviewPrompt,
  buildSystemPrompt,
} from "@/utils/systemPrompt";
import { APPLICATION_CONTEXT, DRAFT, PROFILE } from "./fixtures";
import {
  countSlopPhrases,
  scoreAntiSlop,
  scoreGrounding,
  scoreRequirementCoverage,
  scoreVerdict,
} from "./liveScoring";

const env =
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};
const API_KEY = env.EVAL_API_KEY?.trim() ?? "";
const BASE_URL = env.EVAL_BASE_URL?.trim() ?? "";
const MODEL = env.EVAL_MODEL?.trim() ?? "";
const live = Boolean(API_KEY && BASE_URL && MODEL);

const REQUIREMENTS = [
  "TypeScript",
  "React",
  "design system",
  "accessibility",
  "offline",
  "Copenhagen",
];

const SLOP_DRAFT = `Dear Hiring Team,

I am passionate about leveraging cutting-edge technology to delve into the
ever-evolving landscape of seamless digital experiences. Northstar Labs is a
game-changer, and I would be thrilled to embark on this journey with you.

Furthermore, my tapestry of skills makes me a testament to excellence.

Best regards,
Astrid`;

function chatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

async function complete(system: string, user: string): Promise<string> {
  const response = await fetch(chatEndpoint(BASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(
      `Provider HTTP ${response.status}: ${await response.text()}`,
    );
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("Provider returned an empty answer.");
  return content;
}

function report(label: string, scores: Record<string, number>): void {
  const summary = Object.entries(scores)
    .map(([name, value]) => `${name}=${value.toFixed(2)}`)
    .join(" ");
  console.log(`[live-eval] ${label}: ${summary}`);
}

describe.skipIf(!live)("live provider eval (opt-in)", () => {
  it("writes a grounded, anti-slop cover letter that covers requirements", async () => {
    const text = await complete(
      buildSystemPrompt(APPLICATION_CONTEXT, PROFILE, {
        mode: "standard",
        customPrompt: "",
      }),
      "Write a concise cover letter for this application.",
    );
    const scores = {
      grounding: scoreGrounding(text, [
        "Northstar Labs",
        "Senior Frontend Engineer",
        "Astrid Nyholm",
      ]),
      antiSlop: scoreAntiSlop(text),
      coverage: scoreRequirementCoverage(text, REQUIREMENTS),
    };
    report("cover-letter", scores);
    expect(scores.grounding).toBeGreaterThanOrEqual(0.5);
    expect(scores.antiSlop).toBeGreaterThanOrEqual(0.6);
    expect(scores.coverage).toBeGreaterThanOrEqual(0.4);
  }, 130_000);

  it("reviews a draft with a parseable verdict", async () => {
    const text = await complete(
      buildDraftReviewPrompt(DRAFT, APPLICATION_CONTEXT, PROFILE),
      "Review the draft now and end with the verdict line.",
    );
    const scores = { verdict: scoreVerdict(text) };
    report("draft-review", scores);
    expect(scores.verdict).toBeGreaterThan(0.5);
  }, 130_000);

  it("de-slopping reduces banned phrases", async () => {
    const text = await complete(buildDeslopPrompt(), SLOP_DRAFT);
    const scores = {
      before: countSlopPhrases(SLOP_DRAFT),
      after: countSlopPhrases(text),
      antiSlop: scoreAntiSlop(text),
    };
    report("deslop", scores);
    expect(scores.after).toBeLessThan(scores.before);
    expect(scores.antiSlop).toBeGreaterThanOrEqual(0.8);
  }, 130_000);
});
