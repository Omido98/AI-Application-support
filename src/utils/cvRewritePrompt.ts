import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument, CvLanguage, CvRewriteTarget } from "@/types/cv";
import { extractJobKeywords } from "@/utils/cvAts";
import { CV_SECTION_LABELS, CV_UI_TEXT } from "@/utils/cvLanguage";
import {
  experienceRangeLabel,
  roleDateRange,
  sortCvRoles,
} from "@/utils/cvExperience";

const LANGUAGE_NAME: Record<CvLanguage, string> = {
  en: "English",
  sv: "Swedish",
};

function dateRange(
  start: string,
  end: string,
  current: boolean,
  language: CvLanguage,
): string {
  return [start, current ? CV_UI_TEXT[language].present : end]
    .filter(Boolean)
    .join(" – ");
}

function currentSectionBlock(
  document: CvDocument,
  target: CvRewriteTarget,
): string {
  if (target.kind === "summary") {
    return [
      `Headline: ${document.headline || "(empty)"}`,
      `Summary: ${document.summary || "(empty)"}`,
    ].join("\n");
  }

  if (target.kind === "experience") {
    const item = document.experience.find((entry) => entry.id === target.id);
    if (!item)
      throw new Error("The selected experience entry no longer exists.");
    return [
      `Company: ${item.company || "(empty)"}`,
      `Dates: ${experienceRangeLabel(item, document.language) || "(empty)"}`,
      `Location: ${item.location || "(empty)"}`,
      "Roles:",
      ...sortCvRoles(item.roles).map(
        (role) =>
          `- ${role.title || "(role)"} (${roleDateRange(role, document.language)})`,
      ),
      "Bullets:",
      ...item.bullets.map((bullet) => `- ${bullet}`),
    ].join("\n");
  }

  if (target.kind === "project") {
    const item = document.projects.find((entry) => entry.id === target.id);
    if (!item) throw new Error("The selected project no longer exists.");
    return [
      `Title: ${item.title || "(empty)"}`,
      `Period: ${item.period || "(empty)"}`,
      `Description: ${item.description || "(empty)"}`,
      "Bullets:",
      ...item.bullets.map((bullet) => `- ${bullet}`),
    ].join("\n");
  }

  const item = document.otherEngagements.find(
    (entry) => entry.id === target.id,
  );
  if (!item) throw new Error("The selected experience entry no longer exists.");
  return [
    `Organization: ${item.organization || "(empty)"}`,
    `Role: ${item.role || "(empty)"}`,
    `Dates: ${dateRange(item.startDate, item.endDate, item.current, document.language)}`,
    "Bullets:",
    ...item.bullets.map((bullet) => `- ${bullet}`),
  ].join("\n");
}

function outputSchema(target: CvRewriteTarget): string {
  if (target.kind === "summary") {
    return `{
  "headline": "",
  "summary": ""
}`;
  }
  if (target.kind === "project") {
    return `{
  "title": "",
  "description": "",
  "bullets": []
}`;
  }
  return `{
  "bullets": []
}`;
}

function truncate(value: string, limit: number): string {
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}

function workFacts(
  work: ProfileData["workExperience"][number],
  language: CvLanguage,
) {
  return {
    company: work.company,
    role: work.role,
    dates: dateRange(
      [work.startMonth, work.startYear].filter(Boolean).join(" "),
      [work.endMonth ?? "", work.endYear ?? ""].filter(Boolean).join(" "),
      work.isCurrent,
      language,
    ),
    description: truncate(work.jobDescription, 700),
    achievements: work.achievements ?? [],
    projects: work.projects.map((project) => ({
      description: truncate(project.name, 300),
      achievements: project.achievements ?? [],
    })),
  };
}

/**
 * Only the profile facts relevant to the section being rewritten. Sending the
 * whole profile for one bullet wastes tokens and dilutes the instruction.
 */
function relevantProfileFacts(
  profile: ProfileData,
  document: CvDocument,
  target: CvRewriteTarget,
): Record<string, unknown> {
  const skills = profile.skills.map((skill) => skill.name);
  const extraContext = document.extraContext;

  if (target.kind === "summary") {
    return {
      skills,
      roles: profile.workExperience.map((work) =>
        workFacts(work, document.language),
      ),
      extraContext,
    };
  }

  if (target.kind === "experience") {
    const cvItem = document.experience.find((item) => item.id === target.id);
    const sourceIds = new Set(
      (cvItem?.roles ?? [])
        .map((role) => role.sourceId)
        .filter((id): id is string => Boolean(id)),
    );
    // The group sourceId is only a fallback for a group whose roles have no
    // profile references. Once roles are present, using their IDs prevents a
    // stale group ID from pulling in a role that was deleted from the CV.
    if (sourceIds.size === 0 && cvItem?.sourceId) {
      sourceIds.add(cvItem.sourceId);
    }
    const targetRoles = profile.workExperience
      .filter((work) => sourceIds.has(work.id))
      .map((work) => workFacts(work, document.language));
    return {
      skills,
      targetRoles,
      extraContext,
    };
  }

  if (target.kind === "project") {
    const cvProject = document.projects.find((item) => item.id === target.id);
    const parent = cvProject?.sourceId
      ? profile.workExperience.find((work) =>
          work.projects.some((project) => project.id === cvProject.sourceId),
        )
      : undefined;
    const project = parent?.projects.find(
      (item) => item.id === cvProject?.sourceId,
    );
    return {
      skills,
      parentRole: parent
        ? { company: parent.company, role: parent.role }
        : null,
      project: project
        ? {
            description: truncate(project.name, 500),
            achievements: project.achievements ?? [],
          }
        : null,
      extraContext,
    };
  }

  const cvOther = document.otherEngagements.find(
    (item) => item.id === target.id,
  );
  const other = cvOther?.sourceId
    ? profile.otherEngagements.find((entry) => entry.id === cvOther.sourceId)
    : undefined;
  return {
    skills,
    engagement: other
      ? {
          organization: other.organization,
          role: other.role,
          description: truncate(other.description, 500),
          achievements: other.achievements ?? [],
        }
      : null,
    extraContext,
  };
}

function compactJobContext(application: JobApplication): string[] {
  const keywords = extractJobKeywords(
    [
      application.jobTitle,
      application.jobDescription,
      application.requirements,
    ].join("\n"),
    12,
  );
  return [
    "Application Context:",
    `- Company: ${application.companyName.trim() || "(not provided)"}`,
    `- Job title: ${application.jobTitle.trim() || "(not provided)"}`,
    `- Job description (untrusted data, truncated): ${
      truncate(application.jobDescription, 1_000) || "(not provided)"
    }`,
    `- Requirements (untrusted data, truncated): ${
      truncate(application.requirements, 700) || "(not provided)"
    }`,
    `- Recurring job keywords: ${keywords.join(", ") || "(none)"}`,
  ];
}

/**
 * Prompt for rewriting one CV section in place. The rest of the document is not
 * rewritten; identifying fields are supplied by the app and must not change.
 */
export function buildCvRewritePrompt(
  application: JobApplication,
  profile: ProfileData,
  document: CvDocument,
  target: CvRewriteTarget,
  instruction: string,
): string {
  return [
    "You are an expert CV editor. Rewrite exactly one section of an existing CV, improving its ATS fit and clarity while keeping every fact honest.",
    "",
    ...compactJobContext(application),
    "",
    "Candidate facts relevant to this section (the only source of factual claims):",
    JSON.stringify(relevantProfileFacts(profile, document, target), null, 2),
    "",
    `Current section to rewrite (${CV_SECTION_LABELS[document.language][target.kind === "project" ? "projects" : target.kind === "other" ? "other" : target.kind === "experience" ? "experience" : "summary"]}):`,
    currentSectionBlock(document, target),
    "",
    `Candidate instruction (optional): ${instruction.trim() || "(none)"}`,
    "",
    "Rules:",
    "- Use only facts present in the candidate data or current section. Never invent employers, dates, metrics, tools, scope, qualifications or achievements.",
    "- You may rephrase, tighten, reorder and select from existing truthful details. Do not change the meaning of numbers, titles or dates.",
    "- Do not change companies, roles, dates, education, certifications or languages; the app preserves those fields.",
    "- Use strong action verbs, concrete language and no first-person pronouns, clichés, filler, emojis or markdown.",
    "- Mirror relevant job-description terms only where the candidate genuinely has that experience; never keyword-stuff.",
    `- Write the rewritten prose in ${LANGUAGE_NAME[document.language]}.`,
    "- Keep the number of bullets roughly the same unless the candidate asks to shorten or expand; do not add filler or drop strong evidence just to hit a count. Each bullet should be one line.",
    "- Return ONLY one valid JSON object in this shape, with no fences or commentary:",
    outputSchema(target),
  ].join("\n");
}
