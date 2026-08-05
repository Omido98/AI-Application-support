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
  "Working with the user:",
  "- Before writing anything, ask clarifying questions about the application requirements and the user's approach, including any word count or character limit to stay within. Be thorough.",
  "- Never ask for information that is already in the profile or Application Context.",
  "- Discuss different ways to structure or answer each part with the user before committing to a draft.",
  "- If there are multiple application questions, handle them one at a time.",
  "- When you feel ready to write the final draft, tell the user and ask if there's anything more they'd like to discuss. Only write the final draft when the user explicitly tells you to proceed.",
  "",
  "Writing style:",
  "- Use keywords that applicant tracking systems (ATS) look for, but write in a natural, human tone. Do not sound boastful or robotic.",
  "- For every section you write, explain WHY you chose specific words, phrases, or mentioned specific experiences.",
  "- Always write in the language specified in the Application Context.",
  "- Tailor every draft to the specific requirements in the Job Description; show how each of the user's experiences maps to them.",
  "- Write direct, affirmative sentences. Avoid formulaic AI phrasing: empty buzzwords and hype like \"delve,\" \"streamlined,\" or \"passionate,\" empty openings like \"I am writing to express my interest,\" and setups like \"X isn't just about Y\" or \"X is more than Y.\" Terms the job description itself uses are fine.",
  "- Never use em dashes (—) in your output; use commas, parentheses, or regular dashes instead.",
  "",
  "What to rely on:",
  "- The user's complete profile — education, work experience (including responsibilities and projects), skills, languages, and every previous cover letter — is included above. Use it as your source of truth when tailoring your advice and drafts.",
  "- Learn from the user's previous cover letters only for content inspiration: pay attention to specific interests or themes they expressed in them, and reflect those again when they are relevant to the new role. Never use an old letter as a template — do not copy its tone, structure, style, or wording. Always write new content from scratch with the tone and structure that best fit the new role.",
  "- If you see a clear way to improve on a previous letter, suggest it.",
  "- The user may provide a LinkedIn profile URL in their profile. Use it to learn more about them when relevant — you may fetch the page for additional context, but never invent details that are not visible there.",
  "",
  "Research:",
  "- You have access to two tools: web_search(query) — search the web for current information — and fetch_page(url) — fetch a page and return its plain text content. Use them whenever you need up-to-date facts you are not certain of.",
  "- Before advising on a company, run a research pass on it: its purpose, industry, and recent news or trends — especially when the Company Research field in the Application Context says \"(not provided)\". Search for the company name, then fetch its official pages (e.g. about, careers, news) to ground your advice in real, current information. Limit yourself to one search and up to 5 page fetches per turn.",
  "- When you used search results, cite what you found (page titles and sources) and clearly distinguish facts from your search results versus facts from your own training knowledge. Never fabricate details about the company.",
  "- If a search or page fetch fails, tell the user, distinguish what you could not confirm from what you already know, and say what would be needed to verify it. Then continue with what you already know.",
];

/**
 * The fixed, built-in part of the system prompt: the role line plus the
 * behavior rules. This is what the standard chat agent uses (with the
 * dynamic Application Context and Candidate Profile appended afterwards).
 */
export function getStandardPrompt(): string {
  return [ROLE_LINE, "", "Your Behavior Rules", "", ...BEHAVIOR_RULES].join("\n");
}

function formatDate(month: string, year?: string): string {
  return year ? `${month} ${year}` : month;
}

/**
 * Whether the profile actually carries any content the agent can use.
 * A non-null profile with every section empty is indistinguishable from
 * "not filled in yet" — never claim it is complete in that case.
 */
function hasProfileContent(profile: ProfileData | null): boolean {
  if (!profile) return false;
  return (
    profile.fullName.trim().length > 0 ||
    profile.email.trim().length > 0 ||
    profile.city.trim().length > 0 ||
    profile.country.trim().length > 0 ||
    profile.linkedinUrl.trim().length > 0 ||
    profile.bio.trim().length > 0 ||
    profile.interests.length > 0 ||
    profile.education.length > 0 ||
    profile.workExperience.length > 0 ||
    profile.certifications.length > 0 ||
    profile.skills.length > 0 ||
    profile.languages.length > 0 ||
    profile.coverLetters.some((cl) => cl.content.trim().length > 0)
  );
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

  const profileHasContent = hasProfileContent(profile);

  sections.push(
    "Application Context",
    `- Company: ${company || "(not provided)"}`,
    `- Job Description: ${jobDescription || "(not provided)"}`,
    `- Application Language: ${language || "(not provided)"}`,
    `- Application Requirements: ${requirements || "(not provided)"}`,
    `- Company Research (provided by user): ${companyResearch || "(not provided)"}`,
    "",
    profileHasContent ? "Candidate Profile (complete)" : "Candidate Profile",
  );

  if (profile && profileHasContent) {
    const details: string[] = [];
    if (profile.fullName.trim()) details.push(`name: ${profile.fullName.trim()}`);
    if (profile.email.trim()) details.push(`email: ${profile.email.trim()}`);
    if (profile.city.trim() && profile.country.trim()) {
      details.push(`location: ${profile.city.trim()}, ${profile.country.trim()}`);
    } else if (profile.city.trim()) {
      details.push(`city: ${profile.city.trim()}`);
    } else if (profile.country.trim()) {
      details.push(`country: ${profile.country.trim()}`);
    }
    if (profile.linkedinUrl.trim()) {
      details.push(`LinkedIn: ${profile.linkedinUrl.trim()}`);
    }
    if (details.length > 0) {
      sections.push("- Personal Details:", ...details.map((d) => `  * ${d}`));
    }
    if (profile.bio.trim()) {
      sections.push(`- Bio: ${profile.bio.trim()}`);
    }
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
    if (profile.certifications.length > 0) {
      sections.push(
        "- Certifications: " +
          profile.certifications
            .map(
              (c) =>
                `${c.name} (expires ${c.expiryMonth} ${c.expiryYear})`,
            )
            .join(" | "),
      );
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
    const interests = profile.interests
      .map((i) => i.name.trim())
      .filter((n) => n.length > 0);
    if (interests.length > 0) {
      sections.push("- Interests: " + interests.join(", "));
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
    sections.push("", "Your Behavior Rules", "", ...BEHAVIOR_RULES);
  }

  return sections.join("\n");
}

/**
 * Build the system prompt for generating a CV bio.
 * Renders a compact summary of the candidate profile and instructs the
 * model to write a first-person bio of roughly 50-100 words, applying the
 * same style rules as the chat agent.
 */
export function buildBioPrompt(profile: ProfileData): string {
  const sections: string[] = [
    "You are an expert CV writer. Write a short professional bio for the user's CV.",
    "",
    "A CV bio is the summary paragraph a recruiter reads first: who the person is, what they do, their strongest experience and skills, and what they are looking for. Write it in the first person, as if the user wrote it themselves, in a single paragraph of roughly 50-100 words.",
    "",
    "Rules:",
    "- Ground everything in the profile below. Never invent facts, employers, roles, dates, skills, or achievements that are not in it. If the profile is sparse, write a shorter bio rather than fabricating.",
    "- Do not include the user's name, contact details, or links; the bio is the summary section of a CV.",
    "- Write direct, affirmative sentences. Avoid formulaic AI phrasing: overused buzzwords and hype like \"delve,\" \"streamlined,\" or \"passionate,\" empty openings like \"I am writing to express my interest,\" and setups like \"X is more than just Y.\"",
    "- Never use em dashes (—); use commas, parentheses, or regular dashes instead.",
    "- Output only the bio text, with no headings, labels, or commentary.",
  ];

  if (hasProfileContent(profile)) {
    sections.push("", "Candidate Profile");
    const details: string[] = [];
    if (profile.fullName.trim()) {
      details.push(`- Name: ${profile.fullName.trim()}`);
    }
    if (profile.city.trim() || profile.country.trim()) {
      details.push(
        `- Location: ${[profile.city.trim(), profile.country.trim()]
          .filter(Boolean)
          .join(", ")}`,
      );
    }
    if (details.length > 0) sections.push(...details);

    if (profile.education.length > 0) {
      sections.push(
        "- Education: " +
          profile.education
            .map((e) => `${e.degree} in ${e.major} at ${e.school}`)
            .join(" | "),
      );
    }
    if (profile.workExperience.length > 0) {
      sections.push(
        "- Work Experience: " +
          profile.workExperience
            .map((w) => `${w.role} at ${w.company}`)
            .join(" | "),
      );
    }
    if (profile.certifications.length > 0) {
      sections.push(
        "- Certifications: " +
          profile.certifications.map((c) => c.name).join(", "),
      );
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
    const interests = profile.interests
      .map((i) => i.name.trim())
      .filter((n) => n.length > 0);
    if (interests.length > 0) {
      sections.push("- Interests: " + interests.join(", "));
    }
  } else {
    sections.push(
      "",
      "The user has not filled in their profile yet. Keep the bio generic but honest, and note that the user should add details later.",
    );
  }

  return sections.join("\n");
}
