import {
  saveJson,
  loadJson,
  pruneOrphanChatFiles,
  pruneOrphanCvFiles,
} from "@/utils/storage";

/**
 * Backup & restore of all app data as a single JSON bundle.
 *
 * Export collects every data file (applications, chat threads, profile,
 * config, settings, cached Zen prices) into one object; import writes them
 * back and the stores are reloaded afterwards.
 */

export const BACKUP_FORMAT = "ai-application-support-backup";
export const BACKUP_VERSION = 1;

export interface BackupBundle {
  format: string;
  version: number;
  exportedAt: string;
  files: Record<string, unknown>;
}

/** Single-file data files included in every backup. */
const STATIC_FILE_NAMES = [
  "applications.json",
  "profile.json",
  "config.json",
  "settings.json",
  "drafts.json",
  "zen-prices.json",
] as const;

/** Only these safe file names are accepted when restoring a backup. */
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+\.json$/;

/** Application ids become part of a chat file name; only UUID-shaped ids are
 * ever accepted, so malformed data cannot traverse out of the data directory. */
const SAFE_APPLICATION_ID_RE = /^[a-zA-Z0-9-]+$/;

/** Credential fields that must never leave the machine in a backup file. */
const CONFIG_SECRET_FIELDS = [
  "apiKey",
  "keychainAccount",
  "sessionKeyOnly",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strip credential material from a config object. Used on export so a backup
 * never carries an API key, and on import so an older backup cannot put one
 * back into config.json.
 */
function redactConfig(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const redacted = { ...value };
  for (const field of CONFIG_SECRET_FIELDS) delete redacted[field];
  return redacted;
}

function fileForBackup(name: string, data: unknown): unknown {
  return name === "config.json" ? redactConfig(data) : data;
}

export async function buildBackupBundle(): Promise<BackupBundle> {
  const files: Record<string, unknown> = {};

  for (const name of STATIC_FILE_NAMES) {
    const data = await loadJson<unknown>(name);
    if (data != null) {
      const safe = fileForBackup(name, data);
      if (safe != null) files[name] = safe;
    }
  }

  // One chat thread and one CV draft per application
  const applications = files["applications.json"];
  const appList =
    isRecord(applications) && Array.isArray(applications.applications)
      ? applications.applications
      : [];
  for (const app of appList) {
    if (!isRecord(app) || typeof app.id !== "string") continue;
    if (!SAFE_APPLICATION_ID_RE.test(app.id)) continue;
    for (const prefix of ["chat", "cv"]) {
      const name = `${prefix}_${app.id}.json`;
      const data = await loadJson<unknown>(name);
      if (data != null) files[name] = data;
    }
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    files,
  };
}

/** Parse and validate a raw backup file. Returns null when not a backup. */
export function parseBackupBundle(raw: string): BackupBundle | null {
  try {
    const parsed = JSON.parse(raw) as BackupBundle;
    if (!parsed || parsed.format !== BACKUP_FORMAT) return null;
    if (typeof parsed.files !== "object" || parsed.files === null) return null;
    if (
      typeof parsed.version !== "number" ||
      parsed.version < 1 ||
      parsed.version > BACKUP_VERSION
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Application ids that will exist after this restore. When the bundle omits
 * applications.json the current file is kept, so its ids still count. */
async function restoredApplicationIds(bundle: BackupBundle): Promise<string[]> {
  const source =
    "applications.json" in bundle.files
      ? bundle.files["applications.json"]
      : await loadJson<unknown>("applications.json");
  const ids = new Set<string>();
  if (isRecord(source) && Array.isArray(source.applications)) {
    for (const app of source.applications) {
      if (
        isRecord(app) &&
        typeof app.id === "string" &&
        SAFE_APPLICATION_ID_RE.test(app.id)
      ) {
        ids.add(app.id);
      }
    }
  }
  return [...ids];
}

/** Drop draft entries whose application is no longer in the restored data. */
function draftsForApplications(
  data: unknown,
  applicationIds: string[],
): unknown {
  if (!isRecord(data)) return data;
  const valid = new Set(applicationIds);
  return Object.fromEntries(
    Object.entries(data).filter(([threadId]) => valid.has(threadId)),
  );
}

/** Write every file of the bundle back to the data directory. */
export async function restoreBackupBundle(
  bundle: BackupBundle,
): Promise<string[]> {
  const applicationIds = await restoredApplicationIds(bundle);
  const restored: string[] = [];
  for (const [name, data] of Object.entries(bundle.files)) {
    if (!SAFE_NAME_RE.test(name)) continue;
    const safe =
      name === "drafts.json"
        ? draftsForApplications(fileForBackup(name, data), applicationIds)
        : fileForBackup(name, data);
    if (safe == null) continue;
    await saveJson(name, safe);
    restored.push(name);
  }

  // Thread/CV files for applications that no longer exist would otherwise
  // stay on disk forever (and are not part of any backup either).
  await pruneOrphanChatFiles(applicationIds);
  await pruneOrphanCvFiles(applicationIds);
  return restored;
}
