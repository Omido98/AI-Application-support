import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import { cvPlainText } from "@/utils/cvAts";

export interface CvConsistencyCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface CvConsistencyReport {
  checks: CvConsistencyCheck[];
  hasContext: boolean;
}

const STOPWORDS = new Set(
  [
    "about",
    "after",
    "also",
    "and",
    "are",
    "been",
    "before",
    "being",
    "both",
    "can",
    "could",
    "from",
    "have",
    "into",
    "more",
    "most",
    "that",
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
    "with",
    "would",
    "your",
    "writing",
    "apply",
    "application",
    "position",
    "company",
    "team",
    "would",
    "like",
    "excited",
    "opportunity",
    "dear",
    "sincerely",
    "regards",
    "hiring",
    "manager",
    "interested",
    "look",
    "forward",
    "hearing",
    "contact",
    "candidate",
    "role",
    "best",
    "kind",
    "resume",
    "cv",
  ].map((word) => word.toLowerCase()),
);

function words(value: string): string[] {
  return (value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [])
    .map((word) => word.replace(/[.,]+$/g, ""))
    .filter(
      (word) => word.length >= 4 && !/^\d+$/.test(word) && !STOPWORDS.has(word),
    );
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Tolerate simple inflections such as build/built and mentor/mentoring. */
function sharesStem(a: string, b: string): boolean {
  const length = Math.min(4, a.length, b.length);
  return length >= 4 && a.slice(0, length) === b.slice(0, length);
}

/**
 * Lightweight, deterministic checks between the CV and the user's cover
 * letters. It never changes either document; it only surfaces mismatches.
 */
export function analyzeCoverLetterConsistency(
  document: CvDocument,
  profile: ProfileData,
  application: JobApplication,
): CvConsistencyReport {
  const letters = profile.coverLetters;
  const summary = profile.coverLetterSummary.trim();
  const checks: CvConsistencyCheck[] = [];

  const relevant = letters.filter(
    (letter) =>
      letter.applicationId === application.id ||
      (letter.company?.trim() &&
        normalize(letter.company) === normalize(application.companyName)),
  );
  const themeSource = [summary, ...relevant.map((letter) => letter.content)]
    .filter((value) => value.trim())
    .join("\n");

  if (themeSource) {
    const applicationWords = new Set(
      words(
        [
          application.companyName,
          application.jobTitle,
          application.location,
          profile.fullName,
          profile.city,
          profile.country,
        ].join(" "),
      ),
    );
    const summaryTerms = [...new Set(words(themeSource))]
      .filter((term) => !applicationWords.has(term))
      .slice(0, 12);
    const cvWords = new Set(words(cvPlainText(document)));
    const missing = summaryTerms.filter(
      (term) =>
        !cvWords.has(term) &&
        ![...cvWords].some((cvWord) => sharesStem(term, cvWord)),
    );
    checks.push({
      id: "cover-summary",
      label: "Cover-letter themes",
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? "The CV mentions the main themes from your cover-letter summary and saved letters."
          : `Not mentioned in the CV: ${missing.slice(0, 6).join(", ")}. Add them only if they are true.`,
    });
  } else if (letters.length > 0) {
    checks.push({
      id: "cover-summary",
      label: "Cover-letter themes",
      ok: true,
      detail:
        "You have cover letters but no summary yet. Add a summary in Profile to compare the main themes.",
    });
  }

  const companyMismatches: string[] = [];
  for (const letter of relevant) {
    const company = letter.company?.trim();
    if (company && normalize(company) !== normalize(application.companyName)) {
      companyMismatches.push(company);
    }
  }
  if (relevant.length > 0) {
    checks.push({
      id: "cover-company",
      label: "Cover-letter company",
      ok: companyMismatches.length === 0,
      detail:
        companyMismatches.length === 0
          ? "The cover letter company matches this application."
          : `This CV is for ${application.companyName || "this application"}, but a saved cover letter names ${companyMismatches.join(", ")}.`,
    });
  }

  return {
    checks,
    hasContext: Boolean(summary) || letters.length > 0,
  };
}
