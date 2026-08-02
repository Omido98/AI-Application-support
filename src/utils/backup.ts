import { saveJson, loadJson } from "@/utils/storage";

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
  "zen-prices.json",
] as const;

/** Only these safe file names are accepted when restoring a backup. */
const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+\.json$/;

export async function buildBackupBundle(): Promise<BackupBundle> {
  const files: Record<string, unknown> = {};

  for (const name of STATIC_FILE_NAMES) {
    const data = await loadJson<unknown>(name);
    if (data != null) files[name] = data;
  }

  // One chat thread per application
  const applications = files["applications.json"] as
    | { applications?: Array<{ id: string }> }
    | undefined;
  for (const app of applications?.applications ?? []) {
    const name = `chat_${app.id}.json`;
    const data = await loadJson<unknown>(name);
    if (data != null) files[name] = data;
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
    return parsed;
  } catch {
    return null;
  }
}

/** Write every file of the bundle back to the data directory. */
export async function restoreBackupBundle(
  bundle: BackupBundle,
): Promise<string[]> {
  const restored: string[] = [];
  for (const [name, data] of Object.entries(bundle.files)) {
    if (!SAFE_NAME_RE.test(name)) continue;
    await saveJson(name, data);
    restored.push(name);
  }
  return restored;
}
