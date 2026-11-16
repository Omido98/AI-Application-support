import { logToFileInBackground } from "@/utils/diagnostics";
import { isTauriRuntime } from "@/utils/runtime";

export type NotificationPermissionState = "granted" | "denied" | "unsupported";

/**
 * Check the current permission without prompting. Used by the periodic
 * deadline sweep so a revoked permission quietly falls back to in-app badges.
 */
export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isTauriRuntime()) return "unsupported";
  try {
    const { isPermissionGranted } =
      await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) ? "granted" : "denied";
  } catch (err) {
    logToFileInBackground(
      `[notifications] Could not read permission: ${
        err instanceof Error ? err.message : String(err)
      }`,
      "warn",
    );
    return "unsupported";
  }
}

/**
 * Ask the OS for notification permission. Only called when the user enables
 * the setting or presses the test button, never silently on startup.
 */
export async function ensureNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isTauriRuntime()) return "unsupported";
  try {
    const { isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) return "granted";
    const result = await requestPermission();
    return result === "granted" ? "granted" : "denied";
  } catch (err) {
    logToFileInBackground(
      `[notifications] Could not request permission: ${
        err instanceof Error ? err.message : String(err)
      }`,
      "warn",
    );
    return "unsupported";
  }
}

/**
 * Send one OS notification. Returns false when the plugin is unavailable or
 * the call throws.
 *
 * Delivery is intentionally not gated on `isPermissionGranted()`: desktop
 * Tauri always grants permission, and plugin 2.4.0 has a Windows bug where
 * that check can report false while notifications still work.
 */
export async function sendDesktopNotification(
  title: string,
  body: string,
): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { sendNotification } =
      await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
    return true;
  } catch (err) {
    logToFileInBackground(
      `[notifications] Could not send notification: ${
        err instanceof Error ? err.message : String(err)
      }`,
      "warn",
    );
    return false;
  }
}

/** Settings' "Test notification" action. */
export async function sendTestNotification(): Promise<boolean> {
  return sendDesktopNotification(
    "AI Application Support",
    "Notifications are working. Deadline and follow-up reminders will appear like this.",
  );
}
