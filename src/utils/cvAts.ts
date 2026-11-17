import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";

export interface CvAtsCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface CvAtsReport {
  matchedKeywords: string[];
  missingKeywords: string[];
  keywordCoverage: number;
  wordCount: number;
  checks: CvAtsCheck[];
  unverifiedNumbers: string[];
}

const STOPWORDS = new Set(
  [
    "the",
    "and",
    "for",
    "with",
    "you",
    "your",
    "our",
    "are",
    "will",
    "that",
    "this",
    "from",
    "have",
    "has",
    "can",
    "all",
    "not",
    "but",
    "job",
    "role",
    "work",
    "team",
    "company",
    "experience",
    "experiences",
    "skills",
    "skill",
    "requirements",
    "requirement",
    "responsibilities",
    "responsibility",
    "applications",
    "application",
    "candidate",
    "candidates",
    "including",
    "ability",
    "able",
    "using",
    "use",
    "used",
    "new",
    "other",
    "more",
    "than",
    "into",
    "who",
    "what",
    "when",
    "where",
    "which",
    "their",
    "they",
    "them",
    "its",
    "also",
    "well",
    "within",
    "across",
    "about",
    "would",
    "should",
    "could",
    "may",
    "must",
    "need",
    "needs",
    "help",
    "join",
    "looking",
    "seeking",
    "apply",
    "applicant",
    "position",
    "positions",
    "employment",
    "employer",
    "opportunity",
    "benefits",
    "salary",
    "location",
    "remote",
    "hybrid",
    "onsite",
    "office",
    "time",
    "full",
    "part",
    "years",
    "year",
    "month",
    "months",
    "day",
    "days",
    "including",
    "etc",
    "via",
    "per",
    "each",
    "any",
    "how",
    "why",
    "yourself",
    "we",
    "us",
    "it",
    "is",
    "to",
    "of",
    "in",
    "on",
    "at",
    "as",
    "an",
    "or",
    "be",
    "by",
    "do",
    "if",
    "no",
    "so",
    "up",
    "out",
    "off",
    "over",
    "under",
    "och",
    "att",
    "som",
    "för",
    "med",
    "till",
    "av",
    "på",
    "är",
    "det",
    "en",
    "ett",
    "du",
    "vi",
    "har",
    "kan",
    "ska",
    "inte",
    "om",
    "den",
    "de",
    "eller",
    "och",
    "jobb",
    "roll",
    "team",
    "företag",
    "erfarenhet",
    "kompetens",
    "krav",
    "ansvar",
    "söker",
    "arbete",
    "tjänst",
  ].map((word) => word.toLowerCase()),
);

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [];
}

/** All CV text that an ATS would see, including section headings. */
export function cvPlainText(document: CvDocument): string {
  const lines: string[] = [
    document.contact.fullName,
    document.contact.email,
    document.contact.phone,
    document.contact.location,
    document.contact.linkedinUrl,
    document.contact.portfolioUrl,
    document.contact.githubUrl,
    document.headline,
    document.summary,
    ...document.skills,
  ];

  for (const item of document.experience) {
    if (!item.included) continue;
    lines.push(
      item.role,
      item.company,
      item.location,
      item.startDate,
      item.endDate,
      ...item.bullets,
    );
  }
  for (const item of document.education) {
    if (!item.included) continue;
    lines.push(
      item.school,
      item.degree,
      item.field,
      item.startDate,
      item.endDate,
      ...item.details,
    );
  }
  for (const item of document.projects) {
    if (!item.included) continue;
    lines.push(item.title, item.description, item.period, ...item.bullets);
  }
  for (const item of document.certifications) {
    if (!item.included) continue;
    lines.push(item.name, item.issuer, item.date);
  }
  for (const item of document.languages) {
    if (!item.included) continue;
    lines.push(item.name, item.level);
  }
  for (const item of document.otherEngagements) {
    if (!item.included) continue;
    lines.push(
      item.organization,
      item.role,
      item.startDate,
      item.endDate,
      ...item.bullets,
    );
  }

  return lines.filter(Boolean).join("\n");
}

/**
 * Extract a compact keyword list from the job text. This is deliberately
 * deterministic and conservative: exact tokens, no synonym guessing, so the
 * UI never claims a match the candidate did not actually write.
 */
export function extractJobKeywords(jobText: string, limit = 30): string[] {
  const counts = new Map<string, number>();
  for (const token of tokens(jobText)) {
    if (token.length < 3 || /^\d+$/.test(token) || STOPWORDS.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
    )
    .slice(0, limit)
    .map(([token]) => token);
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim();
}

const NUMBER_RE = /\b\d[\d,]*(?:\.\d+)?(?:%|k|m|bn)?/gi;

function numericTokens(value: string): string[] {
  return (value.match(NUMBER_RE) ?? []).map((token) =>
    token.toLowerCase().replace(/,/g, ""),
  );
}

function isYear(token: string): boolean {
  return /^(19|20)\d{2}$/.test(token);
}

function unverifiedNumberWarnings(
  fields: { label: string; text: string }[],
  profile: ProfileData,
  extraContext: string,
): string[] {
  const source = `${JSON.stringify(profile)}\n${extraContext}`;
  const sourceNumbers = new Set(numericTokens(source));
  const warnings = new Map<string, string>();
  for (const field of fields) {
    for (const token of numericTokens(field.text)) {
      if (isYear(token) || sourceNumbers.has(token)) continue;
      if (warnings.has(token)) continue;
      warnings.set(
        token,
        `${field.label} mentions “${token}”, which is not in your profile or extra context.`,
      );
    }
  }
  return [...warnings.values()].slice(0, 8);
}

/** Check one proposed rewrite before the user accepts it. */
export function findUnverifiedNumbersInText(
  label: string,
  text: string,
  profile: ProfileData,
  extraContext: string,
): string[] {
  return unverifiedNumberWarnings([{ label, text }], profile, extraContext);
}

/**
 * Heuristic check for numbers in the CV prose that do not occur anywhere in
 * the profile or the extra context. It deliberately does not block export;
 * it surfaces claims the user should verify.
 */
export function findUnverifiedNumbers(
  document: CvDocument,
  profile: ProfileData,
): string[] {
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

  return unverifiedNumberWarnings(fields, profile, document.extraContext);
}

export function analyzeCvAts(
  document: CvDocument,
  application: JobApplication,
  profile: ProfileData,
  keywords?: string[],
): CvAtsReport {
  const jobText = [
    application.jobTitle,
    application.jobDescription,
    application.requirements,
  ].join("\n");
  const resolvedKeywords = keywords ?? extractJobKeywords(jobText);
  const cvText = normalizeForMatch(cvPlainText(document));
  const cvWords = new Set(tokens(cvText));
  const matchedKeywords = resolvedKeywords.filter((keyword) =>
    cvWords.has(keyword),
  );
  const missingKeywords = resolvedKeywords.filter(
    (keyword) => !cvWords.has(keyword),
  );
  const wordCount = tokens(cvText).length;

  const experience = document.experience.filter((item) => item.included);
  const bulletCount = experience.reduce(
    (sum, item) => sum + item.bullets.length,
    0,
  );
  const hasDates = experience.every((item) => item.startDate.trim().length > 0);
  const contact = document.contact;

  const checks: CvAtsCheck[] = [
    {
      id: "contact",
      label: "Contact details",
      ok: Boolean(contact.fullName.trim() && contact.email.trim()),
      detail:
        "Name and email are required; phone and location help recruiters.",
    },
    {
      id: "summary",
      label: "Professional summary",
      ok:
        document.summary.trim().length >= 80 &&
        document.summary.trim().length <= 900,
      detail: "Aim for 2–4 sentences (roughly 80–900 characters).",
    },
    {
      id: "experience",
      label: "Experience with bullets",
      ok: experience.length > 0 && bulletCount >= 2,
      detail: "Include at least one role with two or more achievement bullets.",
    },
    {
      id: "skills",
      label: "Skills section",
      ok: document.skills.length >= 3,
      detail: "List at least three relevant, truthful skills.",
    },
    {
      id: "dates",
      label: "Consistent dates",
      ok: hasDates,
      detail: "Every included role should have a start date.",
    },
    {
      id: "length",
      label: "Length",
      ok: wordCount >= 180 && wordCount <= 1100,
      detail:
        "Aim for roughly 300–900 words; one or two pages is usually best.",
    },
    {
      id: "plain-format",
      label: "Single-column format",
      ok: true,
      detail:
        "The Word export uses one column, standard headings and no tables or images.",
    },
  ];

  return {
    matchedKeywords,
    missingKeywords,
    keywordCoverage:
      resolvedKeywords.length === 0
        ? 0
        : matchedKeywords.length / resolvedKeywords.length,
    wordCount,
    checks,
    unverifiedNumbers: findUnverifiedNumbers(document, profile),
  };
}
