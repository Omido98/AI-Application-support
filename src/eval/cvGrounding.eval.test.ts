import { describe, expect, it } from "vitest";
import type { ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import { analyzeCvGrounding } from "@/utils/cvGrounding";

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
      major: "",
      startMonth: "Aug",
      startYear: "2018",
      endMonth: "Jun",
      endYear: "2021",
      finalGrade: "3.8",
      courses: ["Databases"],
      thesisTitle: "Accessible systems",
    },
  ],
  coverLetters: [],
  workExperience: [],
  otherEngagements: [],
  certifications: [],
  skills: [{ id: "skill-1", name: "TypeScript" }],
  languages: [],
};

function makeDocument(): CvDocument {
  return {
    schemaVersion: 2,
    language: "en",
    pageSize: "a4",
    generatedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    profileFingerprint: "fingerprint",
    applicationUpdatedAt: "2026-01-01T00:00:00.000Z",
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
    summary:
      "Engineered a quantum teleportation platform for interplanetary logistics.",
    skills: ["TypeScript", "Kubernetes"],
    experience: [
      {
        id: "cv-work-1",
        company: "Fjordline",
        location: "",
        roles: [
          {
            id: "cv-role-1",
            title: "Frontend Engineer",
            startDate: "Jan 2022",
            endDate: "",
            current: true,
          },
        ],
        bullets: ["Cut delivery costs by 42%."],
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
        startDate: "2018",
        endDate: "2021",
        details: ["Completed a prestigious fellowship"],
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
  };
}

describe("CV grounding offline eval", () => {
  it("detects all seeded grounding failure categories", () => {
    const report = analyzeCvGrounding(makeDocument(), profile);
    const expected = ["skill", "education", "claim", "number"] as const;
    const detected = new Set(
      report.warnings.map((warning) => warning.category),
    );
    const score =
      expected.filter((category) => detected.has(category)).length /
      expected.length;

    expect(score).toBe(1);
    expect(report.counts.skill).toBe(1);
    expect(report.counts.number).toBe(1);
  });

  it("does not flag a document copied from grounded profile facts", () => {
    const document = makeDocument();
    document.skills = ["TypeScript"];
    document.summary =
      "Frontend engineer with TypeScript and database experience.";
    document.experience[0].bullets = ["Built TypeScript frontend components."];
    document.education[0].details = ["Databases"];

    expect(analyzeCvGrounding(document, profile).warnings).toEqual([]);
  });
});
