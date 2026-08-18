import { create } from "zustand";
import { saveJson, loadJson } from "@/utils/storage";

// ──────────────────────────────────────────────
// Settings types
// ──────────────────────────────────────────────

export interface Settings {
  theme: "dark" | "light";
  accent: string;
}

export const DEFAULT_ACCENT = "#34d399";
export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  accent: DEFAULT_ACCENT,
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
  setTheme: (theme: "dark" | "light") => void;
  setAccent: (accent: string) => void;
}

function persist(theme: "dark" | "light", accent: string) {
  void saveJson("settings.json", { theme, accent } as Settings);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    const data = await loadJson<Settings>("settings.json");
    if (data) {
      set({
        theme: data.theme === "light" ? "light" : "dark",
        accent: data.accent || DEFAULT_ACCENT,
        isLoaded: true,
      });
    } else {
      set({ ...DEFAULT_SETTINGS, isLoaded: true });
    }
  },

  setTheme: (theme) => {
    set({ theme });
    persist(theme, get().accent);
  },

  setAccent: (accent) => {
    set({ accent });
    persist(get().theme, accent);
  },
}));
