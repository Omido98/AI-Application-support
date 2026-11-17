import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import type { ApiConfig } from "@/stores/chatStore";
import type { CvAiUsage } from "@/types/cv";

vi.mock("@/utils/api", () => ({
  sendMessage: vi.fn(),
}));

import { sendMessage } from "@/utils/api";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";
import { buildCvRewritePrompt } from "@/utils/cvRewritePrompt";
import {
  CvRewriteError,
  applyRewriteResult,
  buildRewriteProposal,
  parseCvRewriteJson,
  rewriteCvSection,
  sectionText,
} from "@/utils/cvRewrite";

const sendMessageMock = sendMessage as Mock;

const application: JobApplication = {
  id: "app-1",
  companyName: "Acme",
  jobTitle: "Platform Engineer",
  applicationUrl: "",
  status: "applied",
  jobDescription: "Build TypeScript and React platforms.",
  applicationLanguage: "English",
  requirements: "TypeScript, accessibility.",
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
  education: [],
  coverLetters: [],
  workExperience: [
    {
      id: "work-1",
      company: "Fjordline",
      role: "Frontend Engineer",
      startMonth: "July",
      startYear: "2022",
      isCurrent: true,
      jobDescription: "Build accessible React interfaces.",
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
  certifications: [],
  skills: [
    { id: "s1", name: "TypeScript" },
    { id: "s2", name: "React" },
  ],
  languages: [
    { id: "l1", name: "English", fluency: "Fluent" },
    { id: "l2", name: "Swedish", fluency: "Intermediate" },
  ],
};

const config = {
  provider: "zen",
  baseUrl: "https://example.com/v1",
  model: "test",
  apiKey: "test-key",
  webSearchEnabled: false,
} as ApiConfig;

function makeDocument() {
  const document = createCvDocumentFromProfile(profile, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
  document.headline = "Frontend Engineer";
  document.summary = "Frontend engineer focused on accessible interfaces.";
  return document;
}

beforeEach(() => {
  sendMessageMock.mockReset();
});

describe("proposal helpers", () => {
  it("builds current/proposed text and grounded warnings without mutating", () => {
    const document = makeDocument();
    const result = {
      kind: "summary" as const,
      headline: "Engineer",
      summary: "Improved conversion by 47%.",
    };
    const original = sectionText(document, { kind: "summary" });
    const proposal = buildRewriteProposal(
      document,
      { kind: "summary" },
      "summary",
      result,
      profile,
    );

    expect(proposal.currentText).toBe(original);
    expect(proposal.proposedText).toContain("47%");
    expect(proposal.warnings[0]).toContain("47%");
    expect(sectionText(document, { kind: "summary" })).toBe(original);
  });

  it("applies experience bullets without changing the role identity", () => {
    const document = makeDocument();
    const item = document.experience[0];
    const applied = applyRewriteResult(
      document,
      { kind: "experience", id: item.id },
      {
        kind: "experience",
        bullets: ["New bullet."],
      },
    );

    expect(applied.experience[0].bullets).toEqual(["New bullet."]);
    expect(applied.experience[0].company).toBe(item.company);
    expect(applied.experience[0].startDate).toBe(item.startDate);
    expect(applied.experience[0].id).toBe(item.id);
  });
});

describe("parseCvRewriteJson", () => {
  it("accepts fenced JSON and rejects prose", () => {
    expect(parseCvRewriteJson('```json\n{"summary":"Hello"}\n```')).toEqual({
      summary: "Hello",
    });
    expect(parseCvRewriteJson("no object")).toBeNull();
  });
});

describe("buildCvRewritePrompt", () => {
  it("includes the current section, language, profile facts and instruction", () => {
    const document = makeDocument();
    const prompt = buildCvRewritePrompt(
      application,
      profile,
      document,
      { kind: "experience", id: document.experience[0].id },
      "Make it more concise.",
    );

    expect(prompt).toContain("Current section to rewrite");
    expect(prompt).toContain("Frontend Engineer");
    expect(prompt).toContain("Reduced reporting time by 30%");
    expect(prompt).toContain("Make it more concise.");
    expect(prompt).toContain('"bullets": []');
  });
});

describe("rewriteCvSection", () => {
  it("returns a summary rewrite", async () => {
    sendMessageMock.mockResolvedValue({
      content: JSON.stringify({
        headline: "Accessibility-focused engineer",
        summary: "Short summary.",
      }),
      error: null,
    });

    const result = await rewriteCvSection({
      application,
      profile,
      document: makeDocument(),
      target: { kind: "summary" },
      instruction: "",
      config,
    });

    expect(result).toEqual({
      kind: "summary",
      headline: "Accessibility-focused engineer",
      summary: "Short summary.",
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("rewrites experience bullets while leaving the role identity to the app", async () => {
    const document = makeDocument();
    const experience = document.experience[0];
    let capturedUsage: CvAiUsage | undefined;
    sendMessageMock.mockResolvedValue({
      content: JSON.stringify({
        company: "Fake Corp",
        bullets: [
          "Built accessible React components.",
          "Improved reporting flow.",
        ],
      }),
      error: null,
      usage: { inputTokens: 120, outputTokens: 40 },
    });

    const result = await rewriteCvSection({
      application,
      profile,
      document,
      target: { kind: "experience", id: experience.id },
      instruction: "Focus on impact.",
      config,
      onUsage: (usage) => {
        capturedUsage = usage;
      },
    });

    expect(result).toEqual({
      kind: "experience",
      bullets: [
        "Built accessible React components.",
        "Improved reporting flow.",
      ],
    });
    expect(capturedUsage).toMatchObject({
      kind: "rewrite",
      inputTokens: 120,
      outputTokens: 40,
    });
  });

  it("retries once when the first response is not JSON", async () => {
    const document = makeDocument();
    sendMessageMock
      .mockResolvedValueOnce({ content: "not json", error: null })
      .mockResolvedValueOnce({
        content: JSON.stringify({ bullets: ["Rewritten bullet."] }),
        error: null,
      });

    const result = await rewriteCvSection({
      application,
      profile,
      document,
      target: { kind: "experience", id: document.experience[0].id },
      instruction: "",
      config,
    });

    expect(result).toEqual({
      kind: "experience",
      bullets: ["Rewritten bullet."],
    });
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
  });

  it("rejects missing API keys and empty rewrites", async () => {
    await expect(
      rewriteCvSection({
        application,
        profile,
        document: makeDocument(),
        target: { kind: "summary" },
        instruction: "",
        config: { ...config, apiKey: "" },
      }),
    ).rejects.toBeInstanceOf(CvRewriteError);

    sendMessageMock.mockResolvedValue({
      content: JSON.stringify({ bullets: [] }),
      error: null,
    });
    const document = makeDocument();
    await expect(
      rewriteCvSection({
        application,
        profile,
        document,
        target: {
          kind: "experience",
          id: document.experience[0].id,
        },
        instruction: "",
        config,
      }),
    ).rejects.toBeInstanceOf(CvRewriteError);
  });
});
