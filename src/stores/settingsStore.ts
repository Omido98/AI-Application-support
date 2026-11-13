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
};

// ──────────────────────────────────────────────
// Accent helpers
// ──────────────────────────────────────────────

/** Relative luminance of a hex colour (0 = black, 1 = white). */
export function getAccentLuminance(hex: string): number {
  const n = hex.replace("#", "");
  if (n.length !== 6) return 0;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Text colour (hex) that stays readable on top of the given accent. */
export function getAccentForeground(hex: string): string {
  return getAccentLuminance(hex) > 0.45 ? "#0d2b22" : "#ffffff";
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
}));
