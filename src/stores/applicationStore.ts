import { create } from "zustand";
import { saveJson, loadJson } from "@/utils/storage";

// ──────────────────────────────────────────────
// Debounced auto-save helper
// ──────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const s = useApplicationStore.getState();
    const data: ApplicationData = {
      companyName: s.companyName,
      jobDescription: s.jobDescription,
      applicationLanguage: s.applicationLanguage,
      requirements: s.requirements,
      companyResearch: s.companyResearch,
    };
    await saveJson("current_application.json", data);
  }, 500);
}

// ──────────────────────────────────────────────
// Data interface
// ──────────────────────────────────────────────

interface ApplicationData {
  companyName: string;
  jobDescription: string;
  applicationLanguage: string;
  requirements: string;
  companyResearch: string;
}

// ──────────────────────────────────────────────
// Store interface
// ──────────────────────────────────────────────

interface ApplicationState extends ApplicationData {
  isLoaded: boolean;

  /** Load current_application.json from disk */
  loadApplication: () => Promise<void>;

  // Field setters
  setCompanyName: (value: string) => void;
  setJobDescription: (value: string) => void;
  setApplicationLanguage: (value: string) => void;
  setRequirements: (value: string) => void;
  setCompanyResearch: (value: string) => void;
}

// ──────────────────────────────────────────────
// Store implementation
// ──────────────────────────────────────────────

export const useApplicationStore = create<ApplicationState>((set) => ({
  // ── Data ──
  companyName: "",
  jobDescription: "",
  applicationLanguage: "",
  requirements: "",
  companyResearch: "",
  isLoaded: false,

  // ── Load ──
  loadApplication: async () => {
    const data = await loadJson<ApplicationData>("current_application.json");
    if (data) {
      set({
        companyName: data.companyName ?? "",
        jobDescription: data.jobDescription ?? "",
        applicationLanguage: data.applicationLanguage ?? "",
        requirements: data.requirements ?? "",
        companyResearch: data.companyResearch ?? "",
        isLoaded: true,
      });
    } else {
      set({ isLoaded: true });
    }
  },

  // ── Setters ──
  setCompanyName: (value) => {
    set({ companyName: value });
    debouncedSave();
  },
  setJobDescription: (value) => {
    set({ jobDescription: value });
    debouncedSave();
  },
  setApplicationLanguage: (value) => {
    set({ applicationLanguage: value });
    debouncedSave();
  },
  setRequirements: (value) => {
    set({ requirements: value });
    debouncedSave();
  },
  setCompanyResearch: (value) => {
    set({ companyResearch: value });
    debouncedSave();
  },
}));
