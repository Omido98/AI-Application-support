import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

// storage.ts falls back to localStorage when a read misses; the app-data
// fake below makes misses throw, so the fallback needs a stub too.
const storage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
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
});

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  remove: vi.fn(),
  mkdir: vi.fn(),
  BaseDirectory: { AppData: 22 },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: ((msg: unknown) => void) | null = null;
  },
}));

import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore, flushChatSave } from "@/stores/chatStore";
import { API_KEY_ACCOUNT } from "@/utils/keychain";

const readTextFileMock = readTextFile as Mock;
const writeTextFileMock = writeTextFile as Mock;
const invokeMock = invoke as Mock;

/** Fake OS keychain and app data directory behind the mocked transport. */
const keychain = new Map<string, string>();
const files = new Map<string, string>();

let keychainSetBroken = false;
let keychainReadBroken = false;
/** A write that lands but reads back as something else. */
let keychainCorruptsWrite = false;

const MISSING = new Error("fs: No such file or directory (os error 2)");

/** The persisted config.json, parsed. */
const persisted = () => {
  const raw = files.get("config.json");
  return raw ? JSON.parse(raw) : null;
};

beforeEach(async () => {
  await flushChatSave();
  invokeMock.mockReset();
  readTextFileMock.mockReset();
  writeTextFileMock.mockReset();
  keychain.clear();
  files.clear();
  for (const key of Object.keys(storage)) delete storage[key];
  keychainSetBroken = false;
  keychainReadBroken = false;
  keychainCorruptsWrite = false;

  invokeMock.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case "keyring_get":
        if (keychainReadBroken) throw new Error("Keychain error: locked");
        return keychain.get(String(args.key)) ?? null;
      case "keyring_set":
        if (keychainSetBroken) throw new Error("Keychain error: locked");
        keychain.set(
          String(args.key),
          keychainCorruptsWrite ? "SOMETHING-ELSE" : String(args.value),
        );
        return null;
      case "keyring_delete":
        keychain.delete(String(args.key));
        return null;
      default:
        return null;
    }
  });
  readTextFileMock.mockImplementation(async (path: string) => {
    const value = files.get(path);
    if (value == null) throw MISSING;
    return value;
  });
  writeTextFileMock.mockImplementation(async (path: string, content: string) => {
    files.set(path, content);
  });

  useChatStore.setState({
    configLoaded: false,
    config: {
      ...useChatStore.getState().config,
      apiKey: "",
      keychainAccount: null,
      sessionKeyOnly: false,
    },
  });
});

describe("credential storage", () => {
  it("stores the key in the OS keychain and never in config.json", async () => {
    await useChatStore.getState().setConfig({ apiKey: "K1" });

    // The key works this session...
    const config = useChatStore.getState().config;
    expect(config.apiKey).toBe("K1");
    expect(config.keychainAccount).toBe(API_KEY_ACCOUNT);
    expect(config.sessionKeyOnly).toBe(false);
    // ...the keychain holds it...
    expect(keychain.get(API_KEY_ACCOUNT)).toBe("K1");
    // ...and the file on disk does not.
    expect(persisted().apiKey).toBe("");
    expect(files.get("config.json")).not.toContain("K1");
  });

  it("resolves the key from the keychain on the next launch", async () => {
    await useChatStore.getState().setConfig({ apiKey: "K1" });

    useChatStore.setState({ configLoaded: false });
    await useChatStore.getState().loadConfig();
    expect(useChatStore.getState().config.apiKey).toBe("K1");
    expect(useChatStore.getState().config.keychainAccount).toBe(API_KEY_ACCOUNT);
  });

  it("migrates a pre-upgrade plaintext key into the keychain and strips the file", async () => {
    // Exactly what every install looks like before this change: the key
    // sitting in config.json, with nothing in the keychain.
    files.set(
      "config.json",
      JSON.stringify({
        provider: "zen",
        baseUrl: "https://opencode.ai/zen/v1",
        model: "m",
        apiKey: "OLD-KEY",
      }),
    );

    await useChatStore.getState().loadConfig();

    expect(useChatStore.getState().config.apiKey).toBe("OLD-KEY");
    expect(keychain.get(API_KEY_ACCOUNT)).toBe("OLD-KEY");
    // Recoverability first: the plaintext copy is removed only now that the
    // keychain demonstrably holds the key.
    expect(persisted().apiKey).toBe("");
    expect(files.get("config.json")).not.toContain("OLD-KEY");
  });

  it("keeps the plaintext file when the migration cannot be verified", async () => {
    keychainSetBroken = true;
    files.set(
      "config.json",
      JSON.stringify({
        provider: "zen",
        baseUrl: "https://opencode.ai/zen/v1",
        model: "m",
        apiKey: "OLD-KEY",
      }),
    );

    await useChatStore.getState().loadConfig();

    // The key still works this session...
    const config = useChatStore.getState().config;
    expect(config.apiKey).toBe("OLD-KEY");
    expect(config.sessionKeyOnly).toBe(true);
    expect(config.keychainAccount).toBeNull();
    // ...and the only copy of it is untouched.
    expect(persisted().apiKey).toBe("OLD-KEY");
  });

  it("treats an unverifiable keychain write as a failure", async () => {
    // The write lands but reads back as something else: believing it would
    // mean persisting nothing and having no key on the next launch.
    keychainCorruptsWrite = true;
    await useChatStore.getState().setConfig({ apiKey: "K1" });

    const config = useChatStore.getState().config;
    expect(config.sessionKeyOnly).toBe(true);
    expect(config.keychainAccount).toBeNull();
    // Session-only keys are the one case the file keeps, so nothing is lost.
    expect(config.apiKey).toBe("K1");
    expect(persisted().apiKey).toBe("K1");
    // The half-written entry is not left behind pretending to be usable.
    expect(keychain.has(API_KEY_ACCOUNT)).toBe(false);
  });

  it("keeps a session-only key persisted so a restart does not lose it", async () => {
    keychainSetBroken = true;
    await useChatStore.getState().setConfig({ apiKey: "K1" });
    expect(persisted().apiKey).toBe("K1");

    useChatStore.setState({ configLoaded: false });
    await useChatStore.getState().loadConfig();
    expect(useChatStore.getState().config.apiKey).toBe("K1");
  });

  it("clearing the key removes the stored entry and the file copy", async () => {
    await useChatStore.getState().setConfig({ apiKey: "K1" });
    expect(keychain.has(API_KEY_ACCOUNT)).toBe(true);

    await useChatStore.getState().setConfig({ apiKey: "" });

    expect(keychain.has(API_KEY_ACCOUNT)).toBe(false);
    const config = useChatStore.getState().config;
    expect(config.apiKey).toBe("");
    expect(config.keychainAccount).toBeNull();

    useChatStore.setState({ configLoaded: false });
    await useChatStore.getState().loadConfig();
    expect(useChatStore.getState().config.apiKey).toBe("");
  });

  it("a change that carries no key leaves the stored one alone", async () => {
    await useChatStore.getState().setConfig({ apiKey: "K1" });
    await useChatStore.getState().setConfig({ webSearchEnabled: true });

    expect(keychain.get(API_KEY_ACCOUNT)).toBe("K1");
    expect(useChatStore.getState().config.apiKey).toBe("K1");
  });

  it("a fresh install has no key and stores nothing", async () => {
    await useChatStore.getState().loadConfig();
    expect(useChatStore.getState().config.apiKey).toBe("");
    expect(keychain.size).toBe(0);
  });
});