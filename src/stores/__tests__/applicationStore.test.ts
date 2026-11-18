import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { JobApplication } from "@/types";

vi.mock("@/utils/storage", () => ({
  saveJson: vi.fn(),
  loadJson: vi.fn(),
  deleteFile: vi.fn(),
  reportDataIssue: vi.fn(),
}));

import { saveJson } from "@/utils/storage";
import {
  flushApplicationSave,
  useApplicationStore,
} from "@/stores/applicationStore";

const saveJsonMock = saveJson as Mock;

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  await flushApplicationSave();
  saveJsonMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
  useApplicationStore.setState({
    applications: [application],
    selectedApplicationId: application.id,
    isLoaded: true,
  });
});

describe("applicationStore persistence", () => {
  it("flush waits for an in-flight write", async () => {
    const inFlight = deferred<boolean>();
    saveJsonMock.mockReturnValueOnce(inFlight.promise);

    useApplicationStore
      .getState()
      .updateApplication(application.id, { companyName: "Updated" });
    const flushing = flushApplicationSave();
    await vi.waitFor(() =>
      expect(saveJsonMock).toHaveBeenCalledWith(
        "applications.json",
        expect.objectContaining({
          applications: [expect.objectContaining({ companyName: "Updated" })],
        }),
      ),
    );

    let settled = false;
    void flushing.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    inFlight.resolve(true);
    await expect(flushing).resolves.toBe(true);
  });

  it("serializes a second flush behind the first and keeps the newest state", async () => {
    const first = deferred<boolean>();
    saveJsonMock.mockReturnValueOnce(first.promise);

    useApplicationStore
      .getState()
      .updateApplication(application.id, { companyName: "First" });
    const firstFlush = flushApplicationSave();
    await vi.waitFor(() => expect(saveJsonMock).toHaveBeenCalledTimes(1));

    useApplicationStore
      .getState()
      .updateApplication(application.id, { companyName: "Second" });
    const secondFlush = flushApplicationSave();

    first.resolve(true);
    await Promise.all([firstFlush, secondFlush]);

    const writes = saveJsonMock.mock.calls.filter(
      ([name]) => name === "applications.json",
    );
    expect(writes).toHaveLength(2);
    expect(
      (writes[1][1] as { applications: JobApplication[] }).applications[0]
        .companyName,
    ).toBe("Second");
  });
});
