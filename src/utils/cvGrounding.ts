import type { ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import { findUnverifiedNumbers } from "@/utils/cvAts";

export type CvGroundingCategory = "skill" | "education" | "claim" | "number";

export interface CvGroundingWarning {
  id: string;
  category: CvGroundingCategory;
  label: string;
  message: string;
}

export interface CvGroundingReport {
  warnings: CvGroundingWarning[];
  counts: Record<CvGroundingCategory, number>;
}

const CLAIM_STOPWORDS = new Set(
  [
    "about",
    "after",
    "again",
    "also",
    "among",
    "and",
    "are",
    "been",
    "before",
    "being",
    "both",
    "built",
    "can",
    "could",
    "created",
    "delivered",
    "designed",
    "developed",
    "did",
    "does",
    "each",
    "for",
    "from",
    "had",
    "has",
    "have",
    "implemented",
    "into",
    "led",
    "made",
    "managed",
    "more",
    "most",
    "not",
    "other",
    "our",
    "over",
    "responsible",
    "than",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "these",
    "they",
    "this",
    "through",
    "using",
    "was",
    "were",
    "which",
    "while",
    "will",
    "with",
    "work",
    "worked",
    "working",
    "would",
    "your",
  ].map((word) => word.toLowerCase()),
);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim();
}

function contentTokens(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [])
    .map((token) => token.replace(/[.,]+$/g, ""))
    .filter(
      (token) =>
        token.length >= 3 &&
        !/^\d+$/.test(token) &&
        !CLAIM_STOPWORDS.has(token),
    );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesTerm(haystack: string, term: string): boolean {
  if (!term) return false;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}+#.])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}+#.])`,
    "u",
  );
  return pattern.test(haystack);
}

const SKILL_SEPARATORS = new Set([".", "+", "#", "/", "-", " "]);

function skillMatches(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.startsWith(right)) {
    return SKILL_SEPARATORS.has(left[right.length] ?? "");
  }
  if (right.startsWith(left)) {
    return SKILL_SEPARATORS.has(right[left.length] ?? "");
  }
  return false;
}

const EDUCATION_GENERIC = new Set(
  [
    "awarded",
    "completed",
    "course",
    "courses",
    "coursework",
    "degree",
    "gpa",
    "grade",
    "grades",
    "program",
    "programme",
    "relevant",
    "school",
    "studied",
    "study",
    "thesis",
    "university",
  ].map((word) => word.toLowerCase()),
);

function educationTokens(value: string): string[] {
  return contentTokens(value).filter((token) => !EDUCATION_GENERIC.has(token));
}

function educationSourceText(profile: ProfileData, sourceId: string): string {
  const entry = profile.education.find((item) => item.id === sourceId);
  if (!entry) return "";
  return normalize(
    [
      entry.school,
      entry.degree,
      entry.programName,
      entry.major,
      entry.finalGrade,
      entry.thesisTitle,
      ...entry.courses,
    ].join(" "),
  );
}

function overlapRatio(tokens: string[], allowed: Set<string>): number {
  if (tokens.length === 0) return 1;
  const matched = tokens.filter((token) => allowed.has(token)).length;
  return matched / tokens.length;
}

function claimWarnings(
  document: CvDocument,
  source: string,
): CvGroundingWarning[] {
  const sourceTokens = new Set(contentTokens(source));
  const fields: { label: string; text: string }[] = [
    { label: "Summary", text: document.summary },
    ...document.experience
      .filter((item) => item.included)
      .flatMap((item) =>
        item.bullets.map((bullet, index) => ({
          label: `${item.role || "Role"} bullet ${index + 1}`,
          text: bullet,
        })),
      ),
    ...document.projects
      .filter((item) => item.included)
      .flatMap((item) =>
        item.bullets.map((bullet, index) => ({
          label: `${item.title || "Project"} bullet ${index + 1}`,
          text: bullet,
        })),
      ),
    ...document.otherEngagements
      .filter((item) => item.included)
      .flatMap((item) =>
        item.bullets.map((bullet, index) => ({
          label: `${item.organization || "Other experience"} bullet ${
            index + 1
          }`,
          text: bullet,
        })),
      ),
  ];

  const warnings: CvGroundingWarning[] = [];
  for (const field of fields) {
    const tokens = contentTokens(field.text);
    if (tokens.length < 5) continue;
    if (overlapRatio(tokens, sourceTokens) >= 0.2) continue;
    warnings.push({
      id: `claim-${warnings.length}-${field.label}`,
      category: "claim",
      label: field.label,
      message: `“${field.text.slice(0, 120)}${
        field.text.length > 120 ? "…" : ""
      }” has little overlap with your profile. Verify that it is accurate.`,
    });
    if (warnings.length >= 5) break;
  }
  return warnings;
}

/**
 * Deterministic grounding audit. It does not rewrite or remove content; it
 * surfaces claims the user should verify before exporting.
 */
export function analyzeCvGrounding(
  document: CvDocument,
  profile: ProfileData,
): CvGroundingReport {
  const counts: Record<CvGroundingCategory, number> = {
    skill: 0,
    education: 0,
    claim: 0,
    number: 0,
  };
  const warnings: CvGroundingWarning[] = [];

  const profileSkills = profile.skills
    .map((skill) => normalize(skill.name))
    .filter(Boolean);
  const extra = normalize(document.extraContext);
  for (const skill of document.skills) {
    const normalized = normalize(skill);
    if (!normalized) continue;
    const supported =
      profileSkills.some((profileSkill) =>
        skillMatches(profileSkill, normalized),
      ) || includesTerm(extra, normalized);
    if (supported) continue;
    counts.skill += 1;
    warnings.push({
      id: `skill-${counts.skill}`,
      category: "skill",
      label: "Skill",
      message: `“${skill}” is not in your profile skills or extra context.`,
    });
  }

  for (const education of document.education.filter((item) => item.included)) {
    if (!education.sourceId) continue;
    const allowedText = educationSourceText(profile, education.sourceId);
    if (!allowedText) continue;
    const allowedTokens = new Set(contentTokens(allowedText));
    for (const detail of education.details) {
      const tokens = educationTokens(detail);
      if (tokens.length === 0) continue;
      const normalizedDetail = normalize(detail);
      const supported =
        includesTerm(allowedText, normalizedDetail) ||
        overlapRatio(tokens, allowedTokens) >= 0.6 ||
        tokens.every((token) => allowedTokens.has(token));
      if (supported) continue;
      counts.education += 1;
      warnings.push({
        id: `education-${counts.education}`,
        category: "education",
        label: "Education detail",
        message: `“${detail}” is not clearly supported by the profile education entry.`,
      });
      if (counts.education >= 4) break;
    }
    if (counts.education >= 4) break;
  }

  const claims = claimWarnings(
    document,
    `${JSON.stringify(profile)}\n${document.extraContext}`,
  );
  counts.claim = claims.length;
  warnings.push(...claims);

  const numbers = findUnverifiedNumbers(document, profile);
  counts.number = numbers.length;
  warnings.push(
    ...numbers.map((message, index) => ({
      id: `number-${index}`,
      category: "number" as const,
      label: "Number",
      message,
    })),
  );

  return { warnings, counts };
}
