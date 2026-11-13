import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

const storage: Record<string, string> = {};

const localStorageStub = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete storage[key];
  },
  clear: () => {
    for (const key of Object.keys(storage)) delete storage[key];
  },
  key: (index: number) => Object.keys(storage)[index] ?? null,
  get length() {
    return Object.keys(storage).length;
  },
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  clearStorageIssues,
  deleteFile,
  getStorageIssues,
  loadJson,
  saveJson,
} from "@/utils/storage";

const invokeMock = invoke as Mock;

function enterTauri() {
  vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", localStorageStub);
  clearStorageIssues();
  for (const key of Object.keys(storage)) delete storage[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveJson (Tauri)", () => {
  it("writes through the Rust data-file command", async () => {
    enterTauri();
    invokeMock.mockResolvedValue(undefined);

    await expect(
      saveJson("applications.json", { applications: [] }),
    ).resolves.toBe(true);

    expect(invokeMock).toHaveBeenCalledWith("save_data_file", {
      name: "applications.json",
      data: { applications: [] },
    });
  });

  it("returns false and reports a write failure instead of silently falling back", async () => {
    enterTauri();
    invokeMock.mockRejectedValue("disk full");

    await expect(
      saveJson("applications.json", { applications: [] }),
    ).resolves.toBe(false);

    expect(getStorageIssues()).toEqual([
      expect.objectContaining({
        kind: "save",
        file: "applications.json",
        message: "disk full",
      }),
    ]);
    expect(localStorage.getItem("aas:applications.json")).toBeNull();
  });
});

describe("loadJson (Tauri)", () => {
  it("returns the parsed value from the Rust command", async () => {
    enterTauri();
    invokeMock.mockResolvedValue({
      data: { ok: true },
      recovered: false,
      error: null,
    });

    await expect(loadJson("config.json")).resolves.toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith("load_data_file", {
      name: "config.json",
    });
  });

  it("reports a backup recovery", async () => {
    enterTauri();
    invokeMock.mockResolvedValue({
      data: [],
      recovered: true,
      error: null,
    });

    await expect(loadJson("chat_abc.json")).resolves.toEqual([]);
    expect(getStorageIssues()).toEqual([
      expect.objectContaining({
        kind: "recovery",
        file: "chat_abc.json",
      }),
    ]);
  });

  it("reports an unrecoverable corrupt file and returns null", async () => {
    enterTauri();
    invokeMock.mockResolvedValue({
      data: null,
      recovered: false,
      error: "profile.json is not valid JSON and neither is its backup",
    });

    await expect(loadJson("profile.json")).resolves.toBeNull();
    expect(getStorageIssues()).toEqual([
      expect.objectContaining({
        kind: "load",
        file: "profile.json",
        message: expect.stringContaining("not valid JSON"),
      }),
    ]);
  });

  it("reports a command failure", async () => {
    enterTauri();
    invokeMock.mockRejectedValue("permission denied");

    await expect(loadJson("settings.json")).resolves.toBeNull();
    expect(getStorageIssues()[0]).toMatchObject({
      kind: "load",
      file: "settings.json",
    });
  });
});

describe("deleteFile (Tauri)", () => {
  it("deletes through the Rust command", async () => {
    enterTauri();
    invokeMock.mockResolvedValue(undefined);

    await expect(deleteFile("chat_abc.json")).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("delete_data_file", {
      name: "chat_abc.json",
    });
  });

  it("reports a delete failure", async () => {
    enterTauri();
    invokeMock.mockRejectedValue("file busy");

    await expect(deleteFile("chat_abc.json")).resolves.toBe(false);
    expect(getStorageIssues()[0]).toMatchObject({
      kind: "delete",
      file: "chat_abc.json",
    });
  });
});

describe("browser fallback", () => {
  it("uses localStorage when not running inside Tauri", async () => {
    vi.stubGlobal("window", {});

    await expect(saveJson("settings.json", { theme: "dark" })).resolves.toBe(
      true,
    );
    expect(invokeMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("aas:settings.json")).toContain(
      '"theme": "dark"',
    );

    await expect(loadJson("settings.json")).resolves.toEqual({ theme: "dark" });
  });

  it("deletes from localStorage", async () => {
    vi.stubGlobal("window", {});
    localStorage.setItem("aas:chat_abc.json", "[]");

    await expect(deleteFile("chat_abc.json")).resolves.toBe(true);
    expect(localStorage.getItem("aas:chat_abc.json")).toBeNull();
  });

  it("reports unparseable browser data", async () => {
    vi.stubGlobal("window", {});
    localStorage.setItem("aas:profile.json", "{not json");

    await expect(loadJson("profile.json")).resolves.toBeNull();
    expect(getStorageIssues()[0]).toMatchObject({
      kind: "load",
      file: "profile.json",
    });
  });
});
