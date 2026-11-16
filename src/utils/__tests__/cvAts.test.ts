import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { analyzeCvAts, cvPlainText, extractJobKeywords } from "@/utils/cvAts";

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Platform Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription:
    "We need a Platform Engineer with TypeScript, React and accessibility experience. You will build design systems and mentor engineers. Experience with testing is a plus.",
  applicationLanguage: "English",
  requirements: "TypeScript, React, accessibility, testing.",
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
  phone: "+45 12 34 56 78",
  city: "Copenhagen",
  country: "Denmark",
  linkedinUrl: "",
  portfolioUrl: "",
  githubUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [
    {
      id: "work-1",
      company: "Fjordline",
      role: "Frontend Engineer",
      startMonth: "July",
      startYear: "2022",
      isCurrent: true,
      jobDescription:
        "Build TypeScript interfaces and accessible React components.",
      achievements: ["Reduced reporting time by 30%"],
      projects: [],
    },
  ],
  otherEngagements: [],
  certifications: [],
  skills: [
    { id: "s1", name: "TypeScript" },
    { id: "s2", name: "React" },
    { id: "s3", name: "Accessibility" },
  ],
  languages: [{ id: "l1", name: "English", fluency: "Fluent" }],
};

function document() {
  const doc = createCvDocumentFromProfile(profile, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
  doc.headline = "Platform Engineer";
  doc.summary =
    "Frontend engineer focused on accessible design systems and reliable TypeScript applications.";
  doc.experience[0].bullets = [
    "Built accessible React components used by 1,800 technicians.",
    "Reduced reporting time by 30% with a TypeScript design system.",
  ];
  return doc;
}

describe("extractJobKeywords", () => {
  it("keeps meaningful repeated terms and removes stopwords", () => {
    const keywords = extractJobKeywords(application.jobDescription);
    expect(keywords).toContain("typescript");
    expect(keywords).toContain("accessibility");
    expect(keywords).not.toContain("experience");
    expect(keywords).not.toContain("with");
  });
});

describe("analyzeCvAts", () => {
  it("reports exact matches and missing terms without claiming them", () => {
    const doc = document();
    const report = analyzeCvAts(doc, application);

    expect(report.matchedKeywords).toEqual(
      expect.arrayContaining(["typescript", "react", "accessibility"]),
    );
    expect(report.missingKeywords).toContain("testing");
    expect(report.keywordCoverage).toBeGreaterThan(0);
    expect(report.wordCount).toBeGreaterThan(20);
    expect(report.checks.find((check) => check.id === "contact")?.ok).toBe(
      true,
    );
    expect(report.checks.find((check) => check.id === "experience")?.ok).toBe(
      true,
    );
    expect(cvPlainText(doc)).toContain("Reduced reporting time");
  });

  it("flags missing contact details and short skills", () => {
    const doc = document();
    doc.contact.email = "";
    doc.skills = ["TypeScript"];
    const report = analyzeCvAts(doc, application);

    expect(report.checks.find((check) => check.id === "contact")?.ok).toBe(
      false,
    );
    expect(report.checks.find((check) => check.id === "skills")?.ok).toBe(
      false,
    );
  });
});
