import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import { analyzeCvGrounding } from "@/utils/cvGrounding";

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "Build accessible reporting tools.",
  applicationLanguage: "English",
  requirements: "TypeScript\nReact\nAccessibility",
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
  education: [
    {
      id: "edu-1",
      school: "University",
      degree: "BSc",
      programName: "Computer Science",
      major: "Software",
      startMonth: "Aug",
      startYear: "2018",
      endMonth: "Jun",
      endYear: "2021",
      finalGrade: "3.8",
      courses: ["Databases", "Algorithms"],
      thesisTitle: "Accessible systems",
    },
  ],
  coverLetters: [],
  workExperience: [
    {
      id: "work-1",
      company: "Fjordline",
      role: "Frontend Engineer",
      startMonth: "Jan",
      startYear: "2022",
      isCurrent: true,
      jobDescription:
        "Built accessible React components and reporting tools. Improved reporting performance.",
      achievements: ["Improved reporting performance."],
      projects: [],
    },
  ],
  otherEngagements: [],
  certifications: [],
  skills: [
    { id: "skill-1", name: "TypeScript" },
    { id: "skill-2", name: "React" },
  ],
  languages: [],
};

function makeDocument(overrides: Partial<CvDocument> = {}): CvDocument {
  return {
    schemaVersion: 2,
    language: "en",
    pageSize: "a4",
    generatedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    profileFingerprint: "fingerprint",
    applicationUpdatedAt: application.updatedAt,
    extraContext: "",
    contact: {
      fullName: profile.fullName,
      email: profile.email,
      phone: "",
      location: "Stockholm",
      linkedinUrl: "",
      portfolioUrl: "",
      githubUrl: "",
    },
    headline: "Frontend Engineer",
    summary: "",
    skills: ["TypeScript", "React"],
    experience: [
      {
        id: "cv-work-1",
        sourceId: "work-1",
        company: "Fjordline",
        location: "",
        roles: [
          {
            id: "cv-role-1",
            sourceId: "work-1",
            title: "Frontend Engineer",
            startDate: "Jan 2022",
            endDate: "",
            current: true,
          },
        ],
        bullets: [
          "Built accessible React components and reporting tools.",
          "Improved reporting performance.",
        ],
        included: true,
      },
    ],
    education: [
      {
        id: "cv-edu-1",
        sourceId: "edu-1",
        school: "University",
        degree: "BSc",
        field: "Computer Science",
        startDate: "Aug 2018",
        endDate: "Jun 2021",
        details: ["Databases"],
        included: true,
      },
    ],
    projects: [],
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
    ...overrides,
  };
}

describe("analyzeCvGrounding", () => {
  it("passes a CV that is grounded in the profile", () => {
    const report = analyzeCvGrounding(makeDocument(), profile);

    expect(report.warnings).toEqual([]);
    expect(report.counts).toEqual({
      skill: 0,
      education: 0,
      claim: 0,
      number: 0,
    });
  });

  it("flags unsupported skills but accepts extra-context skills", () => {
    const report = analyzeCvGrounding(
      makeDocument({ skills: ["TypeScript", "Kubernetes", "Figma"] }),
      profile,
    );
    expect(report.counts.skill).toBe(2);
    expect(report.warnings.map((warning) => warning.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Kubernetes"),
        expect.stringContaining("Figma"),
      ]),
    );
  });

  it("flags unsupported education details and unverified numbers", () => {
    const report = analyzeCvGrounding(
      makeDocument({
        education: [
          {
            ...makeDocument().education[0],
            details: [
              "Completed coursework in Databases",
              "Awarded a prestigious scholarship",
            ],
          },
        ],
        experience: [
          {
            ...makeDocument().experience[0],
            bullets: ["Reduced processing time by 99%."],
          },
        ],
      }),
      profile,
    );

    expect(report.counts.education).toBe(1);
    expect(report.counts.number).toBe(1);
    expect(
      report.warnings.some((warning) =>
        warning.message.includes("scholarship"),
      ),
    ).toBe(true);
    expect(
      report.warnings.some((warning) => warning.message.includes("99%")),
    ).toBe(true);
  });

  it("flags prose with little overlap with the profile", () => {
    const report = analyzeCvGrounding(
      makeDocument({
        summary:
          "Delivered a quantum computing platform for orbital satellites and autonomous drones.",
      }),
      profile,
    );

    expect(report.counts.claim).toBeGreaterThan(0);
    expect(
      report.warnings.some(
        (warning) =>
          warning.category === "claim" &&
          warning.message.includes("quantum computing"),
      ),
    ).toBe(true);
  });

  it("supports a skill named only in extra context", () => {
    const report = analyzeCvGrounding(
      makeDocument({
        skills: ["TypeScript", "Figma"],
        extraContext: "I use Figma for design handoff.",
      }),
      profile,
    );

    expect(report.counts.skill).toBe(0);
  });

  it("does not treat a shorter skill as a match inside a longer one", () => {
    const report = analyzeCvGrounding(
      makeDocument({ skills: ["JavaScript"] }),
      {
        ...profile,
        skills: [{ id: "skill-java", name: "Java" }],
      },
    );

    expect(report.counts.skill).toBe(1);
    expect(report.warnings[0].message).toContain("JavaScript");
  });
});
