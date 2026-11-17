import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { analyzeCvDocument, getCvJobContext } from "@/utils/cvAnalysis";
import { getCvProfileContext } from "@/utils/cvProfileContext";

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Platform Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription:
    "Build design systems. Our design systems team builds design systems with TypeScript.",
  applicationLanguage: "English",
  requirements: "Must have TypeScript.\nNice to have AWS.",
  companyResearch: "",
  notes: "",
  location: "",
  workMode: "",
  salary: "",
  source: "",
  priority: "medium",
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
  city: "",
  country: "",
  linkedinUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [],
  otherEngagements: [],
  certifications: [],
  skills: [{ id: "skill-1", name: "TypeScript" }],
  languages: [],
};

function makeDocument() {
  const document = createCvDocumentFromProfile(profile, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
  document.summary =
    "Built design systems with TypeScript and cut costs by 47%.";
  return document;
}

describe("shared CV analysis", () => {
  it("caches profile and job context by object identity", () => {
    const firstProfile = getCvProfileContext(profile);
    expect(getCvProfileContext(profile)).toBe(firstProfile);

    const firstJob = getCvJobContext(application);
    expect(getCvJobContext(application)).toBe(firstJob);
    expect(firstJob.keywords).toContain("typescript");
    expect(firstJob.phrases).toContain("design systems");
  });

  it("runs ATS and grounding from one document snapshot", () => {
    const result = analyzeCvDocument(makeDocument(), application, profile);

    expect(result.ats.matchedKeywords).toContain("typescript");
    expect(
      result.ats.unverifiedNumbers.some((warning) => warning.includes("47%")),
    ).toBe(true);
    expect(
      result.grounding.warnings.some(
        (warning) => warning.category === "number",
      ),
    ).toBe(true);
  });
});
