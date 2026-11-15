import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/utils/storage", () => ({
  saveJson: vi.fn(),
  loadJson: vi.fn(),
}));

import { saveJson, loadJson } from "@/utils/storage";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackupBundle,
  parseBackupBundle,
  restoreBackupBundle,
  type BackupBundle,
} from "@/utils/backup";

const saveJsonMock = saveJson as Mock;
const loadJsonMock = loadJson as Mock;

const app = {
  id: "6f1d2d0e-aaaa-4bbb-8ccc-1234567890ab",
  companyName: "Acme",
};

const configWithSecret = {
  provider: "zen",
  baseUrl: "https://opencode.ai/zen/v1",
  model: "m",
  apiKey: "SECRET-KEY",
  keychainAccount: "api_key",
  sessionKeyOnly: true,
};

beforeEach(() => {
  saveJsonMock.mockReset();
  loadJsonMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
  loadJsonMock.mockImplementation(async (name: string) => {
    switch (name) {
      case "applications.json":
        return { applications: [app], selectedApplicationId: app.id };
      case "profile.json":
        return { fullName: "Jane" };
      case "config.json":
        return configWithSecret;
      case "settings.json":
        return { theme: "dark", accent: "#34d399" };
      case "drafts.json":
        return { [app.id]: "unsent draft" };
      case `chat_${app.id}.json`:
        return [{ role: "user", content: "hi", timestamp: "t" }];
      default:
        return null;
    }
  });
});

describe("buildBackupBundle", () => {
  it("collects data files and chat threads", async () => {
    const bundle = await buildBackupBundle();

    expect(bundle.format).toBe(BACKUP_FORMAT);
    expect(bundle.version).toBe(BACKUP_VERSION);
    expect(Object.keys(bundle.files).sort()).toEqual(
      [
        "applications.json",
        "config.json",
        "drafts.json",
        "profile.json",
        "settings.json",
        `chat_${app.id}.json`,
      ].sort(),
    );
  });

  it("never includes the API key or keychain reference", async () => {
    const bundle = await buildBackupBundle();
    const config = bundle.files["config.json"] as Record<string, unknown>;

    expect(config.apiKey).toBeUndefined();
    expect(config.keychainAccount).toBeUndefined();
    expect(config.sessionKeyOnly).toBeUndefined();
    // Non-secret configuration is preserved.
    expect(config.provider).toBe("zen");
    expect(config.baseUrl).toBe("https://opencode.ai/zen/v1");
    expect(JSON.stringify(bundle)).not.toContain("SECRET-KEY");
  });

  it("skips application ids that could escape the data directory", async () => {
    loadJsonMock.mockImplementation(async (name: string) => {
      if (name === "applications.json") {
        return {
          applications: [
            app,
            { id: "../../profile" },
            { id: "not a uuid" },
            { noId: true },
          ],
        };
      }
      return null;
    });

    await buildBackupBundle();

    expect(loadJsonMock).toHaveBeenCalledWith(`chat_${app.id}.json`);
    expect(loadJsonMock).not.toHaveBeenCalledWith("chat_../../profile.json");
    expect(loadJsonMock).not.toHaveBeenCalledWith("chat_not a uuid.json");
  });
});

describe("parseBackupBundle", () => {
  const valid = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-01-01T00:00:00.000Z",
    files: {},
  };

  it("accepts a valid bundle", () => {
    expect(parseBackupBundle(JSON.stringify(valid))).toEqual(valid);
  });

  it("rejects unknown formats", () => {
    expect(
      parseBackupBundle(JSON.stringify({ ...valid, format: "something-else" })),
    ).toBeNull();
  });

  it("rejects unsupported future versions", () => {
    expect(
      parseBackupBundle(
        JSON.stringify({ ...valid, version: BACKUP_VERSION + 1 }),
      ),
    ).toBeNull();
    expect(
      parseBackupBundle(JSON.stringify({ ...valid, version: 0 })),
    ).toBeNull();
  });

  it("rejects malformed JSON and missing files", () => {
    expect(parseBackupBundle("{not json")).toBeNull();
    expect(
      parseBackupBundle(JSON.stringify({ ...valid, files: null })),
    ).toBeNull();
  });
});

describe("restoreBackupBundle", () => {
  it("strips credentials from old backups before writing config", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "config.json": configWithSecret,
        "applications.json": { applications: [app] },
      },
    };

    await restoreBackupBundle(bundle);

    const configCall = saveJsonMock.mock.calls.find(
      ([name]) => name === "config.json",
    );
    expect(configCall).toBeDefined();
    const written = configCall?.[1] as Record<string, unknown>;
    expect(written.apiKey).toBeUndefined();
    expect(written.keychainAccount).toBeUndefined();
    expect(written.sessionKeyOnly).toBeUndefined();
    expect(written.provider).toBe("zen");
  });

  it("skips unsafe file names", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "../evil.json": { x: 1 },
        "sub/dir.json": { x: 2 },
        "settings.json": { theme: "dark", accent: "#fff" },
      },
    };

    const restored = await restoreBackupBundle(bundle);

    expect(restored).toEqual(["settings.json"]);
    expect(saveJsonMock).toHaveBeenCalledTimes(1);
  });

  it("skips a config file that is not an object", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "config.json": "not-an-object",
        "settings.json": { theme: "dark", accent: "#fff" },
      },
    };

    const restored = await restoreBackupBundle(bundle);

    expect(restored).toEqual(["settings.json"]);
  });
});
