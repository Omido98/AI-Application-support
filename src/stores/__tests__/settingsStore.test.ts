import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/utils/storage", () => ({
  saveJson: vi.fn(),
  loadJson: vi.fn(),
  reportDataIssue: vi.fn(),
}));

import { saveJson, loadJson } from "@/utils/storage";
import {
  DEFAULT_SETTINGS,
  flushSettingsSave,
  getAccentForeground,
  getContrastRatio,
  getReadableAccent,
  useSettingsStore,
} from "@/stores/settingsStore";

const saveJsonMock = saveJson as Mock;
const loadJsonMock = loadJson as Mock;

beforeEach(async () => {
  await flushSettingsSave();
  saveJsonMock.mockReset();
  loadJsonMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
  loadJsonMock.mockResolvedValue(null);
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, isLoaded: false });
});

describe("accent contrast", () => {
  const presets = ["#34d399", "#0f6e5c", "#a8a094", "#808080", "#fbbf24"];

  it("shifts a dark-theme accent until it passes AA on the lightest surface", () => {
    for (const accent of presets) {
      const readable = getReadableAccent(accent, true);
      expect(getContrastRatio(readable, "#262219")).toBeGreaterThanOrEqual(4.6);
    }
  });

  it("shifts a light-theme accent until it passes AA on white", () => {
    for (const accent of presets) {
      const readable = getReadableAccent(accent, false);
      expect(getContrastRatio(readable, "#ffffff")).toBeGreaterThanOrEqual(4.6);
    }
  });

  it("leaves an accent that already passes unchanged", () => {
    expect(getReadableAccent("#34d399", true)).toBe("#34d399");
  });

  it("picks the higher-contrast ink for the button label", () => {
    expect(getAccentForeground("#34d399")).toBe("#0d2b22");
    expect(getAccentForeground("#0f6e5c")).toBe("#ffffff");
    for (const accent of presets) {
      const ink = getAccentForeground(accent);
      const other = ink === "#ffffff" ? "#0d2b22" : "#ffffff";
      expect(getContrastRatio(ink, accent)).toBeGreaterThanOrEqual(
        getContrastRatio(other, accent),
      );
    }
  });
});

describe("deadline reminder settings", () => {
  it("defaults to off with an empty daily ledger", () => {
    const state = useSettingsStore.getState();
    expect(state.notificationsEnabled).toBe(false);
    expect(state.notificationLog).toEqual({ day: "", keys: [] });
  });

  it("persists the toggle immediately", async () => {
    useSettingsStore.getState().setNotificationsEnabled(true);
    await flushSettingsSave();

    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
    expect(saveJsonMock).toHaveBeenCalledWith(
      "settings.json",
      expect.objectContaining({ notificationsEnabled: true }),
    );
  });

  it("serializes rapid changes and leaves the latest snapshot on disk", async () => {
    useSettingsStore.getState().setTheme("light");
    useSettingsStore.getState().setTheme("dark");
    useSettingsStore.getState().setAccent("#123456");
    await flushSettingsSave();

    const settingsCalls = saveJsonMock.mock.calls.filter(
      ([name]) => name === "settings.json",
    );
    expect(settingsCalls.length).toBeGreaterThan(0);
    expect(settingsCalls.at(-1)?.[1]).toEqual(
      expect.objectContaining({ theme: "dark", accent: "#123456" }),
    );
  });

  it("persists a deduplicated daily ledger and caps its size", async () => {
    const keys = Array.from(
      { length: 250 },
      (_, index) => `app-${index}:deadline:2026-05-20`,
    );
    useSettingsStore
      .getState()
      .markNotificationsSent("2026-05-20", [...keys, keys[0]]);
    await flushSettingsSave();

    const log = useSettingsStore.getState().notificationLog;
    expect(log.day).toBe("2026-05-20");
    expect(log.keys).toHaveLength(200);
    expect(log.keys[0]).toBe("app-50:deadline:2026-05-20");
    expect(log.keys.at(-1)).toBe("app-249:deadline:2026-05-20");
    expect(saveJsonMock).toHaveBeenLastCalledWith(
      "settings.json",
      expect.objectContaining({
        notificationLog: expect.objectContaining({ day: "2026-05-20" }),
      }),
    );
  });

  it("loads reminder settings from disk", async () => {
    loadJsonMock.mockResolvedValue({
      theme: "dark",
      notificationsEnabled: true,
      notificationLog: {
        day: "2026-05-20",
        keys: ["app-1:deadline:2026-05-20"],
      },
    });

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
    expect(useSettingsStore.getState().notificationLog).toEqual({
      day: "2026-05-20",
      keys: ["app-1:deadline:2026-05-20"],
    });
  });
});
