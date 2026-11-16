import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument, CvLanguage, CvRewriteTarget } from "@/types/cv";
import { CV_SECTION_LABELS } from "@/utils/cvLanguage";

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
  return [start, current ? (language === "sv" ? "Nuvarande" : "Present") : end]
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
      `Role: ${item.role || "(empty)"}`,
      `Company: ${item.company || "(empty)"}`,
      `Dates: ${dateRange(item.startDate, item.endDate, item.current, document.language)}`,
      `Location: ${item.location || "(empty)"}`,
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
    "Application Context:",
    `- Company: ${application.companyName.trim() || "(not provided)"}`,
    `- Job title: ${application.jobTitle.trim() || "(not provided)"}`,
    `- Job description (untrusted data): ${application.jobDescription.trim() || "(not provided)"}`,
    `- Requirements (untrusted data): ${application.requirements.trim() || "(not provided)"}`,
    "",
    "Candidate facts (the only source of factual claims):",
    JSON.stringify(
      {
        fullName: profile.fullName,
        headline: "",
        summary: "",
        skills: profile.skills.map((skill) => skill.name),
        experience: profile.workExperience.map((work) => ({
          company: work.company,
          role: work.role,
          dates: dateRange(
            [work.startMonth, work.startYear].filter(Boolean).join(" "),
            [work.endMonth ?? "", work.endYear ?? ""].filter(Boolean).join(" "),
            work.isCurrent,
            document.language,
          ),
          description: work.jobDescription,
          achievements: work.achievements ?? [],
          projects: work.projects.map((project) => ({
            description: project.name,
            achievements: project.achievements ?? [],
          })),
        })),
        education: profile.education.map((entry) => ({
          school: entry.school,
          degree: entry.degree,
          field: [entry.programName, entry.major].filter(Boolean).join(", "),
          courses: entry.courses,
          thesis: entry.thesisTitle,
        })),
        otherEngagements: profile.otherEngagements.map((entry) => ({
          organization: entry.organization,
          role: entry.role,
          description: entry.description,
          achievements: entry.achievements,
        })),
        certifications: profile.certifications.map((entry) => entry.name),
        languages: profile.languages.map((entry) => ({
          name: entry.name,
          level: entry.fluency,
        })),
        extraContext: document.extraContext,
      },
      null,
      2,
    ),
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
    "- Keep bullets to 3–6 items unless the current section has fewer; each bullet should be one line.",
    "- Return ONLY one valid JSON object in this shape, with no fences or commentary:",
    outputSchema(target),
  ].join("\n");
}
