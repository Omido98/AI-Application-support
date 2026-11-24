import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import { getCvProfileContext } from "@/utils/cvProfileContext";

export interface CvAtsCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface CvAtsRequirement {
  id: string;
  label: string;
  priority: "must" | "preferred";
  matchedTerms: string[];
  missingTerms: string[];
}

export interface CvAtsMatch {
  term: string;
  matched: string;
  type: "exact" | "phrase" | "synonym";
}

export interface CvAtsReport {
  matchedKeywords: string[];
  missingKeywords: string[];
  matchedPhrases: string[];
  missingPhrases: string[];
  requirements: CvAtsRequirement[];
  /** Canonical term + actual CV spelling + how it matched. */
  matches: CvAtsMatch[];
  /** Matched spellings to highlight in the preview. */
  highlightTerms: string[];
  keywordCoverage: number;
  wordCount: number;
  checks: CvAtsCheck[];
  unverifiedNumbers: string[];
}

/**
 * Curated, conservative synonym groups for ATS matching. Each group is
 * bidirectional and displayed as written here when highlighted.
 */
const SYNONYM_GROUPS: string[][] = [
  ["JavaScript", "JS"],
  ["TypeScript", "TS"],
  ["React", "React.js"],
  ["Node.js", "NodeJS", "Node"],
  ["Accessibility", "a11y"],
  ["User experience", "UX"],
  ["User interface", "UI"],
  ["Continuous integration", "CI"],
  ["Continuous delivery", "CD"],
  ["Amazon Web Services", "AWS"],
  ["Google Cloud Platform", "GCP"],
  ["Machine learning", "ML"],
  ["Artificial intelligence", "AI"],
  ["Search engine optimization", "SEO"],
  ["Customer relationship management", "CRM"],
  ["Quality assurance", "QA"],
  ["Test driven development", "TDD"],
  ["Representational state transfer", "REST"],
  ["Application programming interface", "API"],
  ["Infrastructure as code", "IaC"],
  ["Site reliability engineering", "SRE"],
  ["Development operations", "DevOps"],
  ["Design systems", "Design system"],
  ["Testing", "Test", "Tests"],
];

const GENERIC_TERMS = new Set(
  [
    "candidate",
    "consultant",
    "developer",
    "engineer",
    "engineering",
    "job",
    "manager",
    "position",
    "senior",
    "junior",
    "principal",
    "staff",
    "specialist",
    "role",
  ].map((word) => word.toLowerCase()),
);

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
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [])
    .map((token) => token.replace(/[.,]+$/g, ""))
    .filter(Boolean);
}

/** All CV text that an ATS would see, including section headings. */
const plainTextCache = new WeakMap<CvDocument, string>();

export function cvPlainText(document: CvDocument): string {
  const cached = plainTextCache.get(document);
  if (cached !== undefined) return cached;
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
    lines.push(item.company, item.location);
    for (const role of item.roles) {
      lines.push(role.title, role.startDate, role.endDate);
    }
    lines.push(...item.bullets);
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

  const text = lines.filter(Boolean).join("\n");
  plainTextCache.set(document, text);
  return text;
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
    if (GENERIC_TERMS.has(token)) continue;
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

/** Normalized term -> synonym group, built once instead of scanned per match. */
const SYNONYM_LOOKUP: Map<string, string[]> = (() => {
  const lookup = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    for (const entry of group) {
      const key = normalizeForMatch(entry);
      if (!lookup.has(key)) lookup.set(key, group);
    }
  }
  return lookup;
})();

function isMeaningfulToken(token: string): boolean {
  return (
    token.length >= 3 &&
    !/^\d+$/.test(token) &&
    !STOPWORDS.has(token) &&
    !GENERIC_TERMS.has(token)
  );
}

function containsTerm(haystack: string, term: string): boolean {
  const normalized = normalizeForMatch(term);
  if (!normalized) return false;
  return ` ${haystack} `.includes(` ${normalized} `);
}

function synonymsFor(term: string): string[] {
  return SYNONYM_LOOKUP.get(normalizeForMatch(term)) ?? [term];
}

/** Return the matched spelling, so the preview can highlight what exists. */
function matchedSpelling(haystack: string, term: string): string | undefined {
  return synonymsFor(term).find((variant) => containsTerm(haystack, variant));
}

/**
 * Repeated multi-word phrases in the job text. Single occurrence terms are
 * already covered by keywords; repeated phrases are the useful ATS signal.
 */
export function extractJobPhrases(jobText: string, limit = 12): string[] {
  const words = tokens(jobText);
  const counts = new Map<string, number>();
  for (let index = 0; index < words.length; index += 1) {
    const first = words[index];
    if (!isMeaningfulToken(first)) continue;
    const second = words[index + 1];
    if (second && isMeaningfulToken(second)) {
      const phrase = `${first} ${second}`;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
    const third = words[index + 2];
    if (
      second &&
      third &&
      isMeaningfulToken(second) &&
      isMeaningfulToken(third)
    ) {
      const phrase = `${first} ${second} ${third}`;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([phrase]) => phrase);
}

function isNegatedRequirement(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    /^(?:no need|not required|no experience|without|does not require|doesn't require)\b/.test(
      lower,
    ) || /\b(?:is|are) not required\b/.test(lower)
  );
}

function requirementLines(requirements: string): string[] {
  return requirements
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
    .filter((line) => line.length >= 3)
    .flatMap((line) => line.split(/(?<=[;])\s+|(?<=[.!?])\s+(?=[A-Z])/u))
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !isNegatedRequirement(part))
    .slice(0, 12);
}

function requirementPriority(line: string): "must" | "preferred" {
  const lower = line.toLowerCase();
  if (
    /(nice to have|preferred|bonus|advantage|desirable|good to have|a plus|\bplus\b)/.test(
      lower,
    )
  ) {
    return "preferred";
  }
  return "must";
}

const REQUIREMENT_FILLER = new Set(
  [
    "ability",
    "advantage",
    "bonus",
    "desirable",
    "essential",
    "familiarity",
    "knowledge",
    "minimum",
    "must",
    "nice",
    "plus",
    "preferred",
    "proven",
    "required",
    "requirement",
    "strong",
  ].map((word) => word.toLowerCase()),
);

function requirementTerms(line: string): string[] {
  const words = tokens(line);
  const isTerm = (token: string) =>
    isMeaningfulToken(token) && !REQUIREMENT_FILLER.has(token);
  const unigrams = words.filter(isTerm);
  const phrases: string[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    if (!isTerm(words[index])) continue;
    if (isTerm(words[index + 1])) {
      phrases.push(`${words[index]} ${words[index + 1]}`);
    }
    if (
      words[index + 2] &&
      isTerm(words[index + 1]) &&
      isTerm(words[index + 2])
    ) {
      phrases.push(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
    }
  }
  return [...new Set([...phrases, ...unigrams])].slice(0, 6);
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
  sourceNumbers?: Set<string>,
): string[] {
  const profileNumbers = getCvProfileContext(profile).numbers;
  const numbers =
    sourceNumbers ??
    new Set([...profileNumbers, ...numericTokens(extraContext)]);
  const warnings = new Map<string, string>();
  for (const field of fields) {
    for (const token of numericTokens(field.text)) {
      if (isYear(token) || numbers.has(token)) continue;
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
          label: `${item.company || "Employer"} bullet ${index + 1}`,
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

export interface CvAtsContext {
  keywords?: string[];
  phrases?: string[];
}

function matchType(
  term: string,
  spelling: string,
  phrase = false,
): CvAtsMatch["type"] {
  if (phrase) return "phrase";
  return normalizeForMatch(term) === normalizeForMatch(spelling)
    ? "exact"
    : "synonym";
}

function isNoisyHighlight(term: string): boolean {
  const parts = normalizeForMatch(term).split(" ").filter(Boolean);
  return (
    parts.length === 0 ||
    parts.every(
      (part) =>
        part.length < 3 || GENERIC_TERMS.has(part) || STOPWORDS.has(part),
    )
  );
}

export function analyzeCvAts(
  document: CvDocument,
  application: JobApplication,
  profile: ProfileData,
  context?: CvAtsContext,
  unverifiedNumbers?: string[],
): CvAtsReport {
  const jobText = [
    application.jobTitle,
    application.jobDescription,
    application.requirements,
  ].join("\n");
  const resolvedKeywords = context?.keywords ?? extractJobKeywords(jobText);
  const phrases = context?.phrases ?? extractJobPhrases(jobText);
  const cvText = normalizeForMatch(cvPlainText(document));
  const highlight = new Set<string>();
  const matches: CvAtsMatch[] = [];

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const keyword of resolvedKeywords) {
    const spelling = matchedSpelling(cvText, keyword);
    if (spelling) {
      matchedKeywords.push(keyword);
      highlight.add(spelling);
      matches.push({
        term: keyword,
        matched: spelling,
        type: matchType(keyword, spelling),
      });
    } else {
      missingKeywords.push(keyword);
    }
  }

  const matchedPhrases: string[] = [];
  const missingPhrases: string[] = [];
  for (const phrase of phrases) {
    const spelling = matchedSpelling(cvText, phrase);
    if (spelling) {
      matchedPhrases.push(phrase);
      highlight.add(spelling);
      matches.push({
        term: phrase,
        matched: spelling,
        type: "phrase",
      });
    } else {
      missingPhrases.push(phrase);
    }
  }

  const requirementMatches = new Set(
    matches.map((match) => normalizeForMatch(match.term)),
  );
  const requirements: CvAtsRequirement[] = requirementLines(
    application.requirements,
  )
    .map((line, index) => {
      const terms = requirementTerms(line);
      const matchedTerms: string[] = [];
      const missingTerms: string[] = [];
      for (const term of terms) {
        const spelling = matchedSpelling(cvText, term);
        if (spelling) {
          matchedTerms.push(term);
          highlight.add(spelling);
          if (!requirementMatches.has(normalizeForMatch(term))) {
            requirementMatches.add(normalizeForMatch(term));
            matches.push({
              term,
              matched: spelling,
              type: matchType(term, spelling, term.includes(" ")),
            });
          }
        } else {
          missingTerms.push(term);
        }
      }
      return {
        id: `requirement-${index}`,
        label: line.length > 120 ? `${line.slice(0, 120)}…` : line,
        priority: requirementPriority(line),
        matchedTerms,
        missingTerms,
      };
    })
    .filter(
      (requirement) =>
        requirement.matchedTerms.length + requirement.missingTerms.length > 0,
    );

  const allTerms = [...new Set([...resolvedKeywords, ...phrases])];
  const matchedCount = matchedKeywords.length + matchedPhrases.length;
  const highlightTerms = [...highlight]
    .filter((term) => term.length >= 2 && !isNoisyHighlight(term))
    .sort((a, b) => b.length - a.length)
    .slice(0, 40);

  const wordCount = tokens(cvText).length;

  const experience = document.experience.filter((item) => item.included);
  const bulletCount = experience.reduce(
    (sum, item) => sum + item.bullets.length,
    0,
  );
  const hasDates = experience.every((item) =>
    item.roles.every((role) => role.startDate.trim().length > 0),
  );
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
    matchedPhrases,
    missingPhrases,
    requirements,
    matches,
    highlightTerms,
    keywordCoverage: allTerms.length === 0 ? 0 : matchedCount / allTerms.length,
    wordCount,
    checks,
    unverifiedNumbers:
      unverifiedNumbers ?? findUnverifiedNumbers(document, profile),
  };
}
