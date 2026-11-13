import { describe, expect, it } from "vitest";
import { buildFitMatrix } from "@/utils/fitMatrix";
import type { JobApplication, ProfileData } from "@/types";

const application: JobApplication = {
  id: "a",
  companyName: "Acme",
  jobTitle: "Frontend Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "",
  applicationLanguage: "",
  requirements:
    "Strong TypeScript and React experience.\nExperience with Kubernetes in production.\nComfortable with Docker and CI pipelines.",
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
  fullName: "Jane",
  email: "",
  city: "",
  country: "",
  linkedinUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [
    {
      id: "e",
      school: "DTU",
      degree: "MSc",
      programName: "Computer Science",
      major: "",
      startMonth: "September",
      startYear: "2018",
      endMonth: "June",
      endYear: "2020",
      finalGrade: "",
      thesisTitle: "",
      courses: [],
    },
  ],
  coverLetters: [],
  workExperience: [
    {
      id: "w",
      company: "Beta",
      role: "Frontend Engineer",
      startMonth: "January",
      startYear: "2021",
      isCurrent: true,
      jobDescription: "Built TypeScript and React dashboards.",
      projects: [],
    },
  ],
  otherEngagements: [],
  certifications: [],
  skills: [
    { id: "s1", name: "TypeScript" },
    { id: "s2", name: "React" },
  ],
  languages: [],
} as ProfileData;

describe("buildFitMatrix", () => {
  it("marks requirements with multiple evidence items as strong", () => {
    const matrix = buildFitMatrix(application, profile);
    const ts = matrix.rows.find((row) =>
      row.requirement.includes("TypeScript"),
    );
    expect(ts?.level).toBe("strong");
    expect(ts?.evidence.some((item) => item.includes("TypeScript"))).toBe(true);
  });

  it("marks unmatched requirements as gaps", () => {
    const matrix = buildFitMatrix(application, profile);
    const k8s = matrix.rows.find((row) =>
      row.requirement.includes("Kubernetes"),
    );
    expect(k8s?.level).toBe("gap");
    expect(k8s?.evidence).toEqual([]);
  });

  it("finds partial evidence from a job description", () => {
    const matrix = buildFitMatrix(application, profile);
    const docker = matrix.rows.find((row) =>
      row.requirement.includes("Docker"),
    );
    expect(docker?.level).toBe("gap");
    expect(matrix.rows).toHaveLength(3);
    expect(matrix.gap).toBe(2);
  });

  it("returns no rows without requirement text", () => {
    const matrix = buildFitMatrix(
      { ...application, requirements: "", jobDescription: "" },
      profile,
    );
    expect(matrix.rows).toEqual([]);
  });

  it("returns gaps when the profile is empty", () => {
    const matrix = buildFitMatrix(application, null);
    expect(matrix.rows.every((row) => row.level === "gap")).toBe(true);
  });
});
