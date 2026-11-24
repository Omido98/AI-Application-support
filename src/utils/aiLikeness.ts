// ──────────────────────────────────────────────
// AI-likeness review: shared types and parser
// ──────────────────────────────────────────────
//
// The review itself is produced by the user's configured LLM (see
// `evaluateAiLikeness` in api.ts). This module only owns the shape of that
// result and the defensive parser for the model's JSON. Keeping the parser
// here makes it testable without Tauri and keeps api.ts focused on transport.

export type AiLikenessBand = "human-leaning" | "mixed" | "ai-leaning";
export type AiLikenessConfidence = "low" | "medium" | "high";

/** One evidence-backed reason returned by the model. */
export interface AiLikenessReason {
  signal: string;
  evidence: string;
  direction: "ai" | "human";
}

/** Structured result parsed from the model's review. */
export interface AiLikenessReview {
  /** 0..100, higher = more likely to read as AI-written. */
  likelihood: number;
  band: AiLikenessBand;
  confidence: AiLikenessConfidence;
  reasons: AiLikenessReason[];
  caveats: string[];
}

/**
 * Bands are always derived from the likelihood, never taken from the model.
 * That keeps the number and the label from contradicting each other.
 */
export function aiLikenessBandForScore(score: number): AiLikenessBand {
  if (score >= 65) return "ai-leaning";
  if (score <= 35) return "human-leaning";
  return "mixed";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeConfidence(value: unknown): AiLikenessConfidence {
  if (typeof value !== "string") return "medium";
  const lower = value.trim().toLowerCase();
  return lower === "low" || lower === "high" ? lower : "medium";
}

function normalizeReasons(value: unknown): AiLikenessReason[] {
  if (!Array.isArray(value)) return [];
  const reasons: AiLikenessReason[] = [];

  for (const item of value) {
    if (reasons.length >= 6) break;
    if (typeof item === "string") {
      const evidence = item.trim();
      if (evidence) {
        reasons.push({ signal: "Observation", evidence, direction: "ai" });
      }
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    const signal =
      typeof record.signal === "string" ? record.signal.trim() : "";
    const evidence =
      typeof record.evidence === "string" ? record.evidence.trim() : "";
    if (!signal && !evidence) continue;

    const direction =
      typeof record.direction === "string" &&
      record.direction.trim().toLowerCase() === "human"
        ? "human"
        : "ai";

    reasons.push({
      signal: signal || "Observation",
      evidence,
      direction,
    });
  }

  return reasons;
}

function normalizeCaveats(value: unknown): string[] {
  if (typeof value === "string") {
    const caveat = value.trim();
    return caveat ? [caveat] : [];
  }
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/** JSON candidates in priority order: a fenced block, then the outer object. */
function candidates(text: string): string[] {
  const result: string[] = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) result.push(fenced[1]);

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    result.push(text.slice(firstBrace, lastBrace + 1));
  }
  return result;
}

/**
 * Parse the model's review defensively. Models sometimes wrap JSON in prose
 * or a code fence, return the score as a numeric string, or exceed the range.
 * Returns null when no numeric likelihood can be recovered, so the caller can
 * fall back to showing the raw response.
 */
export function parseAiLikenessReview(text: string): AiLikenessReview | null {
  for (const candidate of candidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }

      const raw = parsed.likelihood ?? parsed.score ?? parsed.ai_likelihood;
      const value = numeric(raw);
      if (value === null) continue;

      const likelihood = Math.round(clamp(value, 0, 100));
      return {
        likelihood,
        band: aiLikenessBandForScore(likelihood),
        confidence: normalizeConfidence(parsed.confidence),
        reasons: normalizeReasons(parsed.reasons),
        caveats: normalizeCaveats(parsed.caveats),
      };
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
