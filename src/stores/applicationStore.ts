import { create } from "zustand";
import { saveJson, loadJson, deleteFile } from "@/utils/storage";
import type { JobApplication } from "@/types";

// ──────────────────────────────────────────────
// Debounced auto-save helper
// ──────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function writeSnapshot() {
  const s = useApplicationStore.getState();
  return saveJson("applications.json", {
    applications: s.applications,
    selectedApplicationId: s.selectedApplicationId,
  });
}

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await writeSnapshot();
  }, 500);
}

/** Flush any pending debounced save immediately (called on window close). */
export async function flushApplicationSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    await writeSnapshot();
  }
}

// ──────────────────────────────────────────────
// Store interface
// ──────────────────────────────────────────────

interface ApplicationState {
  applications: JobApplication[];
  selectedApplicationId: string | null;
  isLoaded: boolean;

  /** Load applications.json from disk (migrating legacy data on first run) */
  loadApplications: () => Promise<void>;
  /** Create a new empty application, select it, and return its id */
  addApplication: () => string;
  /** Delete an application and its chat thread file */
  removeApplication: (id: string) => Promise<void>;
  /** Patch a single application (touches updatedAt) */
  updateApplication: (id: string, patch: Partial<JobApplication>) => void;
  selectApplication: (id: string | null) => void;
}

interface PersistedApplications {
  applications: JobApplication[];
  selectedApplicationId: string | null;
}

// ──────────────────────────────────────────────
// Store implementation
// ──────────────────────────────────────────────

export const useApplicationStore = create<ApplicationState>((set, get) => ({
  // ── Data ──
  applications: [],
  selectedApplicationId: null,
  isLoaded: false,

  // ── Load ──
  loadApplications: async () => {
    const data = await loadJson<PersistedApplications>("applications.json");

    if (data) {
      if (data.applications.length > 0) {
        const valid = data.selectedApplicationId
          ? data.applications.some((a) => a.id === data.selectedApplicationId)
          : false;
        set({
          applications: data.applications,
          selectedApplicationId: valid
            ? data.selectedApplicationId
            : data.applications[0].id,
          isLoaded: true,
        });
      } else {
        set({ applications: [], selectedApplicationId: null, isLoaded: true });
      }
      return;
    }

    // First run — migrate the legacy single-application file if present.
    const legacy = await loadJson<{
      companyName?: string;
      jobDescription?: string;
      applicationLanguage?: string;
      requirements?: string;
      companyResearch?: string;
    }>("current_application.json");

    if (legacy && (legacy.companyName || legacy.jobDescription)) {
      const app: JobApplication = {
        id: crypto.randomUUID(),
        companyName: legacy.companyName ?? "",
        jobTitle: "",
        applicationUrl: "",
        status: "wishlist",
        jobDescription: legacy.jobDescription ?? "",
        applicationLanguage: legacy.applicationLanguage ?? "",
        requirements: legacy.requirements ?? "",
        companyResearch: legacy.companyResearch ?? "",
        notes: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      set({ applications: [app], selectedApplicationId: app.id, isLoaded: true });
      await saveJson("applications.json", {
        applications: [app],
        selectedApplicationId: app.id,
      });
      return;
    }

    set({ isLoaded: true });
  },

  // ── Actions ──
  addApplication: () => {
    const now = new Date().toISOString();
    const app: JobApplication = {
      id: crypto.randomUUID(),
      companyName: "",
      jobTitle: "",
      applicationUrl: "",
      status: "wishlist",
      jobDescription: "",
      applicationLanguage: "",
      requirements: "",
      companyResearch: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      applications: [app, ...s.applications],
      selectedApplicationId: app.id,
    }));
    debouncedSave();
    return app.id;
  },

  removeApplication: async (id) => {
    const s = get();
    const next = s.applications.filter((a) => a.id !== id);
    const nextSelected =
      s.selectedApplicationId === id
        ? (next[0]?.id ?? null)
        : s.selectedApplicationId;
    set({ applications: next, selectedApplicationId: nextSelected });
    debouncedSave();
    await deleteFile(`chat_${id}.json`);
  },

  updateApplication: (id, patch) => {
    set((s) => ({
      applications: s.applications.map((a) =>
        a.id === id
          ? { ...a, ...patch, updatedAt: new Date().toISOString() }
          : a,
      ),
    }));
    debouncedSave();
  },

  selectApplication: (id) => {
    set({ selectedApplicationId: id });
    debouncedSave();
  },
}));
