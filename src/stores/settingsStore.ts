import { create } from "zustand";
import { saveJson, loadJson, reportDataIssue } from "@/utils/storage";
import { normalizeSettingsData } from "@/utils/dataValidation";
import {
  DEFAULT_PROFILE_SECTION_ORDER,
  type ProfileSectionId,
} from "@/utils/profileSections";
import type { TabId } from "@/stores/useAppStore";

// ──────────────────────────────────────────────
// Settings types
// ──────────────────────────────────────────────

export type ThemePreference = "dark" | "light" | "system";

/** Per-day dedupe ledger for deadline/follow-up reminders. */
export interface NotificationLog {
  /** Local day (`YYYY-MM-DD`) the keys belong to. */
  day: string;
  /** `${applicationId}:${kind}:${date}` already announced that day. */
  keys: string[];
}

export interface Settings {
  theme: ThemePreference;
  accent: string;
  /** Tab open at the end of the previous session. */
  lastTab: TabId;
  /** The first-run walkthrough is only shown once. */
  onboardingDone: boolean;
  /** User-chosen order of the Profile tab sections. */
  profileSectionOrder: ProfileSectionId[];
  /** Check for a newer release a few seconds after launch. */
  autoUpdateCheck: boolean;
  /** Release the user asked not to be reminded about; "" = none. */
  skippedUpdateVersion: string;
  /** Desktop deadline/follow-up reminders are opt-in. */
  notificationsEnabled: boolean;
  /** Reminder dedupe ledger, persisted so a restart cannot re-toast. */
  notificationLog: NotificationLog;
}

export const DEFAULT_ACCENT = "#34d399";
export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: DEFAULT_ACCENT,
  lastTab: "application",
  onboardingDone: false,
  profileSectionOrder: DEFAULT_PROFILE_SECTION_ORDER,
  autoUpdateCheck: true,
  skippedUpdateVersion: "",
  notificationsEnabled: false,
  notificationLog: { day: "", keys: [] },
};

// ──────────────────────────────────────────────
// Accent helpers
// ──────────────────────────────────────────────

/** WCAG relative luminance of a hex colour (0 = black, 1 = white). */
export function getAccentLuminance(hex: string): number {
  const n = hex.replace("#", "");
  if (n.length !== 6) return 0;
  const channel = (offset: number) => {
    const value = parseInt(n.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two hex colours. */
export function getContrastRatio(a: string, b: string): number {
  const [lighter, darker] = [getAccentLuminance(a), getAccentLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** Blend `from` toward `to`; weight 0 = from, 1 = to. */
function mixHex(from: string, to: string, weight: number): string {
  const parse = (hex: string) => {
    const n = hex.replace("#", "");
    return [0, 2, 4].map((offset) => parseInt(n.slice(offset, offset + 2), 16));
  };
  const [fr, fg, fb] = parse(from);
  const [tr, tg, tb] = parse(to);
  const mix = (f: number, t: number) =>
    Math.round(f + (t - f) * weight)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(fr, tr)}${mix(fg, tg)}${mix(fb, tb)}`;
}

/**
 * The user's accent is also used as a text colour (links, quiet primary
 * actions), so a bright or very dark choice can fall below WCAG AA. Shift the
 * applied accent toward white (dark theme) or black (light theme) until it has
 * 4.6:1 contrast against the lightest surface it can appear on. The stored
 * preference stays untouched.
 */
export function getReadableAccent(hex: string, isDark: boolean): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const basis = hex.toLowerCase();
  const surface = isDark ? "#262219" : "#ffffff";
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mixHex(basis, isDark ? "#ffffff" : "#000000", step / 20);
    if (getContrastRatio(candidate, surface) >= 4.6) return candidate;
  }
  return isDark ? "#ffffff" : "#000000";
}

/** Text colour (hex) with the best contrast on top of the given accent. */
export function getAccentForeground(hex: string): string {
  const darkInk = "#0d2b22";
  const lightInk = "#ffffff";
  return getContrastRatio(hex, darkInk) >= getContrastRatio(hex, lightInk)
    ? darkInk
    : lightInk;
}

// ──────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────

interface SettingsState extends Settings {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setTheme: (theme: ThemePreference) => void;
  setAccent: (accent: string) => void;
  setLastTab: (tab: TabId) => void;
  setOnboardingDone: (done: boolean) => void;
  setProfileSectionOrder: (order: ProfileSectionId[]) => void;
  setAutoUpdateCheck: (enabled: boolean) => void;
  setSkippedUpdateVersion: (version: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  /** Record which reminders were announced on the given local day. */
  markNotificationsSent: (day: string, keys: string[]) => void;
}

function persist(state: SettingsState) {
  const settings: Settings = {
    theme: state.theme,
    accent: state.accent,
    lastTab: state.lastTab,
    onboardingDone: state.onboardingDone,
    profileSectionOrder: state.profileSectionOrder,
    autoUpdateCheck: state.autoUpdateCheck,
    skippedUpdateVersion: state.skippedUpdateVersion,
    notificationsEnabled: state.notificationsEnabled,
    notificationLog: state.notificationLog,
  };
  void saveJson("settings.json", settings);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    const data = await loadJson<unknown>("settings.json");
    if (data) {
      const normalized = normalizeSettingsData(data);
      if (!normalized) {
        reportDataIssue(
          "settings.json",
          "The file has an unexpected structure. Default appearance settings were used.",
        );
      }
      set({
        theme: normalized?.theme ?? DEFAULT_SETTINGS.theme,
        accent: normalized?.accent || DEFAULT_ACCENT,
        lastTab: normalized?.lastTab ?? DEFAULT_SETTINGS.lastTab,
        onboardingDone:
          normalized?.onboardingDone ?? DEFAULT_SETTINGS.onboardingDone,
        profileSectionOrder:
          normalized?.profileSectionOrder ??
          DEFAULT_SETTINGS.profileSectionOrder,
        autoUpdateCheck:
          normalized?.autoUpdateCheck ?? DEFAULT_SETTINGS.autoUpdateCheck,
        skippedUpdateVersion:
          normalized?.skippedUpdateVersion ??
          DEFAULT_SETTINGS.skippedUpdateVersion,
        notificationsEnabled:
          normalized?.notificationsEnabled ??
          DEFAULT_SETTINGS.notificationsEnabled,
        notificationLog:
          normalized?.notificationLog ?? DEFAULT_SETTINGS.notificationLog,
        isLoaded: true,
      });
    } else {
      set({ ...DEFAULT_SETTINGS, isLoaded: true });
    }
  },

  setTheme: (theme) => {
    set({ theme });
    persist(get());
  },

  setAccent: (accent) => {
    set({ accent });
    persist(get());
  },

  setLastTab: (lastTab) => {
    set({ lastTab });
    persist(get());
  },

  setOnboardingDone: (onboardingDone) => {
    set({ onboardingDone });
    persist(get());
  },

  setProfileSectionOrder: (profileSectionOrder) => {
    set({ profileSectionOrder });
    persist(get());
  },

  setAutoUpdateCheck: (autoUpdateCheck) => {
    set({ autoUpdateCheck });
    persist(get());
  },

  setSkippedUpdateVersion: (skippedUpdateVersion) => {
    set({ skippedUpdateVersion });
    persist(get());
  },

  setNotificationsEnabled: (notificationsEnabled) => {
    set({ notificationsEnabled });
    persist(get());
  },

  markNotificationsSent: (day, keys) => {
    const unique = [...new Set(keys)].slice(-200);
    set({ notificationLog: { day, keys: unique } });
    persist(get());
  },
}));
