import type { CvDocument, CvSnapshot } from "@/types/cv";
import { newMessageId } from "@/utils/ids";
import { normalizeCvDocument } from "@/utils/cvSchema";

export const MAX_CV_HISTORY = 5;
export const CV_HISTORY_SCHEMA_VERSION = 1;

interface CvHistoryFile {
  schemaVersion: 1;
  snapshots: unknown[];
}

export function cvHistoryFileName(applicationId: string): string {
  return `cv_history_${applicationId}.json`;
}

/** Deep-clone a document so later edits cannot mutate the snapshot. */
export function cloneCvDocument(document: CvDocument): CvDocument {
  return JSON.parse(JSON.stringify(document)) as CvDocument;
}

export function createCvSnapshot(
  document: CvDocument,
  label: string,
  now: Date = new Date(),
): CvSnapshot {
  return {
    id: newMessageId(),
    savedAt: now.toISOString(),
    label,
    document: cloneCvDocument(document),
  };
}

/** Newest first, valid documents only, capped at MAX_CV_HISTORY. */
export function normalizeCvHistory(value: unknown): CvSnapshot[] {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const raw = Array.isArray(record?.snapshots) ? record.snapshots : value;
  if (!Array.isArray(raw)) return [];

  const snapshots: CvSnapshot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const document = normalizeCvDocument(entry.document);
    if (!document) continue;
    const savedAt =
      typeof entry.savedAt === "string" &&
      !Number.isNaN(new Date(entry.savedAt).getTime())
        ? entry.savedAt
        : new Date().toISOString();
    snapshots.push({
      id: typeof entry.id === "string" && entry.id ? entry.id : newMessageId(),
      savedAt,
      label:
        typeof entry.label === "string" && entry.label.trim()
          ? entry.label.trim().slice(0, 120)
          : "Previous version",
      document,
    });
  }

  return snapshots
    .sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
    .slice(0, MAX_CV_HISTORY);
}

export function serializeCvHistory(snapshots: CvSnapshot[]): CvHistoryFile {
  return {
    schemaVersion: CV_HISTORY_SCHEMA_VERSION,
    snapshots,
  };
}
