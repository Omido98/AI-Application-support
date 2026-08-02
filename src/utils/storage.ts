import {
  readTextFile,
  writeTextFile,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";

/**
 * Save a JSON-serializable value to a file inside the app's data directory.
 * If the Tauri FS plugin is unavailable (e.g., in a browser), falls back to localStorage.
 */
export async function saveJson<T>(path: string, data: T): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  try {
    await writeTextFile(path, json, { baseDir: BaseDirectory.AppData });
  } catch {
    // Fallback for non-Tauri environments (dev in browser)
    localStorage.setItem(`aas:${path}`, json);
  }
}

/**
 * Load a JSON value from a file inside the app's data directory.
 * Returns `null` if the file does not exist or cannot be parsed.
 */
export async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const content = await readTextFile(path, { baseDir: BaseDirectory.AppData });
    return JSON.parse(content) as T;
  } catch {
    // Fallback for non-Tauri environments
    const raw = localStorage.getItem(`aas:${path}`);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Delete a file from the app's data directory.
 * If the Tauri FS plugin is unavailable (e.g., in a browser), falls back to localStorage.
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    await remove(path, { baseDir: BaseDirectory.AppData });
  } catch {
    // Fallback for non-Tauri environments (dev in browser)
    localStorage.removeItem(`aas:${path}`);
  }
}
