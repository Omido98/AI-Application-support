# Deadline reminders

Desktop notifications for job-application deadlines and follow-ups are
optional and off by default. Turn them on in **Settings → Deadline reminders**
and use **Send test notification** to check that your system accepts them.

## What triggers a reminder

At startup (after a short delay) and every 30 minutes while the app is open,
the app looks for non-archived applications with a `deadline` or `followUpAt`
date that is **overdue, due today, or due tomorrow**. Archived applications
(Offer / Rejected) are skipped.

- One combined notification is sent per check, not one per item, so a busy week
  cannot flood the notification centre. It shows up to four items and
  "and N more".
- Each item (application + kind + due date) is announced at most once per local
  calendar day. The ledger is stored in `settings.json`.
- Resolving or moving a due date creates a new item. An unresolved item is
  eligible again the next day, which makes the reminder a daily nudge rather
  than a one-off.
- Notifications only run **while the app is open**. There is no background
  service, tray, or OS-level scheduled task, so nothing fires when the app is
  closed. The in-app deadline badges remain the fallback.

## Privacy

The notification text includes the company name, job title and due date, so it
can appear on your lock screen. The reminder ledger contains only
`applicationId:kind:date` keys and lives in `settings.json`; it is included in
backups and removed by **Reset all data**. No chat or profile content is
included.

## Platform behaviour

### Windows

- Installed builds are attributed to **AI Application Support** through the
  app identifier (`com.ai-application-support.app`, stamped on the Start-menu
  shortcut by the installer). Notifications appear in Action Center.
- Development builds are deliberately attributed to **Windows PowerShell** by
  the plugin; that is expected in `npm run tauri dev`.
- **Focus Assist** and **Settings → System → Notifications** can suppress
  toasts silently. A portable/unpacked build without a registered shortcut has
  no app identity, so notifications may not appear — use the installer.
- Desktop Tauri always reports notification permission as granted; Windows
  does not show an in-app permission prompt.

### macOS

- Run the installed `.app` (from Applications or the DMG). The first
  notification adds the app to **System Settings → Notifications**, where you
  can allow or deny it.
- Development builds are attributed to **Terminal**, so Terminal itself needs
  notification permission for a test to appear.
- There is no in-app permission prompt; denial is silent to the app. Check
  System Settings if nothing appears. A Focus mode can also defer the toast.

### Linux

- Requires a session D-Bus and a notification daemon (GNOME Shell, KDE Plasma,
  dunst, mako, Xfce notifyd, …). Headless sessions, minimal WMs and some WSL
  setups have no daemon, so notifications are silently dropped.
- The notification is shown under the executable name
  (`ai-application-support`) rather than the product name.
- Most Linux notification daemons do not keep a persistent history.

### All platforms

Delivery is fire-and-forget: the app cannot confirm that the OS actually
displayed a toast. A failed send is not recorded in the daily ledger, so the
next check retries it.

## Troubleshooting

| Symptom                         | Platform | Check                                                                                             |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| No toast at all                 | Windows  | Installer (not portable), Focus Assist, per-app notifications, test button                        |
| Toast says "Windows PowerShell" | Windows  | Expected in development builds; install the app to get its identity                               |
| No toast                        | macOS    | App opened from `/Applications`; Terminal allowed in development; System Settings → Notifications |
| No toast                        | Linux    | `notify-send` works? Is a notification daemon running? Is `DBUS_SESSION_BUS_ADDRESS` set?         |
| Duplicate after restart         | All      | The ledger is saved immediately after a successful send; a crash in between can repeat one toast  |
| Toggle turns itself off         | All      | Permission was denied or unavailable; the UI explains why                                         |

## Developer notes

- Versions are pinned on purpose: **Rust `tauri-plugin-notification = "=2.4.0"`**
  and **JS `@tauri-apps/plugin-notification` 2.4.0**. Newer plugin releases
  require Tauri 2.12, while this app is on the 2.11 line. The Windows
  `isPermissionGranted()` bug in 2.4.0 does not affect this app because sending
  is not gated on that check.
- The capability grants only three permissions:
  `notification:allow-is-permission-granted`,
  `notification:allow-request-permission`, `notification:allow-notify`.
- `src/utils/notificationClient.ts` is the only module that imports the plugin.
  It returns `unsupported` outside Tauri, so browser-mode Playwright and Vitest
  never prompt or hang.
- `src/utils/notifications.ts` is pure and clock-injectable; the sweep lives in
  `src/hooks/useDueNotificationSweep.ts`.
- Manual smoke is required per OS because CI cannot observe a native toast:
  enable, send a test, confirm the identity and delivery, then restart the same
  day and confirm there is no duplicate.
