import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { renderCvDocx } from "@/utils/cvDocx";

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Platform Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "Build platforms.",
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
  phone: "+45 12 34 56 78",
  city: "Copenhagen",
  country: "Denmark",
  linkedinUrl: "https://linkedin.com/in/jane",
  portfolioUrl: "",
  githubUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [
    {
      id: "e1",
      school: "DTU",
      degree: "BSc",
      programName: "",
      major: "Software",
      startMonth: "August",
      startYear: "2018",
      endMonth: "June",
      endYear: "2021",
      finalGrade: "",
      courses: [],
      thesisTitle: "",
    },
  ],
  coverLetters: [],
  workExperience: [
    {
      id: "w1",
      company: "Fjordline",
      role: "Frontend Engineer",
      startMonth: "July",
      startYear: "2022",
      isCurrent: true,
      jobDescription: "Build accessible interfaces.",
      achievements: ["Reduced reporting time by 30%"],
      projects: [],
    },
  ],
  otherEngagements: [],
  certifications: [],
  skills: [
    { id: "s1", name: "TypeScript" },
    { id: "s2", name: "React" },
  ],
  languages: [{ id: "l1", name: "English", fluency: "Fluent" }],
};

async function extractText(bytes: Uint8Array): Promise<string> {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(bytes),
  });
  return result.value;
}

describe("renderCvDocx", () => {
  it("renders English headings and all CV content as extractable text", async () => {
    const document = createCvDocumentFromProfile(profile, application, {
      language: "en",
      pageSize: "a4",
      extraContext: "",
    });
    document.headline = "Platform Engineer";
    document.summary =
      "Frontend engineer focused on accessible design systems.";
    document.experience[0].bullets = ["Reduced reporting time by 30%"];

    const bytes = await renderCvDocx(document);
    expect(bytes.byteLength).toBeGreaterThan(1_000);
    const text = await extractText(bytes);
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Professional Summary");
    expect(text).toContain("Work Experience");
    expect(text).toContain("Reduced reporting time by 30%");
    expect(text).toContain("DTU");
    expect(text).toContain("English");
  });

  it("uses Swedish section headings when the document language is Swedish", async () => {
    const document = createCvDocumentFromProfile(profile, application, {
      language: "sv",
      pageSize: "letter",
      extraContext: "",
    });
    document.summary = "Frontendutvecklare med fokus på tillgänglighet.";

    const text = await extractText(await renderCvDocx(document));
    expect(text).toContain("Profil");
    expect(text).toContain("Arbetslivserfarenhet");
    expect(text).toContain("Utbildning");
    expect(text).toContain("Nuvarande");
  });

  it("uses uppercase compact headings without losing content", async () => {
    const document = createCvDocumentFromProfile(profile, application, {
      language: "en",
      pageSize: "a4",
      extraContext: "",
      template: "compact",
    });
    document.summary = "Compact summary.";

    const text = await extractText(await renderCvDocx(document));
    expect(text).toContain("PROFESSIONAL SUMMARY");
    expect(text).toContain("WORK EXPERIENCE");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Reduced reporting time by 30%");
  });
});
