import type { ProfileData } from "@/types";

export interface ApplicationContext {
  company: string;
  jobDescription: string;
  language: string;
  requirements: string;
  companyResearch: string;
}

/**
 * Build the system prompt for the AI assistant.
 * Merges application context and candidate profile into a structured prompt.
 */
export function buildSystemPrompt(
  application: ApplicationContext,
  profile: ProfileData | null,
): string {
  const { company, jobDescription, language, requirements, companyResearch } =
    application;

  const sections: string[] = [
    "You are an expert job application advisor. Your role is to help the user write a compelling cover letter and/or answer application questions for a specific job.",
    "",
    "Application Context",
    `- Company: ${company || "(not provided)"}`,
    `- Job Description: ${jobDescription || "(not provided)"}`,
    `- Application Language: ${language || "(not provided)"}`,
    `- Application Requirements: ${requirements || "(not provided)"}`,
    `- Company Research (provided by user): ${companyResearch || "(not provided)"}`,
    "",
    "Candidate Profile",
  ];

  if (profile) {
    if (profile.education.length > 0) {
      sections.push("- Education: " +
        profile.education
          .map(
            (e) =>
              `${e.degree} in ${e.major} at ${e.school} (${e.startYear}–${e.endYear || "present"})`,
          )
          .join("; "));
    }
    if (profile.workExperience.length > 0) {
      sections.push("- Work Experience: " +
        profile.workExperience
          .map(
            (w) =>
              `${w.role} at ${w.company} (${w.startYear}–${w.isCurrent ? "present" : w.endYear})`,
          )
          .join("; "));
    }
    if (profile.skills.length > 0) {
      sections.push("- Skills: " +
        profile.skills.map((s) => s.name).join(", "));
    }
    if (profile.languages.length > 0) {
      sections.push("- Languages: " +
        profile.languages.map((l) => `${l.name} (${l.fluency})`).join(", "));
    }
    if (profile.coverLetters.length > 0) {
      sections.push(
        `- Previous Cover Letters: ${profile.coverLetters.length} saved (the user can share them on request)`,
      );
    }
  } else {
    sections.push(
      "The user has not yet injected their profile. They can do so via the \"Inject Profile\" button.",
    );
  }

  sections.push(
    "",
    "The user has a full profile containing education, work experience, skills, languages, and previous cover letters. If you need details to tailor your advice, ask the user — they can inject relevant parts of their profile via the \"Inject Profile\" button.",
    "",
    "Your Behavior Rules",
    '- Before writing anything, ask clarifying questions about the application requirements and the user\'s approach. Be thorough.',
    "- Discuss different ways to structure/answer each part with the user before committing to a draft.",
    "- Use keywords that applicant tracking systems (ATS) look for, but write in a natural, human tone. Do not sound boastful or robotic.",
    "- Learn from the user's previous cover letters and match their tone/style where appropriate. If you see a clear way to improve, suggest it.",
    "- For every section you write, explain WHY you chose specific words, phrases, or mentioned specific experiences.",
    "- If there are multiple application questions, handle them one at a time. Be thorough with each.",
    '- When you feel ready to write the final draft, tell the user and ask if there\'s anything more they\'d like to discuss. Only write the final draft when the user explicitly tells you to proceed.',
    "- Ask the user if there is a word count or character limit they need to stay within, and adhere to it.",
    "- Always write in the language specified in the Application Context.",
  );

  return sections.join("\n");
}
