import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { analyzeCoverLetterConsistency } from "@/utils/cvConsistency";

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "Build things.",
  applicationLanguage: "English",
  requirements: "",
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

function profile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
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
    skills: [],
    languages: [],
    ...overrides,
  };
}

function document(summary: string) {
  const cv = createCvDocumentFromProfile(profile(), application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
  cv.summary = summary;
  return cv;
}

describe("analyzeCoverLetterConsistency", () => {
  it("reports missing cover-letter themes and company mismatches", () => {
    const data = profile({
      coverLetterSummary: "Accessible design systems and mentoring",
      coverLetters: [
        {
          id: "cl-1",
          content: "Dear Acme",
          addedAt: "2026-01-01T00:00:00.000Z",
          applicationId: application.id,
          company: "Other Corp",
        },
      ],
    });
    const report = analyzeCoverLetterConsistency(
      document("Built accessible design systems."),
      data,
      application,
    );

    expect(report.hasContext).toBe(true);
    expect(
      report.checks.find((check) => check.id === "cover-summary")?.ok,
    ).toBe(false);
    expect(
      report.checks.find((check) => check.id === "cover-company")?.ok,
    ).toBe(false);
  });

  it("passes when the themes and company line up", () => {
    const data = profile({
      coverLetterSummary: "Accessible design systems and mentoring",
      coverLetters: [
        {
          id: "cl-1",
          content: "Dear Acme",
          addedAt: "2026-01-01T00:00:00.000Z",
          applicationId: application.id,
          company: "Acme",
        },
      ],
    });
    const report = analyzeCoverLetterConsistency(
      document("Built accessible design systems and mentoring."),
      data,
      application,
    );

    expect(report.checks.every((check) => check.ok)).toBe(true);
  });

  it("has no context without letters or a summary", () => {
    const report = analyzeCoverLetterConsistency(
      document("A summary."),
      profile(),
      application,
    );
    expect(report.hasContext).toBe(false);
    expect(report.checks).toEqual([]);
  });

  it("uses actual linked letter content when there is no summary", () => {
    const data = profile({
      coverLetters: [
        {
          id: "cl-1",
          content:
            "I build accessible design systems and mentoring programmes.",
          addedAt: "2026-01-01T00:00:00.000Z",
          applicationId: application.id,
          company: "Acme",
        },
      ],
    });
    const report = analyzeCoverLetterConsistency(
      document("Built accessible design systems."),
      data,
      application,
    );

    const themes = report.checks.find((check) => check.id === "cover-summary");
    expect(themes?.ok).toBe(false);
    expect(themes?.detail).toContain("mentoring");
  });

  it("treats a company-matched letter as relevant without an application id", () => {
    const data = profile({
      coverLetters: [
        {
          id: "cl-1",
          content: "I build accessible design systems.",
          addedAt: "2026-01-01T00:00:00.000Z",
          company: "acme",
        },
      ],
    });
    const report = analyzeCoverLetterConsistency(
      document("Built accessible design systems."),
      data,
      application,
    );

    expect(
      report.checks.find((check) => check.id === "cover-company")?.ok,
    ).toBe(true);
  });
});
