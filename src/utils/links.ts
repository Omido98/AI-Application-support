import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "@/utils/runtime";

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Whether a link may be handed to the operating system. Keeping this narrow
 * blocks `file:`, `javascript:` and custom-scheme payloads from being passed to
 * the opener plugin.
 */
export function isSafeExternalUrl(raw: string | null | undefined): raw is string {
  if (!raw) return false;
  try {
    return SAFE_EXTERNAL_PROTOCOLS.has(new URL(raw).protocol);
  } catch {
    return false;
  }
}

/**
 * Open a link in the user's browser/mail client. Returns false when the URL was
 * rejected, so callers can decide whether to show feedback.
 */
export function openExternalUrl(raw: string): boolean {
  if (!isSafeExternalUrl(raw)) return false;

  if (!isTauriRuntime()) {
    window.open(raw, "_blank", "noopener,noreferrer");
    return true;
  }

  void openUrl(raw).catch((err) => {
    console.error(`[links] Could not open ${raw}:`, err);
    // Last resort for environments where the opener plugin is unavailable.
    window.open(raw, "_blank", "noopener,noreferrer");
  });
  return true;
}
