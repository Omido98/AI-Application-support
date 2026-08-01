import type { ProfileData } from "@/types";

export interface ApplicationContext {
  company: string;
  jobDescription: string;
  language: string;
  requirements: string;
  companyResearch: string;
}

export interface PromptOptions {
  mode: "standard" | "custom";
  customPrompt: string;
}

const ROLE_LINE =
  "You are an expert job application advisor. Your role is to help the user write a compelling cover letter and/or answer application questions for a specific job.";

const BEHAVIOR_RULES = [
  "- Before writing anything, ask clarifying questions about the application requirements and the user's approach. Be thorough.",
  "- Discuss different ways to structure/answer each part with the user before committing to a draft.",
  "- Use keywords that applicant tracking systems (ATS) look for, but write in a natural, human tone. Do not sound boastful or robotic.",
  "- The user's complete profile — education, work experience (including responsibilities and projects), skills, languages, and every previous cover letter — is included above. Use it as your source of truth when tailoring your advice and drafts.",
  "- Learn from the user's previous cover letters: match their tone and style, and pay attention to specific interests or themes they expressed in them. Reflect those themes again when they are relevant to the new role, but always write new content from scratch rather than copying or lightly editing an old letter.",
  "- If you see a clear way to improve on a previous letter, suggest it.",
  "- For every section you write, explain WHY you chose specific words, phrases, or mentioned specific experiences.",
  "- If there are multiple application questions, handle them one at a time. Be thorough with each.",
  "- When you feel ready to write the final draft, tell the user and ask if there's anything more they'd like to discuss. Only write the final draft when the user explicitly tells you to proceed.",
  "- Ask the user if there is a word count or character limit they need to stay within, and adhere to it.",
  "- Always write in the language specified in the Application Context.",
  "- You have access to two tools: web_search(query) — search the web for current information — and fetch_page(url) — fetch a page and return its plain text content. Use them whenever you need up-to-date facts you are not certain of.",
  "- Before advising on a company, run an initial research pass on it: its purpose, industry, and recent news or trends — especially when the Company Research field in the Application Context says \"(not provided)\". Search for the company name, then fetch its official pages (e.g. about, careers, news) to ground your advice in real, current information.",
  "- When you used search results, cite what you found (page titles and sources) and clearly distinguish facts from your search results versus facts from your own training knowledge. Never fabricate details about the company.",
  "- If a search or page fetch fails, tell the user and continue with what you already know.",
];

/**
 * The fixed, built-in part of the system prompt: the role line plus the
 * behavior rules. This is what the standard chat agent uses (with the
 * dynamic Application Context and Candidate Profile appended afterwards).
 */
export function getStandardPrompt(): string {
  return [ROLE_LINE, "", "Your Behavior Rules", ...BEHAVIOR_RULES].join("\n");
}

function formatDate(month: string, year?: string): string {
  return year ? `${month} ${year}` : month;
}

/**
 * Build the system prompt for the AI assistant.
 * Merges application context and the FULL candidate profile
 * (education, work experience incl. responsibilities/projects, skills,
 * languages, and all previous cover letters) into a structured prompt.
 *
 * When `options.mode` is "custom" and `options.customPrompt` is non-empty,
 * the custom text replaces the fixed instructions (role line + behavior
 * rules); the Application Context and Candidate Profile sections are always
 * appended so the agent keeps knowing the user and the job.
 */
export function buildSystemPrompt(
  application: ApplicationContext,
  profile: ProfileData | null,
  options?: Partial<PromptOptions>,
): string {
  const { company, jobDescription, language, requirements, companyResearch } =
    application;

  const custom = (options?.customPrompt ?? "").trim();
  const useCustom = options?.mode === "custom" && custom.length > 0;

  const sections: string[] = useCustom
    ? [custom, ""]
    : [ROLE_LINE, ""];

  sections.push(
    "Application Context",
    `- Company: ${company || "(not provided)"}`,
    `- Job Description: ${jobDescription || "(not provided)"}`,
    `- Application Language: ${language || "(not provided)"}`,
    `- Application Requirements: ${requirements || "(not provided)"}`,
    `- Company Research (provided by user): ${companyResearch || "(not provided)"}`,
    "",
    "Candidate Profile (complete)",
  );

  if (profile) {
    if (profile.education.length > 0) {
      sections.push("- Education:");
      profile.education.forEach((e) => {
        const eduEnd = e.endYear ? formatDate(e.endMonth, e.endYear) : "present";
        const parts = [
          `  * ${e.degree} in ${e.major} at ${e.school} (${formatDate(e.startMonth, e.startYear)} – ${eduEnd})`,
        ];
        if (e.programName) parts.push(`    Program: ${e.programName}`);
        if (e.finalGrade) parts.push(`    Final grade: ${e.finalGrade}`);
        if (e.thesisTitle) parts.push(`    Thesis: ${e.thesisTitle}`);
        if (e.courses.length > 0) {
          parts.push(`    Courses: ${e.courses.join(", ")}`);
        }
        sections.push(parts.join("\n"));
      });
    }
    if (profile.workExperience.length > 0) {
      sections.push("- Work Experience:");
      profile.workExperience.forEach((w) => {
        const end = w.isCurrent
          ? "present"
          : `${formatDate(w.endMonth ?? "", w.endYear)}`;
        const parts = [
          `  * ${w.role} at ${w.company} (${formatDate(w.startMonth, w.startYear)} – ${end})`,
        ];
        if (w.jobDescription) {
          parts.push(`    Responsibilities: ${w.jobDescription}`);
        }
        const projects = w.projects.filter((p) => p.trim().length > 0);
        if (projects.length > 0) {
          parts.push(`    Projects/Initiatives: ${projects.join(" | ")}`);
        }
        sections.push(parts.join("\n"));
      });
    }
    if (profile.skills.length > 0) {
      sections.push(
        "- Skills: " + profile.skills.map((s) => s.name).join(", "),
      );
    }
    if (profile.languages.length > 0) {
      sections.push(
        "- Languages: " +
          profile.languages.map((l) => `${l.name} (${l.fluency})`).join(", "),
      );
    }
    if (profile.coverLetters.length > 0) {
      sections.push("- Previous Cover Letters (full text):");
      profile.coverLetters.forEach((cl, i) => {
        const date = cl.addedAt
          ? new Date(cl.addedAt).toLocaleDateString()
          : "unknown date";
        const target = cl.company ? `for ${cl.company}` : "(no company recorded)";
        sections.push(`  [Cover Letter ${i + 1} — ${target}, added ${date}]`);
        sections.push(cl.content.trim() || "(empty)");
      });
    }
  } else {
    sections.push(
      "The user has not filled in their profile yet.",
    );
  }

  if (!useCustom) {
    sections.push("", "Your Behavior Rules", ...BEHAVIOR_RULES);
  }

  return sections.join("\n");
}
