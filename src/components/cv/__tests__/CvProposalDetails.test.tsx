import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CvDocument } from "@/types/cv";
import CvProposalDetails from "@/components/cv/CvProposalDetails";

const base: CvDocument = {
  schemaVersion: 2,
  language: "en",
  pageSize: "a4",
  template: "classic",
  generatedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  profileFingerprint: "fingerprint",
  applicationUpdatedAt: "2026-01-01T00:00:00.000Z",
  extraContext: "",
  contact: {
    fullName: "Jane Doe",
    email: "jane@example.com",
    phone: "",
    location: "",
    linkedinUrl: "",
    portfolioUrl: "",
    githubUrl: "",
  },
  headline: "Platform Engineer",
  summary: "Builds reliable systems.",
  skills: ["TypeScript", "Accessibility"],
  experience: [
    {
      id: "role-1",
      sourceId: "work-1",
      company: "Acme",
      location: "Remote",
      roles: [
        {
          id: "title-1",
          sourceId: "work-1",
          title: "Platform Engineer",
          startDate: "Jan 2022",
          endDate: "Present",
          current: true,
        },
      ],
      bullets: ["Reduced reporting time."],
      included: true,
    },
    {
      id: "role-2",
      company: "Hidden",
      location: "",
      roles: [
        {
          id: "title-2",
          title: "Old role",
          startDate: "2010",
          endDate: "2011",
          current: false,
        },
      ],
      bullets: [],
      included: false,
    },
  ],
  education: [
    {
      id: "edu-1",
      school: "KTH",
      degree: "MSc",
      field: "Computer Science",
      startDate: "2016",
      endDate: "2018",
      details: [],
      included: true,
    },
  ],
  projects: [
    {
      id: "project-1",
      title: "Accessible reports",
      description: "",
      period: "2024",
      bullets: [],
      included: true,
    },
  ],
  certifications: [],
  languages: [],
  otherEngagements: [],
  sectionOrder: [
    "summary",
    "skills",
    "experience",
    "education",
    "projects",
    "certifications",
    "languages",
    "other",
  ],
};

describe("CvProposalDetails", () => {
  it("shows the included roles, skills, education and projects", () => {
    const html = renderToStaticMarkup(<CvProposalDetails proposal={base} />);

    expect(html).toContain("Platform Engineer");
    expect(html).toContain("Acme");
    expect(html).toContain("TypeScript");
    expect(html).toContain("MSc");
    expect(html).toContain("Accessible reports");
    expect(html).toContain("Experience (1 employer · 1 role)");
    expect(html).not.toContain("Hidden");
  });

  it("explains empty proposals instead of showing blank sections", () => {
    const html = renderToStaticMarkup(
      <CvProposalDetails
        proposal={{
          ...base,
          skills: [],
          experience: [],
          education: [],
          projects: [],
        }}
      />,
    );

    expect(html).toContain("No experience.");
    expect(html).toContain("No skills selected.");
  });
});
