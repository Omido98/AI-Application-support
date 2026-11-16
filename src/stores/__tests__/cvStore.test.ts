import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { JobApplication, ProfileData } from "@/types";

vi.mock("@/utils/storage", () => ({
  loadJson: vi.fn(),
  saveJson: vi.fn(),
  deleteFile: vi.fn(),
  reportDataIssue: vi.fn(),
}));

import { deleteFile, loadJson, saveJson } from "@/utils/storage";
import { flushCvSaves, useCvStore } from "@/stores/cvStore";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";

const loadJsonMock = loadJson as Mock;
const saveJsonMock = saveJson as Mock;
const deleteFileMock = deleteFile as Mock;

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
  fullName: "Jane",
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

function makeDocument() {
  return createCvDocumentFromProfile(profile, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
}

beforeEach(() => {
  useCvStore.getState().resetCache();
  loadJsonMock.mockReset();
  saveJsonMock.mockReset();
  deleteFileMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
  deleteFileMock.mockResolvedValue(true);
});

describe("cvStore", () => {
  it("loads and normalizes a saved CV", async () => {
    const document = makeDocument();
    loadJsonMock.mockResolvedValue(document);

    await useCvStore.getState().loadCv("app-1");

    expect(loadJsonMock).toHaveBeenCalledWith("cv_app-1.json");
    expect(useCvStore.getState().loaded["app-1"]).toBe(true);
    expect(useCvStore.getState().documents["app-1"].contact.fullName).toBe(
      "Jane",
    );
  });

  it("writes the current document and flushes pending edits", async () => {
    const document = makeDocument();
    loadJsonMock.mockResolvedValue(document);
    await useCvStore.getState().loadCv("app-1");

    useCvStore.getState().updateCv("app-1", (current) => ({
      ...current,
      headline: "Engineer",
    }));
    await flushCvSaves();

    expect(saveJsonMock).toHaveBeenCalledWith(
      "cv_app-1.json",
      expect.objectContaining({ headline: "Engineer" }),
    );
  });

  it("deletes the CV file and cache entry", async () => {
    const document = makeDocument();
    loadJsonMock.mockResolvedValue(document);
    await useCvStore.getState().loadCv("app-1");

    await useCvStore.getState().deleteCv("app-1");

    expect(deleteFileMock).toHaveBeenCalledWith("cv_app-1.json");
    expect(useCvStore.getState().documents["app-1"]).toBeUndefined();
    expect(useCvStore.getState().loaded["app-1"]).toBe(false);
  });

  it("reports malformed saved CVs without replacing data", async () => {
    loadJsonMock.mockResolvedValue({ schemaVersion: 2 });

    await useCvStore.getState().loadCv("app-1");

    expect(useCvStore.getState().documents["app-1"]).toBeUndefined();
    expect(useCvStore.getState().errors["app-1"]).toContain("unexpected");
  });
});
