/**
 * Whether the app is running inside a Tauri webview.
 *
 * Browser-mode (`npm run dev` in a plain browser) is still useful for UI work,
 * so persistence and link handling keep a localStorage / window.open fallback.
 * Everything else must treat a Tauri command failure as a real failure instead
 * of silently falling back to a second data store.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
