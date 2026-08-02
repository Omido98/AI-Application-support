import { describe, it, expect } from "vitest";
import { buildSystemPrompt, getStandardPrompt } from "@/utils/systemPrompt";
import type { ApplicationContext } from "@/utils/systemPrompt";
import type { ProfileData } from "@/types";

const baseApplication: ApplicationContext = {
  company: "Acme Corp",
  jobDescription: "Build the platform",
  language: "English",
  requirements: "Cover letter",
  companyResearch: "",
};

const emptyApplication: ApplicationContext = {
  company: "",
  jobDescription: "",
  language: "",
  requirements: "",
  companyResearch: "",
};

function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    education: [],
    coverLetters: [],
    workExperience: [],
    certifications: [],
    skills: [],
    languages: [],
    ...overrides,
  };
}

describe("getStandardPrompt", () => {
  it("includes the role line and behavior rules", () => {
    const prompt = getStandardPrompt();
    expect(prompt).toContain("You are an expert job application advisor");
    expect(prompt).toContain("Your Behavior Rules");
    expect(prompt).toContain("web_search");
  });

  it("limits research to one search and up to 5 page fetches per turn", () => {
    const prompt = getStandardPrompt();
    expect(prompt).toContain("one search and up to 5 page fetches per turn");
  });
});

describe("buildSystemPrompt", () => {
  it("includes the application context fields", () => {
    const prompt = buildSystemPrompt(baseApplication, null);
    expect(prompt).toContain("Application Context");
    expect(prompt).toContain("- Company: Acme Corp");
    expect(prompt).toContain("- Job Description: Build the platform");
    expect(prompt).toContain("- Application Language: English");
    expect(prompt).toContain("- Application Requirements: Cover letter");
  });

  it("marks missing application fields as not provided", () => {
    const prompt = buildSystemPrompt(emptyApplication, null);
    expect(prompt).toContain("- Company: (not provided)");
    expect(prompt).toContain("- Job Description: (not provided)");
  });

  it("says the profile is empty when profile is null", () => {
    const prompt = buildSystemPrompt(baseApplication, null);
    expect(prompt).toContain("The user has not filled in their profile yet.");
  });

  it("renders education, work experience, skills, languages and LinkedIn", () => {
    const profile = makeProfile({
      education: [
        {
          id: "e1",
          school: "DTU",
          degree: "BSc",
          programName: "",
          major: "Computer Science",
          startMonth: "September",
          startYear: "2019",
          endMonth: "June",
          endYear: "2022",
          finalGrade: "",
          courses: ["Algorithms", "Databases"],
          thesisTitle: "",
        },
      ],
      workExperience: [
        {
          id: "w1",
          company: "Startup A",
          role: "Developer",
          startMonth: "July",
          startYear: "2022",
          isCurrent: true,
          jobDescription: "Built features",
          projects: ["Project X", "Project Y"],
        },
      ],
      skills: [{ id: "s1", name: "TypeScript" }],
      languages: [{ id: "l1", name: "English", fluency: "Fluent" }],
      linkedinUrl: "https://linkedin.com/in/test",
    });
    const prompt = buildSystemPrompt(baseApplication, profile);
    expect(prompt).toContain("BSc in Computer Science at DTU");
    expect(prompt).toContain("2019");
    expect(prompt).toContain("Developer at Startup A");
    expect(prompt).toContain("Project X");
    expect(prompt).toContain("- Skills: TypeScript");
    expect(prompt).toContain("- Languages: English (Fluent)");
    expect(prompt).toContain("linkedin.com/in/test");
  });

  it("includes previous cover letters when present", () => {
    const profile = makeProfile({
      coverLetters: [
        {
          id: "c1",
          company: "Other Corp",
          content: "Dear hiring team, ...",
          addedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const prompt = buildSystemPrompt(baseApplication, profile);
    expect(prompt).toContain("Previous Cover Letters (full text)");
    expect(prompt).toContain("for Other Corp");
    expect(prompt).toContain("Dear hiring team, ...");
  });

  it("uses the standard rules by default", () => {
    const prompt = buildSystemPrompt(baseApplication, null);
    expect(prompt).toContain("Your Behavior Rules");
    expect(prompt).toContain("Before writing anything, ask clarifying questions");
  });

  it("replaces the standard rules with a custom prompt in custom mode", () => {
    const prompt = buildSystemPrompt(baseApplication, null, {
      mode: "custom",
      customPrompt: "You are a recruiter. Be brief.",
    });
    expect(prompt).toContain("You are a recruiter. Be brief.");
    expect(prompt).not.toContain("Your Behavior Rules");
    expect(prompt).not.toContain("Before writing anything");
  });

  it("keeps application context and profile in custom mode", () => {
    const profile = makeProfile({
      skills: [{ id: "s1", name: "Rust" }],
    });
    const prompt = buildSystemPrompt(baseApplication, profile, {
      mode: "custom",
      customPrompt: "Custom instructions.",
    });
    expect(prompt).toContain("Application Context");
    expect(prompt).toContain("- Company: Acme Corp");
    expect(prompt).toContain("- Skills: Rust");
  });

  it("falls back to the standard prompt when custom mode has no text", () => {
    const prompt = buildSystemPrompt(baseApplication, null, {
      mode: "custom",
      customPrompt: "   ",
    });
    expect(prompt).toContain("Your Behavior Rules");
  });
});
