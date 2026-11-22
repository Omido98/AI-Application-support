import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import type { ApiConfig } from "@/stores/chatStore";

vi.mock("@/utils/api", () => ({
  sendMessage: vi.fn(),
}));

import { sendMessage } from "@/utils/api";
import {
  CvGenerationError,
  generateCvDocument,
  mergeGeneratedCv,
  parseGeneratedCvJson,
} from "@/utils/cvGeneration";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { buildCvGenerationPrompt } from "@/utils/cvPrompt";
import type { Mock } from "vitest";

const sendMessageMock = sendMessage as Mock;

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Platform Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "Build TypeScript and React platforms.",
  applicationLanguage: "English",
  requirements: "TypeScript, React.",
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
  phone: "",
  city: "",
  country: "",
  linkedinUrl: "",
  portfolioUrl: "",
  githubUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [
    {
      id: "edu-1",
      school: "DTU",
      degree: "BSc",
      programName: "",
      major: "Software",
      startMonth: "August",
      startYear: "2018",
      endMonth: "June",
      endYear: "2021",
      finalGrade: "",
      courses: ["Algorithms"],
      thesisTitle: "",
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
      jobDescription: "Build accessible React components.",
      achievements: ["Reduced reporting time by 30%"],
      projects: [
        {
          id: "project-1",
          name: "Design system",
          startMonth: "January",
          startYear: "2024",
          isCurrent: true,
          achievements: ["Used by 1,800 technicians"],
        },
      ],
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

const config = {
  provider: "zen",
  baseUrl: "https://example.com/v1",
  model: "test-model",
  apiKey: "test-key",
  webSearchEnabled: false,
} as ApiConfig;

const options = {
  language: "en" as const,
  pageSize: "a4" as const,
  extraContext: "I care about accessibility.",
};

const generated = {
  headline: "Platform Engineer",
  summary: "Frontend engineer focused on accessible platforms.",
  skills: ["TypeScript", "React"],
  experience: [
    {
      sourceId: "work:work-1",
      bullets: ["Built accessible React components at scale."],
    },
  ],
  education: [{ sourceId: "education:edu-1", details: ["Algorithms"] }],
  projects: [
    {
      sourceId: "project:project-1",
      title: "Design System",
      bullets: ["Used by 1,800 technicians"],
    },
  ],
  certifications: [],
  languages: [{ sourceId: "language:l1" }],
  otherEngagements: [],
};

describe("buildCvGenerationPrompt", () => {
  it("provides source ids, language and extra context", () => {
    const prompt = buildCvGenerationPrompt(application, profile, {
      ...options,
      language: "sv",
      extraContext: "I led an accessibility guild.",
    });

    expect(prompt).toContain("work:work-1");
    expect(prompt).toContain("project:project-1");
    expect(prompt).toContain("Swedish");
    expect(prompt).toContain("I led an accessibility guild.");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain('"headline"');
  });
});

describe("parseGeneratedCvJson", () => {
  it("accepts fenced JSON and rejects prose without an object", () => {
    expect(
      parseGeneratedCvJson(`\`\`\`json\n${JSON.stringify(generated)}\n\`\`\``),
    ).toMatchObject({ headline: "Platform Engineer" });
    expect(parseGeneratedCvJson("no json here")).toBeNull();
  });
});

describe("mergeGeneratedCv", () => {
  it("keeps profile identity fields and uses generated prose", () => {
    const base = createCvDocumentFromProfile(profile, application, options);
    const document = mergeGeneratedCv(generated, base, options);

    expect(document.headline).toBe("Platform Engineer");
    expect(document.summary).toContain("accessible platforms");
    expect(document.skills).toEqual(["TypeScript", "React"]);
    expect(document.experience[0]).toMatchObject({
      sourceId: "work-1",
      company: "Fjordline",
      bullets: ["Built accessible React components at scale."],
    });
    expect(document.experience[0].roles[0]).toMatchObject({
      sourceId: "work-1",
      title: "Frontend Engineer",
      startDate: "Jul 2022",
    });
    expect(document.projects[0]).toMatchObject({
      sourceId: "project-1",
      title: "Design System",
      description: "Design system",
    });
    expect(document.languages[0].name).toBe("English");
    expect(document.extraContext).toBe("I care about accessibility.");
  });

  it("drops hallucinated source ids instead of inventing entries", () => {
    const base = createCvDocumentFromProfile(profile, application, options);
    const document = mergeGeneratedCv(
      {
        ...generated,
        experience: [{ sourceId: "work:not-real", bullets: ["Fake"] }],
      },
      base,
      options,
    );

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0].bullets).toEqual(base.experience[0].bullets);
  });
});

describe("mergeGeneratedCv experience coverage", () => {
  const multiProfile: ProfileData = {
    ...profile,
    workExperience: [
      {
        id: "work-2",
        company: "EY",
        role: "Senior Management Consultant",
        startMonth: "January",
        startYear: "2021",
        isCurrent: true,
        jobDescription: "Lead transformation work.",
        achievements: ["Grew the account"],
        projects: [],
      },
      {
        id: "work-3",
        company: "EY",
        role: "Management Consultant",
        startMonth: "January",
        startYear: "2019",
        isCurrent: false,
        endMonth: "December",
        endYear: "2020",
        jobDescription: "Delivered operating-model work.",
        achievements: ["Managed a team"],
        projects: [],
      },
      {
        id: "work-1",
        company: "Fjordline",
        role: "Frontend Engineer",
        startMonth: "July",
        startYear: "2016",
        isCurrent: false,
        endMonth: "December",
        endYear: "2018",
        jobDescription: "Built accessible interfaces.",
        achievements: ["Reduced reporting time"],
        projects: [],
      },
    ],
  };

  function base() {
    return createCvDocumentFromProfile(multiProfile, application, options);
  }

  it("keeps every employer group even when the model returns a subset", () => {
    const document = mergeGeneratedCv(
      {
        ...generated,
        experience: [
          { sourceId: "work:work-1", bullets: ["Tailored frontend bullet."] },
        ],
      },
      base(),
      options,
    );

    expect(document.experience).toHaveLength(2);
    expect(document.experience[0].sourceId).toBe("work-2");
    expect(document.experience[0].bullets).toEqual([]);
    expect(document.experience[1].sourceId).toBe("work-1");
    expect(document.experience[1].bullets).toEqual([
      "Tailored frontend bullet.",
    ]);
  });

  it("respects an explicit empty bullets array", () => {
    const document = mergeGeneratedCv(
      {
        ...generated,
        experience: [
          { sourceId: "work:work-2", bullets: [] },
          {
            sourceId: "work:work-1",
            bullets: ["Fjordline tailored bullet."],
          },
        ],
      },
      base(),
      options,
    );

    expect(document.experience[0].bullets).toEqual([]);
    expect(document.experience[1].bullets).toEqual([
      "Fjordline tailored bullet.",
    ]);
  });

  it("falls back to profile bullets when a returned group has no bullets field", () => {
    const baseDocument = base();
    const document = mergeGeneratedCv(
      {
        ...generated,
        experience: [{ sourceId: "work:work-2" }],
      },
      baseDocument,
      options,
    );

    expect(document.experience[0].bullets).toEqual(
      baseDocument.experience[0].bullets,
    );
    expect(document.experience[1].bullets).toEqual([]);
  });

  it("keeps the profile order even when the model reorders groups", () => {
    const document = mergeGeneratedCv(
      {
        ...generated,
        experience: [
          { sourceId: "work:work-1", bullets: ["Fjordline bullet."] },
          { sourceId: "work:work-2", bullets: ["EY bullet."] },
        ],
      },
      base(),
      options,
    );

    expect(document.experience.map((item) => item.sourceId)).toEqual([
      "work-2",
      "work-1",
    ]);
  });

  it("maps a role-level source id back to its employer group", () => {
    const document = mergeGeneratedCv(
      {
        ...generated,
        experience: [
          { sourceId: "work:work-3", bullets: ["Older EY role bullet."] },
        ],
      },
      base(),
      options,
    );

    expect(document.experience[0].sourceId).toBe("work-2");
    expect(document.experience[0].bullets).toEqual(["Older EY role bullet."]);
  });
});

describe("generateCvDocument", () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
  });

  it("fails fast without an API key or job description", async () => {
    await expect(
      generateCvDocument({
        application,
        profile,
        config: { ...config, apiKey: "" },
        options,
      }),
    ).rejects.toBeInstanceOf(CvGenerationError);

    await expect(
      generateCvDocument({
        application: { ...application, jobDescription: "" },
        profile,
        config,
        options,
      }),
    ).rejects.toBeInstanceOf(CvGenerationError);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("returns a merged document from valid model JSON", async () => {
    sendMessageMock.mockResolvedValue({
      content: JSON.stringify(generated),
      error: null,
      usage: { inputTokens: 1_000, outputTokens: 500 },
    });

    const document = await generateCvDocument({
      application,
      profile,
      config,
      options,
    });

    expect(document.summary).toContain("accessible platforms");
    expect(document.experience[0].company).toBe("Fjordline");
    expect(document.lastUsage).toMatchObject({
      kind: "generate",
      inputTokens: 1_000,
      outputTokens: 500,
      model: config.model,
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a stopped response instead of using its partial JSON", async () => {
    sendMessageMock.mockResolvedValue({
      content: JSON.stringify(generated),
      stopped: true,
    });

    await expect(
      generateCvDocument({ application, profile, config, options }),
    ).rejects.toMatchObject({ name: "AbortError" });
    // No repair round after the user cancelled.
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("does not issue a repair request after the caller aborts", async () => {
    const controller = new AbortController();
    sendMessageMock.mockImplementation(async () => {
      controller.abort();
      return { content: "not json", stopped: true };
    });

    await expect(
      generateCvDocument({
        application,
        profile,
        config,
        options,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});
