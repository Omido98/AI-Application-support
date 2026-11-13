import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/utils/runtime";

/**
 * Backup file dialogs and IO.
 *
 * The desktop path is deliberately implemented as Rust commands that open the
 * native dialog and read/write the selected file themselves. The webview never
 * receives a filesystem path it could use to read or overwrite files, which is
 * why the broad `$HOME/**` fs capability can stay removed.
 *
 * Browser dev mode keeps a download/upload fallback so the rest of Settings
 * remains usable without Tauri.
 */

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "Unknown backup file error.";
}

/** Save a backup. Returns the chosen path, or null when the user cancelled. */
export async function exportBackupFile(
  defaultName: string,
  contents: string,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = defaultName;
    link.click();
    URL.revokeObjectURL(url);
    return defaultName;
  }

  try {
    return await invoke<string | null>("export_backup_file", {
      defaultName,
      contents,
    });
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}

/** Open a backup. Returns its text, or null when the user cancelled. */
export async function importBackupFile(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        void file.text().then(resolve, () => resolve(null));
      };
      input.click();
    });
  }

  try {
    return await invoke<string | null>("import_backup_file");
  } catch (err) {
    throw new Error(errorMessage(err));
  }
}
