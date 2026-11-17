import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { renderCvPdf } from "@/utils/cvPdf";

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
  city: "Stockholm",
  country: "Sweden",
  linkedinUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [
    {
      id: "work-1",
      company: "Fjordline",
      role: "Frontend Engineer",
      startMonth: "Jan",
      startYear: "2022",
      isCurrent: true,
      jobDescription: "Build accessible interfaces.",
      achievements: ["Reduced reporting time by 30%"],
      projects: [],
    },
  ],
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
  document.summary = "Frontend engineer focused on accessible systems.";
  return document;
}

describe("renderCvPdf", () => {
  it("produces a selectable-text PDF with a valid header", async () => {
    const bytes = await renderCvPdf(makeDocument());
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("supports the compact template and US Letter", async () => {
    const document = makeDocument();
    document.template = "compact";
    document.pageSize = "letter";
    const bytes = await renderCvPdf(document);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
