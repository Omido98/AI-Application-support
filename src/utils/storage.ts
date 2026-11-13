import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/utils/runtime";
import { logToFileInBackground } from "@/utils/diagnostics";

/**
 * JSON persistence for the app's data directory.
 *
 * In Tauri, reads and writes go through Rust commands that use a synced
 * temporary file plus a `.bak` rotation, so a crash mid-write cannot truncate
 * the only copy. A damaged file is recovered from the backup and quarantined
 * by the backend; the resulting issue is surfaced in the UI instead of being
 * swallowed as "no data".
 *
 * Plain-browser mode keeps the old localStorage behavior for UI development.
 */

export type StorageIssueKind = "load" | "save" | "delete" | "recovery";

export interface StorageIssue {
  id: number;
  kind: StorageIssueKind;
  file: string;
  message: string;
  occurredAt: string;
}

/** A Rust `load_data_file` response. */
interface LoadDataFileResult {
  data: unknown;
  recovered: boolean;
  error: string | null;
}

const MAX_VISIBLE_ISSUES = 4;

let issues: StorageIssue[] = [];
let nextIssueId = 1;
const issueListeners = new Set<() => void>();

function notifyIssueListeners() {
  for (const listener of issueListeners) listener();
}

function reportIssue(
  kind: StorageIssueKind,
  file: string,
  message: string,
): void {
  const issue: StorageIssue = {
    id: nextIssueId++,
    kind,
    file,
    message,
    occurredAt: new Date().toISOString(),
  };
  issues = [...issues.slice(-(MAX_VISIBLE_ISSUES - 1)), issue];
  notifyIssueListeners();
  // Keep a durable trail in the log file so "Copy diagnostics" can explain a
  // failure that the user dismissed long ago.
  logToFileInBackground(
    `[storage:${kind}] ${file}: ${message}`,
    kind === "recovery" ? "warn" : "error",
  );
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Unknown storage error.";
}

/** Subscribe to storage issues (used by the global alert banner). */
export function subscribeStorageIssues(listener: () => void): () => void {
  issueListeners.add(listener);
  return () => {
    issueListeners.delete(listener);
  };
}

/** Current storage issues. The array identity is stable between changes. */
export function getStorageIssues(): readonly StorageIssue[] {
  return issues;
}

export function dismissStorageIssue(id: number): void {
  const next = issues.filter((issue) => issue.id !== id);
  if (next.length !== issues.length) {
    issues = next;
    notifyIssueListeners();
  }
}

/** Clear every issue (used after the user has acknowledged them). */
export function clearStorageIssues(): void {
  if (issues.length > 0) {
    issues = [];
    notifyIssueListeners();
  }
}

/**
 * Report a schema problem found after a successful read (for example valid
 * JSON whose top-level shape is wrong). The file itself is handled by the
 * loader; this only makes the problem visible instead of silently using an
 * empty default.
 */
export function reportDataIssue(file: string, message: string): void {
  reportIssue("load", file, message);
}

/**
 * Save a JSON-serializable value to a file inside the app's data directory.
 * Returns false when the write failed; the failure is also reported through
 * the storage-issue channel so the UI can warn the user.
 */
export async function saveJson<T>(path: string, data: T): Promise<boolean> {
  if (!isTauriRuntime()) {
    try {
      localStorage.setItem(`aas:${path}`, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      reportIssue("save", path, errorMessage(err));
      return false;
    }
  }

  try {
    await invoke("save_data_file", { name: path, data });
    return true;
  } catch (err) {
    reportIssue("save", path, errorMessage(err));
    console.error(`[storage] Could not save ${path}:`, err);
    return false;
  }
}

/**
 * Load a JSON value from a file inside the app's data directory.
 * Returns `null` when the file does not exist or could not be recovered.
 * Recoveries and failures are reported through the storage-issue channel.
 */
export async function loadJson<T>(path: string): Promise<T | null> {
  if (!isTauriRuntime()) {
    const raw = localStorage.getItem(`aas:${path}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      reportIssue("load", path, `Stored browser data is not valid JSON: ${errorMessage(err)}`);
      return null;
    }
  }

  try {
    const result = await invoke<LoadDataFileResult>("load_data_file", {
      name: path,
    });
    if (result.recovered) {
      reportIssue(
        "recovery",
        path,
        "The main data file was missing or damaged. It was restored from the backup copy.",
      );
    }
    if (result.error) {
      reportIssue("load", path, result.error);
      console.error(`[storage] Could not load ${path}: ${result.error}`);
    }
    return (result.data as T | null) ?? null;
  } catch (err) {
    reportIssue("load", path, errorMessage(err));
    console.error(`[storage] Could not load ${path}:`, err);
    return null;
  }
}

/**
 * Delete a data file and its backup copy. Missing files are not an error.
 * Returns false when a delete failed.
 */
export async function deleteFile(path: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    localStorage.removeItem(`aas:${path}`);
    return true;
  }

  try {
    await invoke("delete_data_file", { name: path });
    return true;
  } catch (err) {
    reportIssue("delete", path, errorMessage(err));
    console.error(`[storage] Could not delete ${path}:`, err);
    return false;
  }
}
