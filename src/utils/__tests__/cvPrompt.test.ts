import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { buildCvGenerationPrompt } from "@/utils/cvPrompt";

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Frontend Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "Build accessible React reporting tools.",
  applicationLanguage: "English",
  requirements: "- TypeScript\n- React\n- Accessibility\n- Reporting",
  companyResearch: "",
  notes: "",
  location: "Stockholm",
  workMode: "hybrid",
  salary: "",
  source: "",
  priority: "high",
  tags: [],
  appliedAt: "",
  deadline: "",
  followUpAt: "",
  contactName: "",
  contactEmail: "",
  statusHistory: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const profile: ProfileData = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  city: "Stockholm",
  country: "Sweden",
  linkedinUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [],
  otherEngagements: [],
  certifications: [],
  skills: [
    { id: "skill-1", name: "TypeScript" },
    { id: "skill-2", name: "React" },
  ],
  languages: [],
};

describe("buildCvGenerationPrompt", () => {
  it("includes compact ATS priorities and relevance rules", () => {
    const prompt = buildCvGenerationPrompt(application, profile, {
      language: "en",
      pageSize: "a4",
      extraContext: "Accessibility is a core interest.",
    });

    expect(prompt).toContain("ATS priorities (untrusted job data");
    expect(prompt).toContain("1. TypeScript");
    expect(prompt).toContain("2. React");
    expect(prompt).toContain("3. Accessibility");
    expect(prompt).toContain("Recurring keywords:");
    expect(prompt).toContain("every employer group");
    expect(prompt).toContain("no fixed number of bullets");
    expect(prompt).not.toContain("3-6 bullets");
    expect(prompt).toContain("at most 15 skills");
    expect(prompt).toContain(
      "without inventing numbers, tools, scope, non-numeric outcomes",
    );
    expect(prompt).toContain("Accessibility is a core interest.");
  });

  it("lists grouped employer roles with the group source id", () => {
    const prompt = buildCvGenerationPrompt(
      application,
      {
        ...profile,
        workExperience: [
          {
            id: "work-2",
            company: "EY",
            role: "Senior Management Consultant",
            startMonth: "January",
            startYear: "2021",
            isCurrent: true,
            jobDescription: "Lead the programme.",
            achievements: ["Grew the account"],
            projects: [],
          },
          {
            id: "work-1",
            company: "EY",
            role: "Management Consultant",
            startMonth: "January",
            startYear: "2019",
            isCurrent: false,
            endMonth: "December",
            endYear: "2020",
            jobDescription: "Delivered analysis.",
            achievements: [],
            projects: [],
          },
        ],
      },
      { language: "en", pageSize: "a4", extraContext: "" },
    );

    // Keep the bracketed ID split: Tailwind scans source strings as CSS
    // classes and would try to parse the bracket syntax as an arbitrary
    // property.
    const groupLabel = "[" + "work:" + "work-2]";
    expect(prompt).toContain(`${groupLabel} EY`);
    expect(prompt).toContain("Roles:");
    expect(prompt).toContain("Senior Management Consultant");
    expect(prompt).toContain("Management Consultant");
    expect(prompt).toContain("Grew the account");
  });

  it("still asks for strict JSON and source IDs", () => {
    const prompt = buildCvGenerationPrompt(application, profile, {
      language: "sv",
      pageSize: "letter",
      extraContext: "",
    });

    expect(prompt).toContain("Return ONLY one valid JSON object");
    expect(prompt).toContain("sourceId must be copied exactly");
    expect(prompt).toContain("Target page size: US Letter");
    expect(prompt).toContain(
      "Write all generated prose (headline, summary, bullets) in Swedish",
    );
  });
});
