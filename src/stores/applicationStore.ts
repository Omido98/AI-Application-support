import { create } from "zustand";
import {
  saveJson,
  loadJson,
  deleteFile,
  reportDataIssue,
} from "@/utils/storage";
import { normalizeApplicationsPayload } from "@/utils/dataValidation";
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
export async function flushApplicationSave(): Promise<boolean> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    return writeSnapshot();
  }
  return true;
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
  /**
   * Remove an application from the list and return a snapshot for undo. The
   * chat file is deleted separately by `deleteApplicationThread` once the undo
   * window has passed.
   */
  removeApplication: (id: string) => JobApplication | null;
  /** Put a snapshot from `removeApplication` back and select it. */
  restoreApplication: (application: JobApplication) => void;
  /** Delete the chat thread file of a removed application. */
  deleteApplicationThread: (id: string) => Promise<void>;
  /** Patch a single application (touches updatedAt) */
  updateApplication: (id: string, patch: Partial<JobApplication>) => void;
  selectApplication: (id: string | null) => void;
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
    const data = await loadJson<unknown>("applications.json");

    if (data) {
      const normalized = normalizeApplicationsPayload(data);
      if (!normalized) {
        reportDataIssue(
          "applications.json",
          "The file has an unexpected structure. The application list was left empty and the file was not modified.",
        );
        set({ isLoaded: true });
        return;
      }
      set({ ...normalized, isLoaded: true });
      return;
    }

    // First run — migrate the legacy single-application file if present.
    const legacy = await loadJson<Record<string, unknown>>(
      "current_application.json",
    );
    const legacyCompany =
      typeof legacy?.companyName === "string" ? legacy.companyName : "";
    const legacyJobDescription =
      typeof legacy?.jobDescription === "string" ? legacy.jobDescription : "";
    const legacyLanguage =
      typeof legacy?.applicationLanguage === "string"
        ? legacy.applicationLanguage
        : "";
    const legacyRequirements =
      typeof legacy?.requirements === "string" ? legacy.requirements : "";
    const legacyResearch =
      typeof legacy?.companyResearch === "string" ? legacy.companyResearch : "";

    if (legacyCompany || legacyJobDescription) {
      const app: JobApplication = {
        id: crypto.randomUUID(),
        companyName: legacyCompany,
        jobTitle: "",
        applicationUrl: "",
        status: "wishlist",
        jobDescription: legacyJobDescription,
        applicationLanguage: legacyLanguage,
        requirements: legacyRequirements,
        companyResearch: legacyResearch,
        notes: "",
        location: "",
        workMode: "",
        salary: "",
        source: "",
        priority: "medium",
        tags: [],
        appliedAt: "",
        deadline: "",
        followUpAt: "",
        contactName: "",
        contactEmail: "",
        statusHistory: [{ status: "wishlist", at: new Date().toISOString() }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      set({
        applications: [app],
        selectedApplicationId: app.id,
        isLoaded: true,
      });
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
      location: "",
      workMode: "",
      salary: "",
      source: "",
      priority: "medium",
      tags: [],
      appliedAt: "",
      deadline: "",
      followUpAt: "",
      contactName: "",
      contactEmail: "",
      statusHistory: [{ status: "wishlist", at: now }],
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

  removeApplication: (id) => {
    const s = get();
    const removed = s.applications.find((app) => app.id === id) ?? null;
    if (!removed) return null;
    const next = s.applications.filter((app) => app.id !== id);
    const nextSelected =
      s.selectedApplicationId === id
        ? (next[0]?.id ?? null)
        : s.selectedApplicationId;
    set({ applications: next, selectedApplicationId: nextSelected });
    debouncedSave();
    return removed;
  },

  restoreApplication: (application) => {
    set((s) => ({
      applications: [application, ...s.applications],
      selectedApplicationId: application.id,
    }));
    debouncedSave();
  },

  deleteApplicationThread: async (id) => {
    await deleteFile(`chat_${id}.json`);
  },

  updateApplication: (id, patch) => {
    const now = new Date().toISOString();
    set((s) => ({
      applications: s.applications.map((a) => {
        if (a.id !== id) return a;
        const nextStatus = patch.status;
        const statusChanged =
          nextStatus !== undefined && nextStatus !== a.status;
        return {
          ...a,
          ...patch,
          statusHistory:
            statusChanged && nextStatus !== undefined
              ? [...a.statusHistory, { status: nextStatus, at: now }]
              : a.statusHistory,
          updatedAt: now,
        };
      }),
    }));
    debouncedSave();
  },

  selectApplication: (id) => {
    set({ selectedApplicationId: id });
    debouncedSave();
  },
}));
