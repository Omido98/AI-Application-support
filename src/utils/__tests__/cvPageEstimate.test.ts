import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { estimateCvPages } from "@/utils/cvPageEstimate";

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

describe("estimateCvPages", () => {
  it("treats an empty CV as one page", () => {
    const estimate = estimateCvPages(makeDocument());
    expect(estimate.pages).toBe(1);
    expect(estimate.overflow).toBe(false);
    expect(estimate.pageHeight).toBe(1123);
  });

  it("warns when a long CV likely exceeds two pages", () => {
    const document = makeDocument();
    document.summary =
      "Experienced engineer delivering accessible systems. ".repeat(3);
    document.experience = Array.from({ length: 12 }, (_, index) => ({
      id: `role-${index}`,
      company: `Company ${index}`,
      role: `Engineer ${index}`,
      location: "Remote",
      startDate: "Jan 2020",
      endDate: "Dec 2022",
      current: false,
      bullets: Array.from(
        { length: 8 },
        (_, bullet) =>
          `Delivered a measurable reporting improvement for teams ${index}-${bullet}.`,
      ),
      included: true,
    }));

    const estimate = estimateCvPages(document);
    expect(estimate.pages).toBeGreaterThan(2);
    expect(estimate.overflow).toBe(true);
  });

  it("uses the shorter US Letter page height", () => {
    const document = makeDocument();
    document.pageSize = "letter";
    expect(estimateCvPages(document).pageHeight).toBe(1056);
  });
});
