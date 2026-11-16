import { parseReviewVerdict } from "@/utils/api";

/**
 * Deterministic scorers for the opt-in live eval. They are intentionally
 * simple (presence checks and banned-phrase counts) so a live run reports the
 * same numbers every time for the same model output.
 */

/** Phrases the standard prompt explicitly tells the model to avoid. */
export const ANTI_SLOP_PHRASES = [
  "delve",
  "tapestry",
  "testament to",
  "passionate about",
  "leverage",
  "synergy",
  "cutting-edge",
  "game-changer",
  "seamless",
  "elevate",
  "unlock",
  "ever-evolving",
  "in today's",
  "it is worth noting",
  "furthermore",
  "moreover",
  "embark",
  "navigate the",
  "landscape of",
] as const;

export function countSlopPhrases(text: string): number {
  const lower = text.toLowerCase();
  return ANTI_SLOP_PHRASES.reduce(
    (count, phrase) => count + (lower.includes(phrase) ? 1 : 0),
    0,
  );
}

/** 1 = no banned phrases; loses 0.2 per distinct phrase, floored at 0. */
export function scoreAntiSlop(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(0, 1 - countSlopPhrases(text) * 0.2);
}

/** Fraction of required facts (company, role, profile anchors) present. */
export function scoreGrounding(text: string, facts: string[]): number {
  if (!text.trim() || facts.length === 0) return 0;
  const lower = text.toLowerCase();
  const found = facts.filter((fact) => lower.includes(fact.toLowerCase()));
  return found.length / facts.length;
}

/** Fraction of required keywords/phrases the draft actually addresses. */
export function scoreRequirementCoverage(
  text: string,
  requirements: string[],
): number {
  if (!text.trim() || requirements.length === 0) return 0;
  const lower = text.toLowerCase();
  const covered = requirements.filter((requirement) =>
    lower.includes(requirement.toLowerCase()),
  );
  return covered.length / requirements.length;
}

/** 1 for PASS, 0 for REVISE, 0.5 when the report has no parseable verdict. */
export function scoreVerdict(text: string): number {
  const verdict = parseReviewVerdict(text);
  if (verdict === "pass") return 1;
  if (verdict === "revise") return 0;
  return 0.5;
}
