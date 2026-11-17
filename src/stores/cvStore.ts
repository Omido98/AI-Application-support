import { create } from "zustand";
import type { JobApplication, ProfileData } from "@/types";
import type { CvDocument, CvSnapshot } from "@/types/cv";
import type { ApiConfig } from "@/stores/chatStore";
import {
  deleteFile,
  loadJson,
  reportDataIssue,
  saveJson,
} from "@/utils/storage";
import { normalizeCvDocument } from "@/utils/cvSchema";
import {
  MAX_CV_HISTORY,
  cloneCvDocument,
  createCvSnapshot,
  cvHistoryFileName,
  normalizeCvHistory,
  serializeCvHistory,
} from "@/utils/cvHistory";
import {
  CvGenerationError,
  generateCvDocument,
  type CvGenerationOptions,
} from "@/utils/cvGeneration";
import { flushPendingEdits } from "@/utils/pendingEdits";

interface CvState {
  documents: Record<string, CvDocument>;
  history: Record<string, CvSnapshot[]>;
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
  snapshotCurrent: (applicationId: string, label: string) => Promise<void>;
  restoreSnapshot: (applicationId: string, snapshotId: string) => Promise<void>;
  generateCv: (args: {
    application: JobApplication;
    profile: ProfileData;
    config: ApiConfig;
    options: CvGenerationOptions;
  }) => Promise<CvDocument | null>;
  applyGeneratedCv: (
    applicationId: string,
    document: CvDocument,
  ) => Promise<CvDocument | null>;
  cancelGeneration: (applicationId: string) => void;
  deleteCv: (applicationId: string) => Promise<void>;
  resetCache: () => void;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const controllers = new Map<string, AbortController>();
/** Per-application document revision, bumped on every in-memory mutation. */
const revisions = new Map<string, number>();
/** Per-application promise chain so only one write runs at a time. */
const saveQueues = new Map<string, Promise<boolean>>();
/** Applications whose files must not be recreated by a late save. */
const deletedApplications = new Set<string>();

function bumpRevision(applicationId: string): number {
  const next = (revisions.get(applicationId) ?? 0) + 1;
  revisions.set(applicationId, next);
  return next;
}

function fileName(applicationId: string): string {
  return `cv_${applicationId}.json`;
}

function errorText(error: unknown): string {
  if (error instanceof CvGenerationError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function scheduleSave(applicationId: string) {
  if (deletedApplications.has(applicationId)) return;
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
  flushPendingEdits();
  for (const timer of saveTimers.values()) clearTimeout(timer);
  saveTimers.clear();
  const state = useCvStore.getState();
  const ids = Object.keys(state.documents);
  const results = await Promise.all(ids.map((id) => state.saveCv(id)));
  return results.every(Boolean);
}

export const useCvStore = create<CvState>((set, get) => ({
  documents: {},
  history: {},
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
    const [raw, rawHistory] = await Promise.all([
      loadJson<unknown>(fileName(applicationId)),
      loadJson<unknown>(cvHistoryFileName(applicationId)),
    ]);
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
    const history = normalizeCvHistory(rawHistory);
    if (rawHistory != null && history.length === 0) {
      reportDataIssue(
        cvHistoryFileName(applicationId),
        "The saved CV history was unreadable and was ignored.",
      );
    }
    if (document) {
      deletedApplications.delete(applicationId);
      revisions.set(applicationId, 0);
    }
    set((state) => ({
      documents: document
        ? { ...state.documents, [applicationId]: document }
        : state.documents,
      history: { ...state.history, [applicationId]: history },
      loaded: { ...state.loaded, [applicationId]: true },
      loading: { ...state.loading, [applicationId]: false },
      errors: { ...state.errors, [applicationId]: error },
    }));
  },

  saveCv: async (applicationId) => {
    const current = get().documents[applicationId];
    if (!current || deletedApplications.has(applicationId)) return false;

    set((state) => ({
      saving: { ...state.saving, [applicationId]: true },
    }));

    const previous = saveQueues.get(applicationId) ?? Promise.resolve(true);
    const queued = previous.then(async (): Promise<boolean> => {
      if (deletedApplications.has(applicationId)) return false;
      const latest = get().documents[applicationId];
      if (!latest) return false;

      const revision = revisions.get(applicationId) ?? 0;
      const document = { ...latest, updatedAt: new Date().toISOString() };
      const ok = await saveJson(fileName(applicationId), document);

      // A delete may have happened while the write was in flight. The delete
      // path waits for this queue and removes the files afterwards.
      if (deletedApplications.has(applicationId)) return false;

      set((state) => ({
        documents:
          ok && (revisions.get(applicationId) ?? 0) === revision
            ? { ...state.documents, [applicationId]: document }
            : state.documents,
        errors: {
          ...state.errors,
          [applicationId]: ok
            ? null
            : "Could not save the CV to the data folder.",
        },
      }));
      return ok;
    });
    saveQueues.set(applicationId, queued);
    void queued.then(() => {
      if (saveQueues.get(applicationId) === queued) {
        saveQueues.delete(applicationId);
        set((state) => ({
          saving: { ...state.saving, [applicationId]: false },
        }));
      }
    });
    return queued;
  },

  setCv: (applicationId, document) => {
    deletedApplications.delete(applicationId);
    bumpRevision(applicationId);
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
    bumpRevision(applicationId);
    const next = { ...updater(current), updatedAt: new Date().toISOString() };
    set((state) => ({
      documents: { ...state.documents, [applicationId]: next },
      errors: { ...state.errors, [applicationId]: null },
    }));
    scheduleSave(applicationId);
  },

  snapshotCurrent: async (applicationId, label) => {
    const current = get().documents[applicationId];
    if (!current) return;
    const snapshot = createCvSnapshot(current, label);
    const history = [snapshot, ...(get().history[applicationId] ?? [])].slice(
      0,
      MAX_CV_HISTORY,
    );
    set((state) => ({
      history: { ...state.history, [applicationId]: history },
    }));
    const ok = await saveJson(
      cvHistoryFileName(applicationId),
      serializeCvHistory(history),
    );
    if (!ok) {
      set((state) => ({
        errors: {
          ...state.errors,
          [applicationId]: "Could not save the CV version history.",
        },
      }));
    }
  },

  restoreSnapshot: async (applicationId, snapshotId) => {
    const target = (get().history[applicationId] ?? []).find(
      (snapshot) => snapshot.id === snapshotId,
    );
    if (!target) return;
    const restored = cloneCvDocument(target.document);
    await get().snapshotCurrent(applicationId, "Before restoring a version");
    bumpRevision(applicationId);
    set((state) => ({
      documents: { ...state.documents, [applicationId]: restored },
      loaded: { ...state.loaded, [applicationId]: true },
      errors: { ...state.errors, [applicationId]: null },
    }));
    await get().saveCv(applicationId);
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
      return await generateCvDocument({
        application,
        profile,
        config,
        options,
        signal: controller.signal,
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        return null;
      }
      set((state) => ({
        generationErrors: {
          ...state.generationErrors,
          [application.id]: errorText(error),
        },
      }));
      return null;
    } finally {
      if (controllers.get(application.id) === controller) {
        controllers.delete(application.id);
      }
      set((state) => ({
        generating: { ...state.generating, [application.id]: false },
      }));
    }
  },

  applyGeneratedCv: async (applicationId, document) => {
    if (deletedApplications.has(applicationId)) return null;
    flushPendingEdits();
    const before = get().documents[applicationId] ?? null;
    if (before) {
      await get().snapshotCurrent(applicationId, "Before AI regeneration");
    }
    bumpRevision(applicationId);
    set((state) => ({
      documents: { ...state.documents, [applicationId]: document },
      loaded: { ...state.loaded, [applicationId]: true },
      errors: { ...state.errors, [applicationId]: null },
    }));
    await get().saveCv(applicationId);
    return before;
  },

  cancelGeneration: (applicationId) => {
    controllers.get(applicationId)?.abort();
    controllers.delete(applicationId);
  },

  deleteCv: async (applicationId) => {
    controllers.get(applicationId)?.abort();
    controllers.delete(applicationId);
    deletedApplications.add(applicationId);
    bumpRevision(applicationId);
    const timer = saveTimers.get(applicationId);
    if (timer) {
      clearTimeout(timer);
      saveTimers.delete(applicationId);
    }

    // Never delete underneath a write: wait for the queue, then remove files.
    const pending = saveQueues.get(applicationId);
    if (pending) {
      try {
        await pending;
      } catch {
        // A failed save must not prevent deletion.
      }
    }

    await deleteFile(fileName(applicationId));
    await deleteFile(cvHistoryFileName(applicationId));
    set((state) => {
      const documents = { ...state.documents };
      delete documents[applicationId];
      const history = { ...state.history };
      delete history[applicationId];
      return {
        documents,
        history,
        loaded: { ...state.loaded, [applicationId]: false },
      };
    });
  },

  resetCache: () => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
    for (const timer of saveTimers.values()) clearTimeout(timer);
    saveTimers.clear();
    for (const applicationId of Object.keys(get().documents)) {
      deletedApplications.add(applicationId);
      bumpRevision(applicationId);
    }
    saveQueues.clear();
    set({
      documents: {},
      history: {},
      loaded: {},
      loading: {},
      saving: {},
      errors: {},
      generating: {},
      generationErrors: {},
    });
  },
}));
