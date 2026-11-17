import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { JobApplication, ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";

vi.mock("@/utils/storage", () => ({
  loadJson: vi.fn(),
  saveJson: vi.fn(),
  deleteFile: vi.fn(),
  reportDataIssue: vi.fn(),
}));

vi.mock("@/utils/cvGeneration", async () => {
  const actual = await vi.importActual<typeof import("@/utils/cvGeneration")>(
    "@/utils/cvGeneration",
  );
  return {
    ...actual,
    generateCvDocument: vi.fn(),
  };
});

import {
  generateCvDocument,
  type CvGenerationOptions,
} from "@/utils/cvGeneration";
import { loadJson, saveJson } from "@/utils/storage";
import { useCvStore } from "@/stores/cvStore";
import type { ApiConfig } from "@/stores/chatStore";

const loadJsonMock = loadJson as Mock;
const saveJsonMock = saveJson as Mock;
const generateMock = generateCvDocument as Mock;

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
  city: "",
  country: "",
  linkedinUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [],
  otherEngagements: [],
  certifications: [],
  skills: [],
  languages: [],
};

const config = {
  provider: "zen",
  baseUrl: "https://example.com/v1",
  model: "test",
  apiKey: "key",
  webSearchEnabled: false,
} as ApiConfig;

const options: CvGenerationOptions = {
  language: "en",
  pageSize: "a4",
  extraContext: "",
};

function makeDocument(summary: string) {
  const document = createCvDocumentFromProfile(profile, application, options);
  document.summary = summary;
  return document;
}

beforeEach(() => {
  useCvStore.getState().resetCache();
  loadJsonMock.mockReset();
  saveJsonMock.mockReset();
  generateMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
});

describe("CV generation review flow", () => {
  it("returns a proposal without replacing or saving the current CV", async () => {
    const current = makeDocument("Current summary");
    loadJsonMock.mockImplementation(async (name: string) =>
      name.startsWith("cv_history_") ? null : current,
    );
    await useCvStore.getState().loadCv(application.id);

    const generated = makeDocument("Generated summary");
    generated.aiSections = ["summary"];
    generateMock.mockResolvedValue(generated);

    const result = await useCvStore.getState().generateCv({
      application,
      profile,
      config,
      options,
    });

    expect(result).toBe(generated);
    expect(useCvStore.getState().documents[application.id].summary).toBe(
      "Current summary",
    );
    expect(useCvStore.getState().history[application.id]).toEqual([]);
    expect(saveJsonMock).not.toHaveBeenCalled();
  });

  it("snapshots the current CV and saves only when the proposal is accepted", async () => {
    const current = makeDocument("Current summary");
    loadJsonMock.mockImplementation(async (name: string) =>
      name.startsWith("cv_history_") ? null : current,
    );
    await useCvStore.getState().loadCv(application.id);

    const generated = makeDocument("Generated summary");
    generated.aiSections = ["summary"];
    const before = await useCvStore
      .getState()
      .applyGeneratedCv(application.id, generated);

    expect(before?.summary).toBe("Current summary");
    expect(useCvStore.getState().documents[application.id].summary).toBe(
      "Generated summary",
    );
    expect(saveJsonMock).toHaveBeenCalledWith(
      "cv_history_app-1.json",
      expect.objectContaining({
        snapshots: expect.arrayContaining([
          expect.objectContaining({ label: "Before AI regeneration" }),
        ]),
      }),
    );
    expect(saveJsonMock).toHaveBeenCalledWith(
      "cv_app-1.json",
      expect.objectContaining({ summary: "Generated summary" }),
    );
  });
});
