import { useEffect } from "react";
import { useApplicationStore } from "@/stores/applicationStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { isTauriRuntime } from "@/utils/runtime";
import {
  buildReminderNotification,
  collectDueNotifications,
  freshDueNotifications,
  localDateKey,
  notificationKey,
  notifiedKeysForDay,
} from "@/utils/notifications";
import { sendDesktopNotification } from "@/utils/notificationClient";

/** Let first paint and the startup update check settle before interrupting. */
const FIRST_CHECK_DELAY_MS = 10_000;
/** New due items are rare; half-hourly is enough and cheap. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * While the app is open and the user opted in, announce overdue / due-today /
 * due-tomorrow items at most once per item per local day. No OS notification
 * is scheduled while the app is closed; the in-app badges remain the fallback.
 */
export function useDueNotificationSweep(): void {
  const settingsLoaded = useSettingsStore((s) => s.isLoaded);
  const enabled = useSettingsStore((s) => s.notificationsEnabled);
  const applicationsLoaded = useApplicationStore((s) => s.isLoaded);
  const loadApplications = useApplicationStore((s) => s.loadApplications);

  // Reminders need the application list even when the session starts on a tab
  // that does not load it itself.
  useEffect(() => {
    if (settingsLoaded && enabled && !applicationsLoaded) {
      void loadApplications();
    }
  }, [settingsLoaded, enabled, applicationsLoaded, loadApplications]);

  useEffect(() => {
    if (!settingsLoaded || !enabled || !applicationsLoaded) return;
    if (!isTauriRuntime()) return;

    let cancelled = false;
    let running = false;

    const run = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        const settings = useSettingsStore.getState();
        if (!settings.notificationsEnabled) return;
        const applications = useApplicationStore.getState().applications;
        const now = new Date();
        const today = localDateKey(now);
        const notifiedKeys = notifiedKeysForDay(
          settings.notificationLog,
          today,
        );
        const fresh = freshDueNotifications(
          collectDueNotifications(applications, now),
          notifiedKeys,
        );
        if (fresh.length === 0) return;

        const { title, body } = buildReminderNotification(fresh);
        const sent = await sendDesktopNotification(title, body);
        if (!sent || cancelled) return;

        // Only advance the ledger after the OS accepted the notification, so
        // a failed send is retried on the next sweep instead of being lost.
        useSettingsStore
          .getState()
          .markNotificationsSent(today, [
            ...notifiedKeys,
            ...fresh.map(notificationKey),
          ]);
      } finally {
        running = false;
      }
    };

    const first = window.setTimeout(() => void run(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void run(), CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [settingsLoaded, enabled, applicationsLoaded]);
}
