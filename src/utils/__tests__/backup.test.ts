import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/utils/storage", () => ({
  saveJson: vi.fn(),
  loadJson: vi.fn(),
  pruneOrphanChatFiles: vi.fn(),
  pruneOrphanCvFiles: vi.fn(),
}));

import {
  loadJson,
  pruneOrphanChatFiles,
  pruneOrphanCvFiles,
  saveJson,
} from "@/utils/storage";
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
const pruneChatMock = pruneOrphanChatFiles as Mock;
const pruneCvMock = pruneOrphanCvFiles as Mock;

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
  pruneChatMock.mockReset();
  pruneCvMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
  pruneChatMock.mockResolvedValue([]);
  pruneCvMock.mockResolvedValue([]);
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

  it("includes CV drafts and history for existing applications", async () => {
    const cv = { schemaVersion: 1, headline: "Engineer" };
    const history = { schemaVersion: 1, snapshots: [] };
    loadJsonMock.mockImplementation(async (name: string) => {
      if (name === "applications.json") {
        return { applications: [app], selectedApplicationId: app.id };
      }
      if (name === `cv_${app.id}.json`) return cv;
      if (name === `cv_history_${app.id}.json`) return history;
      return null;
    });

    const bundle = await buildBackupBundle();

    expect(bundle.files[`cv_${app.id}.json`]).toEqual(cv);
    expect(bundle.files[`cv_history_${app.id}.json`]).toEqual(history);
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
  it("preserves stable chat message ids through export and restore", async () => {
    const messages = [
      {
        id: "message-1",
        role: "user",
        content: "Draft my cover letter.",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "message-2",
        role: "assistant",
        content: "Improved draft.",
        timestamp: "2026-01-01T00:00:01.000Z",
        kind: "improve",
        sourceKey: "message-1",
      },
    ];
    loadJsonMock.mockImplementation(async (name: string) => {
      if (name === "applications.json") {
        return { applications: [app], selectedApplicationId: app.id };
      }
      if (name === `chat_${app.id}.json`) return messages;
      return null;
    });

    const bundle = await buildBackupBundle();
    expect(bundle.files[`chat_${app.id}.json`]).toEqual(messages);

    saveJsonMock.mockClear();
    await restoreBackupBundle(bundle);

    expect(saveJsonMock).toHaveBeenCalledWith(`chat_${app.id}.json`, messages);
  });

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

  it("prunes chat threads for applications missing from the bundle", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "applications.json": { applications: [app] },
        "settings.json": { theme: "dark", accent: "#fff" },
      },
    };

    await restoreBackupBundle(bundle);

    expect(pruneChatMock).toHaveBeenCalledWith([app.id]);
    expect(pruneCvMock).toHaveBeenCalledWith([app.id]);
  });

  it("keeps the current application ids when the bundle omits them", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: { "settings.json": { theme: "dark", accent: "#fff" } },
    };

    await restoreBackupBundle(bundle);

    expect(loadJsonMock).toHaveBeenCalledWith("applications.json");
    expect(pruneChatMock).toHaveBeenCalledWith([app.id]);
    expect(pruneCvMock).toHaveBeenCalledWith([app.id]);
  });

  it("drops drafts for applications that are not in the restored data", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "applications.json": { applications: [app] },
        "drafts.json": {
          [app.id]: "keep this",
          "deleted-application": "drop this",
          "not a valid id": "drop this too",
        },
      },
    };

    await restoreBackupBundle(bundle);

    const draftsCall = saveJsonMock.mock.calls.find(
      ([name]) => name === "drafts.json",
    );
    expect(draftsCall?.[1]).toEqual({ [app.id]: "keep this" });
  });

  it("only passes safe application ids to the cleanup", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "applications.json": {
          applications: [app, { id: "../../profile" }, { id: "not a uuid" }],
        },
      },
    };

    await restoreBackupBundle(bundle);

    expect(pruneChatMock).toHaveBeenCalledWith([app.id]);
  });

  it("rejects a malformed applications payload before writing or pruning", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "applications.json": {},
        "settings.json": { theme: "dark", accent: "#fff" },
      },
    };

    await expect(restoreBackupBundle(bundle)).rejects.toThrow(
      /applications\.json/,
    );
    expect(saveJsonMock).not.toHaveBeenCalled();
    expect(pruneChatMock).not.toHaveBeenCalled();
    expect(pruneCvMock).not.toHaveBeenCalled();
  });

  it("rejects a non-empty applications payload with no usable ids", async () => {
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "applications.json": {
          applications: [{ id: "../../profile" }, { id: "not a uuid" }],
        },
      },
    };

    await expect(restoreBackupBundle(bundle)).rejects.toThrow(/no usable/);
    expect(saveJsonMock).not.toHaveBeenCalled();
    expect(pruneChatMock).not.toHaveBeenCalled();
  });

  it("skips pruning when the current application file cannot be read", async () => {
    loadJsonMock.mockResolvedValue(null);
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "2026-01-01T00:00:00.000Z",
      files: {
        "settings.json": { theme: "dark", accent: "#fff" },
      },
    };

    await restoreBackupBundle(bundle);

    expect(saveJsonMock).toHaveBeenCalledWith("settings.json", {
      theme: "dark",
      accent: "#fff",
    });
    expect(pruneChatMock).not.toHaveBeenCalled();
    expect(pruneCvMock).not.toHaveBeenCalled();
  });
});
