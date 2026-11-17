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
    loadJsonMock.mockImplementation(async (name: string) =>
      name.startsWith("cv_history_") ? null : document,
    );

    await useCvStore.getState().loadCv("app-1");

    expect(loadJsonMock).toHaveBeenCalledWith("cv_app-1.json");
    expect(loadJsonMock).toHaveBeenCalledWith("cv_history_app-1.json");
    expect(useCvStore.getState().loaded["app-1"]).toBe(true);
    expect(useCvStore.getState().documents["app-1"].contact.fullName).toBe(
      "Jane",
    );
  });

  it("writes the current document and flushes pending edits", async () => {
    const document = makeDocument();
    loadJsonMock.mockImplementation(async (name: string) =>
      name.startsWith("cv_history_") ? null : document,
    );
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

  it("saves a bounded snapshot history and restores a version", async () => {
    const document = makeDocument();
    const older = { ...makeDocument(), summary: "Older version" };
    const history = {
      schemaVersion: 1,
      snapshots: [
        {
          id: "old-1",
          savedAt: "2026-01-01T00:00:00.000Z",
          label: "Old",
          document: older,
        },
      ],
    };
    loadJsonMock.mockImplementation(async (name: string) =>
      name === "cv_app-1.json"
        ? document
        : name === "cv_history_app-1.json"
          ? history
          : null,
    );
    await useCvStore.getState().loadCv("app-1");

    await useCvStore.getState().snapshotCurrent("app-1", "Before rewrite");
    expect(saveJsonMock).toHaveBeenCalledWith(
      "cv_history_app-1.json",
      expect.objectContaining({
        snapshots: expect.arrayContaining([
          expect.objectContaining({ label: "Before rewrite" }),
        ]),
      }),
    );

    await useCvStore.getState().restoreSnapshot("app-1", "old-1");
    expect(useCvStore.getState().documents["app-1"].summary).toBe(
      "Older version",
    );
    expect(saveJsonMock).toHaveBeenCalledWith(
      "cv_history_app-1.json",
      expect.objectContaining({
        snapshots: expect.arrayContaining([
          expect.objectContaining({ label: "Before restoring a version" }),
        ]),
      }),
    );
  });

  it("does not let a stale save overwrite newer edits", async () => {
    const document = makeDocument();
    loadJsonMock.mockImplementation(async (name: string) =>
      name.startsWith("cv_history_") ? null : document,
    );
    await useCvStore.getState().loadCv("app-1");

    let releaseSave!: (ok: boolean) => void;
    saveJsonMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseSave = resolve;
        }),
    );

    const save = useCvStore.getState().saveCv("app-1");
    await vi.waitFor(() => expect(releaseSave).toBeTypeOf("function"));

    useCvStore.getState().updateCv("app-1", (current) => ({
      ...current,
      headline: "Newer headline",
    }));
    releaseSave(true);
    await save;

    expect(useCvStore.getState().documents["app-1"].headline).toBe(
      "Newer headline",
    );
  });

  it("waits for an in-flight save before deleting files", async () => {
    const document = makeDocument();
    loadJsonMock.mockImplementation(async (name: string) =>
      name.startsWith("cv_history_") ? null : document,
    );
    await useCvStore.getState().loadCv("app-1");

    let releaseSave!: (ok: boolean) => void;
    saveJsonMock.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseSave = resolve;
        }),
    );

    const save = useCvStore.getState().saveCv("app-1");
    await vi.waitFor(() => expect(releaseSave).toBeTypeOf("function"));

    const deletion = useCvStore.getState().deleteCv("app-1");
    await Promise.resolve();
    expect(deleteFileMock).not.toHaveBeenCalled();

    releaseSave(true);
    await save;
    await deletion;

    expect(deleteFileMock).toHaveBeenCalledWith("cv_app-1.json");
    expect(deleteFileMock).toHaveBeenCalledWith("cv_history_app-1.json");
    expect(useCvStore.getState().documents["app-1"]).toBeUndefined();
  });

  it("deletes the CV file, history and cache entry", async () => {
    const document = makeDocument();
    loadJsonMock.mockImplementation(async (name: string) =>
      name.startsWith("cv_history_") ? null : document,
    );
    await useCvStore.getState().loadCv("app-1");

    await useCvStore.getState().deleteCv("app-1");

    expect(deleteFileMock).toHaveBeenCalledWith("cv_app-1.json");
    expect(deleteFileMock).toHaveBeenCalledWith("cv_history_app-1.json");
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
