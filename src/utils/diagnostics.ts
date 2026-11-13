import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/utils/runtime";

export type LogLevel = "info" | "warn" | "error";

/**
 * Append a line to the app's local log file. Logging is best-effort by
 * design: a failure to write diagnostics must never break the feature that was
 * being reported, so this function never throws.
 */
export async function logToFile(
  message: string,
  level: LogLevel = "error",
): Promise<void> {
  if (!isTauriRuntime()) {
    if (level === "error") console.error(`[app] ${message}`);
    else if (level === "warn") console.warn(`[app] ${message}`);
    return;
  }
  try {
    await invoke("frontend_log", { level, message });
  } catch {
    // Deliberately ignored — see the doc comment.
  }
}

/** Fire-and-forget variant for synchronous error paths. */
export function logToFileInBackground(
  message: string,
  level: LogLevel = "error",
): void {
  void logToFile(message, level);
}

/**
 * Ask Rust for a diagnostics report (versions, paths, data-file inventory and
 * the recent log tail) and copy it to the clipboard. Contains no API keys or
 * chat contents.
 */
export async function copyDiagnostics(): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("Diagnostics are only available in the desktop app.");
  }
  const text = await invoke<string>("get_diagnostics");
  await writeClipboard(text);
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Some webviews deny the async clipboard API; fall back to the legacy
    // selection-based copy, which still works inside a user gesture.
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    if (!document.execCommand("copy")) {
      throw new Error("Could not copy to the clipboard.");
    }
  } finally {
    document.body.removeChild(area);
  }
}
