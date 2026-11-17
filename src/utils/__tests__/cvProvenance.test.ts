import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import {
  clearAiSection,
  markAiSection,
  markAiSections,
  sectionForRewriteTarget,
} from "@/utils/cvProvenance";

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
  skills: [],
  languages: [],
};

function makeDocument() {
  return createCvDocumentFromProfile(profile, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
}

describe("cv provenance", () => {
  it("maps rewrite targets to section ids", () => {
    expect(sectionForRewriteTarget({ kind: "summary" })).toBe("summary");
    expect(sectionForRewriteTarget({ kind: "experience", id: "work-1" })).toBe(
      "experience",
    );
    expect(sectionForRewriteTarget({ kind: "project", id: "p-1" })).toBe(
      "projects",
    );
    expect(sectionForRewriteTarget({ kind: "other", id: "o-1" })).toBe("other");
  });

  it("marks and clears sections without changing content", () => {
    const document = makeDocument();
    const marked = markAiSections(markAiSection(document, "summary"), [
      "experience",
      "projects",
    ]);
    expect(marked.aiSections).toEqual(["summary", "experience", "projects"]);

    const cleared = clearAiSection(marked, "experience");
    expect(cleared.aiSections).toEqual(["summary", "projects"]);
    expect(cleared.summary).toBe(document.summary);
    expect(cleared.experience).toBe(document.experience);
  });

  it("is a no-op when the marker is absent", () => {
    const document = makeDocument();
    expect(markAiSection(document, "summary")).not.toBe(document);
    expect(clearAiSection(document, "summary")).toBe(document);
  });
});
