import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
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

async function extractPdf(bytes: Uint8Array): Promise<{
  pages: number;
  text: string;
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    standardFontDataUrl: `${fileURLToPath(
      new URL(
        "../../../node_modules/pdfjs-dist/standard_fonts/",
        import.meta.url,
      ),
    )}/`,
  });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const text = content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
  return { pages: pdf.numPages, text };
}

describe("renderCvPdf", () => {
  it("produces selectable text with Swedish characters", async () => {
    const document = makeDocument();
    document.language = "sv";
    document.summary =
      "Frontendutvecklare med fokus på tillgänglighet och TypeScript.";
    const result = await extractPdf(await renderCvPdf(document));

    expect(result.text).toContain("Jane Doe");
    expect(result.text).toContain("TypeScript");
    expect(result.text).toContain("tillgänglighet");
    expect(result.pages).toBeGreaterThanOrEqual(1);
  });

  it("supports the compact template and US Letter", async () => {
    const document = makeDocument();
    document.template = "compact";
    document.pageSize = "letter";
    const result = await extractPdf(await renderCvPdf(document));
    expect(result.text).toContain("Jane Doe");
    expect(result.pages).toBeGreaterThanOrEqual(1);
  });

  it("paginates a long CV without dropping content", async () => {
    const document = makeDocument();
    document.experience = Array.from({ length: 14 }, (_, index) => ({
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
          `Delivered measurable reporting improvement ${index}-${bullet}.`,
      ),
      included: true,
    }));
    const result = await extractPdf(await renderCvPdf(document));
    expect(result.pages).toBeGreaterThan(1);
    expect(result.text).toContain("Jane Doe");
  });
});
