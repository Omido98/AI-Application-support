import { create } from "zustand";
import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument } from "@/types/cv";
import type { ApiConfig } from "@/stores/chatStore";
import {
  deleteFile,
  loadJson,
  reportDataIssue,
  saveJson,
} from "@/utils/storage";
import { normalizeCvDocument } from "@/utils/cvSchema";
import {
  CvGenerationError,
  generateCvDocument,
  type CvGenerationOptions,
} from "@/utils/cvGeneration";

interface CvState {
  documents: Record<string, CvDocument>;
  loaded: Record<string, boolean>;
  loading: Record<string, boolean>;
  saving: Record<string, boolean>;
  errors: Record<string, string | null>;
  generating: Record<string, boolean>;
  generationErrors: Record<string, string | null>;

  loadCv: (applicationId: string) => Promise<void>;
  saveCv: (applicationId: string) => Promise<boolean>;
  setCv: (applicationId: string, document: CvDocument) => void;
  updateCv: (
    applicationId: string,
    updater: (document: CvDocument) => CvDocument,
  ) => void;
  generateCv: (args: {
    application: JobApplication;
    profile: ProfileData;
    config: ApiConfig;
    options: CvGenerationOptions;
  }) => Promise<boolean>;
  cancelGeneration: (applicationId: string) => void;
  deleteCv: (applicationId: string) => Promise<void>;
  resetCache: () => void;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const controllers = new Map<string, AbortController>();

function fileName(applicationId: string): string {
  return `cv_${applicationId}.json`;
}

function errorText(error: unknown): string {
  if (error instanceof CvGenerationError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function scheduleSave(applicationId: string) {
  const existing = saveTimers.get(applicationId);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    applicationId,
    setTimeout(() => {
      saveTimers.delete(applicationId);
      void useCvStore.getState().saveCv(applicationId);
    }, 500),
  );
}

/** Flush pending CV edits (used before close/backup/reload). */
export async function flushCvSaves(): Promise<boolean> {
  for (const timer of saveTimers.values()) clearTimeout(timer);
  saveTimers.clear();
  const state = useCvStore.getState();
  const ids = Object.keys(state.documents);
  const results = await Promise.all(ids.map((id) => state.saveCv(id)));
  return results.every(Boolean);
}

export const useCvStore = create<CvState>((set, get) => ({
  documents: {},
  loaded: {},
  loading: {},
  saving: {},
  errors: {},
  generating: {},
  generationErrors: {},

  loadCv: async (applicationId) => {
    if (get().loaded[applicationId] || get().loading[applicationId]) return;
    set((state) => ({
      loading: { ...state.loading, [applicationId]: true },
      errors: { ...state.errors, [applicationId]: null },
    }));
    const raw = await loadJson<unknown>(fileName(applicationId));
    let document: CvDocument | null = null;
    let error: string | null = null;
    if (raw != null) {
      document = normalizeCvDocument(raw);
      if (!document) {
        error =
          "The saved CV has an unexpected structure. Start a new CV or restore a backup.";
        reportDataIssue(fileName(applicationId), error);
      }
    }
    set((state) => ({
      documents: document
        ? { ...state.documents, [applicationId]: document }
        : state.documents,
      loaded: { ...state.loaded, [applicationId]: true },
      loading: { ...state.loading, [applicationId]: false },
      errors: { ...state.errors, [applicationId]: error },
    }));
  },

  saveCv: async (applicationId) => {
    const current = get().documents[applicationId];
    if (!current) return false;
    const document = { ...current, updatedAt: new Date().toISOString() };
    set((state) => ({
      saving: { ...state.saving, [applicationId]: true },
    }));
    const ok = await saveJson(fileName(applicationId), document);
    set((state) => ({
      documents: ok
        ? { ...state.documents, [applicationId]: document }
        : state.documents,
      saving: { ...state.saving, [applicationId]: false },
      errors: {
        ...state.errors,
        [applicationId]: ok
          ? null
          : "Could not save the CV to the data folder.",
      },
    }));
    return ok;
  },

  setCv: (applicationId, document) => {
    set((state) => ({
      documents: { ...state.documents, [applicationId]: document },
      loaded: { ...state.loaded, [applicationId]: true },
      errors: { ...state.errors, [applicationId]: null },
      generationErrors: { ...state.generationErrors, [applicationId]: null },
    }));
    scheduleSave(applicationId);
  },

  updateCv: (applicationId, updater) => {
    const current = get().documents[applicationId];
    if (!current) return;
    const next = { ...updater(current), updatedAt: new Date().toISOString() };
    set((state) => ({
      documents: { ...state.documents, [applicationId]: next },
      errors: { ...state.errors, [applicationId]: null },
    }));
    scheduleSave(applicationId);
  },

  generateCv: async ({ application, profile, config, options }) => {
    controllers.get(application.id)?.abort();
    const controller = new AbortController();
    controllers.set(application.id, controller);
    set((state) => ({
      generating: { ...state.generating, [application.id]: true },
      generationErrors: { ...state.generationErrors, [application.id]: null },
    }));
    try {
      const document = await generateCvDocument({
        application,
        profile,
        config,
        options,
        signal: controller.signal,
      });
      set((state) => ({
        documents: { ...state.documents, [application.id]: document },
        loaded: { ...state.loaded, [application.id]: true },
      }));
      await get().saveCv(application.id);
      return true;
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return false;
      }
      set((state) => ({
        generationErrors: {
          ...state.generationErrors,
          [application.id]: errorText(error),
        },
      }));
      return false;
    } finally {
      if (controllers.get(application.id) === controller) {
        controllers.delete(application.id);
      }
      set((state) => ({
        generating: { ...state.generating, [application.id]: false },
      }));
    }
  },

  cancelGeneration: (applicationId) => {
    controllers.get(applicationId)?.abort();
    controllers.delete(applicationId);
  },

  deleteCv: async (applicationId) => {
    controllers.get(applicationId)?.abort();
    controllers.delete(applicationId);
    const timer = saveTimers.get(applicationId);
    if (timer) {
      clearTimeout(timer);
      saveTimers.delete(applicationId);
    }
    await deleteFile(fileName(applicationId));
    set((state) => {
      const documents = { ...state.documents };
      delete documents[applicationId];
      return {
        documents,
        loaded: { ...state.loaded, [applicationId]: false },
      };
    });
  },

  resetCache: () => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    for (const timer of saveTimers.values()) clearTimeout(timer);
    saveTimers.clear();
    set({
      documents: {},
      loaded: {},
      loading: {},
      saving: {},
      errors: {},
      generating: {},
      generationErrors: {},
    });
  },
}));
