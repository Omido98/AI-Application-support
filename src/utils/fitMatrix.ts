import type { JobApplication, ProfileData } from "@/types";

export type FitLevel = "strong" | "partial" | "gap";

export interface FitRow {
  requirement: string;
  level: FitLevel;
  evidence: string[];
}

export interface FitMatrix {
  rows: FitRow[];
  strong: number;
  partial: number;
  gap: number;
}

/** The profile sections the matrix can evidence. */
export type FitProfile = Pick<
  ProfileData,
  | "skills"
  | "workExperience"
  | "education"
  | "languages"
  | "certifications"
  | "otherEngagements"
>;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "your",
  "you",
  "are",
  "will",
  "have",
  "has",
  "our",
  "their",
  "its",
  "can",
  "all",
  "any",
  "use",
  "using",
  "work",
  "working",
  "role",
  "job",
  "team",
  "teams",
  "including",
  "include",
  "plus",
  "etc",
  "years",
  "year",
  "experience",
  "experienced",
  "strong",
  "good",
  "excellent",
  "knowledge",
  "ability",
  "skills",
  "skill",
  "must",
  "should",
  "would",
  "about",
  "into",
  "over",
  "under",
  "more",
  "than",
  "other",
  "such",
  "who",
  "what",
  "when",
  "where",
  "how",
  "not",
  "but",
  "also",
  "very",
  "well",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "as",
  "or",
  "is",
  "be",
  "we",
  "they",
  "it",
  "he",
  "she",
  "them",
  "would",
  "could",
]);

/** Lowercase content words used for matching, without stop words. */
export function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}+#]+/gu) ?? [];
  return new Set(
    words
      .map((word) => word.replace(/[+#]+$/, ""))
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)),
  );
}

interface Evidence {
  text: string;
  words: Set<string>;
}

function profileEvidence(profile: FitProfile | null): Evidence[] {
  if (!profile) return [];
  const evidence: Evidence[] = [];
  const add = (text: string) => {
    const words = contentWords(text);
    if (words.size > 0) evidence.push({ text, words });
  };

  for (const skill of profile.skills) {
    add(`Skill: ${skill.name}`);
  }
  for (const work of profile.workExperience) {
    add(
      `${work.role || "Role"} at ${work.company || "company"}: ${work.jobDescription}`,
    );
  }
  for (const education of profile.education) {
    add(
      `Education: ${[
        education.degree,
        education.programName,
        education.major,
        education.school,
      ]
        .filter(Boolean)
        .join(", ")}`,
    );
  }
  for (const language of profile.languages) {
    add(`Language: ${language.name} (${language.fluency})`);
  }
  for (const certification of profile.certifications) {
    add(`Certification: ${certification.name}`);
  }
  for (const engagement of profile.otherEngagements) {
    add(`${engagement.role || "Engagement"} at ${engagement.organization}`);
  }
  return evidence;
}

function splitRequirements(application: JobApplication): string[] {
  const sources = [application.requirements, application.jobDescription].filter(
    (text) => text.trim().length > 0,
  );
  if (sources.length === 0) return [];

  const candidates: string[] = [];
  for (const source of sources) {
    const lines = source
      .split(/\r?\n|(?<=[.;])\s+/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
      .filter((line) => line.length >= 12);
    candidates.push(...lines);
    if (candidates.length >= 12) break;
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of candidates) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
    if (unique.length >= 12) break;
  }
  return unique;
}

/**
 * A deliberately simple, offline matrix: requirement lines are matched against
 * profile skills, roles, education and languages. It gives the user a quick
 * overview and hints where the profile lacks evidence; the chat assistant
 * remains the place for nuanced fit evaluation.
 */
export function buildFitMatrix(
  application: JobApplication,
  profile: FitProfile | null,
): FitMatrix {
  const evidence = profileEvidence(profile);
  const rows: FitRow[] = [];

  for (const requirement of splitRequirements(application)) {
    const words = contentWords(requirement);
    if (words.size === 0) continue;
    const matches = evidence
      .map((item) => {
        const overlap = [...words].filter((word) => item.words.has(word));
        return { item, overlap };
      })
      .filter((match) => match.overlap.length > 0)
      .sort((a, b) => b.overlap.length - a.overlap.length)
      .slice(0, 3);

    const level: FitLevel =
      matches.length >= 2 ? "strong" : matches.length === 1 ? "partial" : "gap";
    rows.push({
      requirement,
      level,
      evidence: matches.map((match) => match.item.text),
    });
  }

  return {
    rows,
    strong: rows.filter((row) => row.level === "strong").length,
    partial: rows.filter((row) => row.level === "partial").length,
    gap: rows.filter((row) => row.level === "gap").length,
  };
}
