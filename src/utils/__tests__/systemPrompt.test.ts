import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  buildBioPrompt,
  getStandardPrompt,
} from "@/utils/systemPrompt";
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
    fullName: "",
    email: "",
    city: "",
    country: "",
    linkedinUrl: "",
    bio: "",
    interests: [],
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

  it("does not claim the profile is complete when it has no content", () => {
    const profile = makeProfile();
    const prompt = buildSystemPrompt(baseApplication, profile);
    expect(prompt).not.toContain("Candidate Profile (complete)");
    expect(prompt).toContain("The user has not filled in their profile yet.");
  });

  it("marks the profile as complete when it has content", () => {
    const profile = makeProfile({
      skills: [{ id: "s1", name: "Rust" }],
    });
    const prompt = buildSystemPrompt(baseApplication, profile);
    expect(prompt).toContain("Candidate Profile (complete)");
    expect(prompt).not.toContain(
      "The user has not filled in their profile yet.",
    );
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

  it("renders personal details, bio and interests", () => {
    const profile = makeProfile({
      fullName: "Jane Doe",
      email: "jane@example.com",
      city: "Copenhagen",
      country: "Denmark",
      linkedinUrl: "https://linkedin.com/in/jane",
      bio: "I am a developer who loves Rust.",
      interests: [{ id: "i1", name: "Trail running" }],
    });
    const prompt = buildSystemPrompt(baseApplication, profile);
    expect(prompt).toContain("- Personal Details:");
    expect(prompt).toContain("name: Jane Doe");
    expect(prompt).toContain("email: jane@example.com");
    expect(prompt).toContain("location: Copenhagen, Denmark");
    expect(prompt).toContain("LinkedIn: https://linkedin.com/in/jane");
    expect(prompt).toContain("- Bio: I am a developer who loves Rust.");
    expect(prompt).toContain("- Interests: Trail running");
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

describe("buildBioPrompt", () => {
  it("includes the writing instructions and style rules", () => {
    const prompt = buildBioPrompt(makeProfile());
    expect(prompt).toContain("roughly 50-100 words");
    expect(prompt).toContain("first person");
    expect(prompt).toContain("Never invent facts");
    expect(prompt).toContain("Never use em dashes");
    expect(prompt).toContain("Output only the bio text");
  });

  it("includes the candidate's profile data", () => {
    const profile = makeProfile({
      fullName: "Jane Doe",
      city: "Copenhagen",
      country: "Denmark",
      workExperience: [
        {
          id: "w1",
          company: "Startup A",
          role: "Developer",
          startMonth: "July",
          startYear: "2022",
          isCurrent: true,
          jobDescription: "",
          projects: [],
        },
      ],
      skills: [{ id: "s1", name: "TypeScript" }],
      interests: [{ id: "i1", name: "Trail running" }],
    });
    const prompt = buildBioPrompt(profile);
    expect(prompt).toContain("Jane Doe");
    expect(prompt).toContain("Copenhagen, Denmark");
    expect(prompt).toContain("Developer at Startup A");
    expect(prompt).toContain("TypeScript");
    expect(prompt).toContain("Trail running");
  });

  it("handles an empty profile gracefully", () => {
    const prompt = buildBioPrompt(makeProfile());
    expect(prompt).toContain("has not filled in their profile yet");
  });
});
