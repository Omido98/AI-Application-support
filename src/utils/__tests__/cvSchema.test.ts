import { describe, expect, it } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import {
  createCvDocumentFromProfile,
  cvDateRange,
  formatCvDate,
  hasCvContent,
  normalizeCvDocument,
  profileFingerprint,
} from "@/utils/cvSchema";

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Platform Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "Build reliable platforms with TypeScript and React.",
  applicationLanguage: "English",
  requirements: "TypeScript, React, accessibility.",
  companyResearch: "",
  notes: "",
  location: "Copenhagen",
  workMode: "hybrid",
  salary: "",
  source: "Referral",
  priority: "high",
  tags: [],
  appliedAt: "2026-03-01",
  deadline: "",
  followUpAt: "",
  contactName: "",
  contactEmail: "",
  statusHistory: [],
  createdAt: "2026-03-01T09:00:00.000Z",
  updatedAt: "2026-03-02T09:00:00.000Z",
};

const profile: ProfileData = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "+45 12 34 56 78",
  city: "Copenhagen",
  country: "Denmark",
  linkedinUrl: "https://linkedin.com/in/jane",
  portfolioUrl: "https://jane.example",
  githubUrl: "https://github.com/jane",
  coverLetterSummary: "",
  interests: [],
  education: [
    {
      id: "edu-1",
      school: "DTU",
      degree: "BSc",
      programName: "Software Technology",
      major: "Computer Science",
      startMonth: "August",
      startYear: "2018",
      endMonth: "June",
      endYear: "2021",
      finalGrade: "10/12",
      courses: ["Algorithms", "Accessibility"],
      thesisTitle: "Accessible dashboards",
    },
  ],
  coverLetters: [],
  workExperience: [
    {
      id: "work-1",
      company: "Fjordline",
      role: "Frontend Engineer",
      startMonth: "July",
      startYear: "2022",
      isCurrent: true,
      jobDescription:
        "Own the field reporting UI.\nLead accessibility reviews.",
      achievements: ["Reduced reporting time by 30%", "Mentored two engineers"],
      projects: [
        {
          id: "project-1",
          name: "Field reporting redesign",
          startMonth: "January",
          startYear: "2024",
          isCurrent: false,
          endMonth: "June",
          endYear: "2025",
          achievements: ["Shipped to 1,800 technicians"],
        },
      ],
    },
  ],
  otherEngagements: [
    {
      id: "other-1",
      organization: "Coding Club",
      role: "Mentor",
      startMonth: "September",
      startYear: "2021",
      isCurrent: true,
      description: "Run weekly workshops.",
      achievements: ["Mentored 14 students"],
    },
  ],
  certifications: [
    {
      id: "cert-1",
      name: "AWS Cloud Practitioner",
      expiryMonth: "June",
      expiryYear: "2026",
    },
  ],
  skills: [
    { id: "skill-1", name: "TypeScript" },
    { id: "skill-2", name: "React" },
    { id: "skill-3", name: "Accessibility" },
  ],
  languages: [
    { id: "lang-1", name: "English", fluency: "Fluent" },
    { id: "lang-2", name: "Swedish", fluency: "Intermediate" },
  ],
};

function makeDocument() {
  return createCvDocumentFromProfile(profile, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "I care about accessible systems.",
    now: new Date("2026-03-03T10:00:00.000Z"),
  });
}

describe("createCvDocumentFromProfile", () => {
  it("maps contact, achievements, dates and references without inventing", () => {
    const document = makeDocument();

    expect(document.contact).toEqual({
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "+45 12 34 56 78",
      location: "Copenhagen, Denmark",
      linkedinUrl: "https://linkedin.com/in/jane",
      portfolioUrl: "https://jane.example",
      githubUrl: "https://github.com/jane",
    });
    expect(document.schemaVersion).toBe(2);
    expect(document.experience).toHaveLength(1);
    expect(document.experience[0]).toMatchObject({
      sourceId: "work-1",
      company: "Fjordline",
      included: true,
    });
    expect(document.experience[0].roles).toEqual([
      expect.objectContaining({
        sourceId: "work-1",
        title: "Frontend Engineer",
        startDate: "Jul 2022",
        endDate: "Present",
        current: true,
      }),
    ]);
    expect(document.experience[0].bullets).toEqual([
      "Reduced reporting time by 30%",
      "Mentored two engineers",
      "Own the field reporting UI.",
      "Lead accessibility reviews.",
    ]);
    expect(document.education[0].details).toEqual([
      "Thesis: Accessible dashboards",
      "Grade: 10/12",
      "Algorithms",
      "Accessibility",
    ]);
    expect(document.projects[0]).toMatchObject({
      sourceId: "project-1",
      description: "Field reporting redesign",
      bullets: ["Shipped to 1,800 technicians"],
    });
    expect(document.certifications[0].date).toBe("Jun 2026");
    expect(document.languages[1]).toMatchObject({
      name: "Swedish",
      level: "Intermediate",
    });
    expect(document.sectionOrder).toHaveLength(8);
    expect(document.extraContext).toBe("I care about accessible systems.");
    expect(hasCvContent(document)).toBe(true);
  });

  it("groups consecutive roles at the same employer into one experience", () => {
    const grouped = createCvDocumentFromProfile(
      {
        ...profile,
        workExperience: [
          {
            id: "work-2",
            company: "EY",
            role: "Senior Management Consultant",
            startMonth: "January",
            startYear: "2021",
            isCurrent: true,
            jobDescription: "Lead the transformation programme.",
            achievements: ["Grew the account"],
            projects: [],
          },
          {
            id: "work-1",
            company: "EY",
            role: "Management Consultant",
            startMonth: "January",
            startYear: "2019",
            isCurrent: false,
            endMonth: "December",
            endYear: "2020",
            jobDescription: "Delivered operating-model work.",
            achievements: [],
            projects: [],
          },
        ],
      },
      application,
      { language: "en", pageSize: "a4" },
    );

    expect(grouped.experience).toHaveLength(1);
    expect(grouped.experience[0].sourceId).toBe("work-2");
    expect(grouped.experience[0].roles.map((role) => role.title)).toEqual([
      "Senior Management Consultant",
      "Management Consultant",
    ]);
    expect(grouped.experience[0].bullets[0]).toBe("Grew the account");
  });

  it("treats title-and-date employer groups as CV content", () => {
    const document = makeDocument();
    document.summary = "";
    document.skills = [];
    document.education = [];
    document.projects = [];
    document.certifications = [];
    document.languages = [];
    document.otherEngagements = [];
    document.experience[0].bullets = [];

    expect(hasCvContent(document)).toBe(true);
  });

  it("localizes dates for Swedish and handles missing end dates", () => {
    expect(formatCvDate("July", "2022", "sv")).toBe("jul 2022");
    expect(formatCvDate("", "2022", "sv")).toBe("2022");
    expect(cvDateRange("July", "2022", "June", "2024", false, "sv")).toBe(
      "jul 2022 – jun 2024",
    );
    expect(cvDateRange("July", "2022", "", "", true, "sv")).toBe(
      "jul 2022 – Nuvarande",
    );
  });
});

describe("normalizeCvDocument", () => {
  it("round-trips a document and fills a complete section order", () => {
    const document = makeDocument();
    const normalized = normalizeCvDocument({
      ...document,
      sectionOrder: ["experience"],
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.sectionOrder[0]).toBe("experience");
    expect(new Set(normalized?.sectionOrder)).toEqual(
      new Set(document.sectionOrder),
    );
    expect(normalized?.experience).toHaveLength(1);
    expect(normalized?.template).toBe("classic");
  });

  it("rejects unknown schemas and drops malformed entries", () => {
    expect(normalizeCvDocument({ schemaVersion: 3 })).toBeNull();
    expect(normalizeCvDocument(null)).toBeNull();

    const normalized = normalizeCvDocument({
      schemaVersion: 1,
      language: "sv",
      pageSize: "letter",
      experience: ["bad", { company: "Acme" }],
      education: null,
    });
    expect(normalized?.schemaVersion).toBe(2);
    expect(normalized?.language).toBe("sv");
    expect(normalized?.pageSize).toBe("letter");
    expect(normalized?.experience).toHaveLength(1);
    expect(normalized?.experience[0].roles).toEqual([]);
    expect(normalized?.education).toEqual([]);
    expect(normalized?.template).toBe("classic");
  });

  it("migrates adjacent v1 roles at the same employer into one group", () => {
    const normalized = normalizeCvDocument({
      schemaVersion: 1,
      language: "en",
      pageSize: "a4",
      experience: [
        {
          id: "cv-1",
          sourceId: "work-1",
          company: "EY",
          role: "Senior Management Consultant",
          startDate: "Jan 2021",
          endDate: "Present",
          current: true,
          bullets: ["Led delivery."],
          included: true,
        },
        {
          id: "cv-2",
          sourceId: "work-2",
          company: "EY",
          role: "Management Consultant",
          startDate: "Jan 2019",
          endDate: "Dec 2020",
          current: false,
          bullets: ["Delivered analysis."],
          included: true,
        },
      ],
    });

    expect(normalized?.schemaVersion).toBe(2);
    expect(normalized?.experience).toHaveLength(1);
    expect(normalized?.experience[0].roles.map((role) => role.title)).toEqual([
      "Senior Management Consultant",
      "Management Consultant",
    ]);
    expect(normalized?.experience[0].bullets).toEqual([
      "Led delivery.",
      "Delivered analysis.",
    ]);
  });

  it("preserves the compact template", () => {
    const document = makeDocument();
    const normalized = normalizeCvDocument({
      ...document,
      template: "compact",
    });
    expect(normalized?.template).toBe("compact");
  });

  it("changes the profile fingerprint when the profile changes", () => {
    const first = profileFingerprint(profile);
    const second = profileFingerprint({
      ...profile,
      skills: [...profile.skills, { id: "skill-4", name: "SQL" }],
    });
    expect(first).not.toBe(second);
  });
});
