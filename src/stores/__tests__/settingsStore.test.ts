import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/utils/storage", () => ({
  saveJson: vi.fn(),
  loadJson: vi.fn(),
  reportDataIssue: vi.fn(),
}));

import { saveJson, loadJson } from "@/utils/storage";
import { DEFAULT_SETTINGS, useSettingsStore } from "@/stores/settingsStore";

const saveJsonMock = saveJson as Mock;
const loadJsonMock = loadJson as Mock;

beforeEach(() => {
  saveJsonMock.mockReset();
  loadJsonMock.mockReset();
  saveJsonMock.mockResolvedValue(true);
  loadJsonMock.mockResolvedValue(null);
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, isLoaded: false });
});

describe("deadline reminder settings", () => {
  it("defaults to off with an empty daily ledger", () => {
    const state = useSettingsStore.getState();
    expect(state.notificationsEnabled).toBe(false);
    expect(state.notificationLog).toEqual({ day: "", keys: [] });
  });

  it("persists the toggle immediately", () => {
    useSettingsStore.getState().setNotificationsEnabled(true);

    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
    expect(saveJsonMock).toHaveBeenCalledWith(
      "settings.json",
      expect.objectContaining({ notificationsEnabled: true }),
    );
  });

  it("persists a deduplicated daily ledger and caps its size", () => {
    const keys = Array.from(
      { length: 250 },
      (_, index) => `app-${index}:deadline:2026-05-20`,
    );
    useSettingsStore
      .getState()
      .markNotificationsSent("2026-05-20", [...keys, keys[0]]);

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
