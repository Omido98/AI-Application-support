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
  items: { str: string; x: number; y: number }[];
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
  const items = content.items
    .map((item) => ({
      str: "str" in item ? item.str : "",
      x: "transform" in item ? item.transform[4] : 0,
      y: "transform" in item ? item.transform[5] : 0,
    }))
    .filter((item) => item.str.trim().length > 0);
  const text = items.map((item) => item.str).join(" ");
  return { pages: pdf.numPages, text, items };
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

  it("leaves enough vertical space for the large name", async () => {
    const document = makeDocument();
    document.headline = "Platform Engineer";
    const result = await extractPdf(await renderCvPdf(document));
    const name = result.items.find((item) => item.str.includes("Jane Doe"));
    const headline = result.items.find((item) =>
      item.str.includes("Platform Engineer"),
    );

    expect(name).toBeDefined();
    expect(headline).toBeDefined();
    expect(name!.y - headline!.y).toBeGreaterThanOrEqual(20);
  });

  it("supports the compact template and US Letter", async () => {
    const document = makeDocument();
    document.template = "compact";
    document.pageSize = "letter";
    const result = await extractPdf(await renderCvPdf(document));
    expect(result.text).toContain("Jane Doe");
    expect(result.pages).toBeGreaterThanOrEqual(1);
  });

  it("right-aligns the dates of a grouped employer and keeps every role", async () => {
    const document = makeDocument();
    document.experience = [
      {
        id: "group-1",
        company: "EY",
        location: "",
        roles: [
          {
            id: "role-2",
            title: "Senior Management Consultant",
            startDate: "Jan 2021",
            endDate: "Present",
            current: true,
          },
          {
            id: "role-1",
            title: "Management Consultant",
            startDate: "Jan 2019",
            endDate: "Dec 2020",
            current: false,
          },
        ],
        bullets: ["Led the transformation programme."],
        included: true,
      },
    ];

    const result = await extractPdf(await renderCvPdf(document));
    expect(result.text).toContain("EY");
    expect(result.text).toContain("Senior Management Consultant");
    expect(result.text).toContain("Management Consultant");
    expect(result.text).toContain("Led the transformation programme.");

    const range = result.items.find((item) =>
      item.str.includes("Jan 2019 – Present"),
    );
    expect(range).toBeDefined();
    expect(range!.x).toBeGreaterThan(400);
  });

  it("paginates a long CV without dropping content", async () => {
    const document = makeDocument();
    document.experience = Array.from({ length: 14 }, (_, index) => ({
      id: `role-${index}`,
      company: `Company ${index}`,
      location: "Remote",
      roles: [
        {
          id: `title-${index}`,
          title: `Engineer ${index}`,
          startDate: "Jan 2020",
          endDate: "Dec 2022",
          current: false,
        },
      ],
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
