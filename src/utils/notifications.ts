import type { JobApplication } from "@/types";
import { isArchivedStatus } from "@/utils/applicationStatus";
import { daysBetween, parseDateOnly } from "@/utils/pipelineStats";

/**
 * Due items worth an OS reminder: deadlines and follow-ups that are overdue,
 * due today, or due tomorrow. Archived applications are skipped because their
 * old dates would otherwise keep firing forever.
 */
export interface DueNotification {
  applicationId: string;
  companyName: string;
  jobTitle: string;
  kind: "deadline" | "followUp";
  /** Stored `YYYY-MM-DD` date. */
  date: string;
  /** Negative when overdue, 0 today, 1 tomorrow. */
  daysUntil: number;
}

/** Only the near window is worth interrupting the user about. */
export const NOTIFICATION_WINDOW_DAYS = 1;

export function collectDueNotifications(
  applications: JobApplication[],
  now: Date = new Date(),
): DueNotification[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items: DueNotification[] = [];
  for (const application of applications) {
    if (isArchivedStatus(application.status)) continue;
    const dueDates: { kind: DueNotification["kind"]; value: string }[] = [
      { kind: "deadline", value: application.deadline },
      { kind: "followUp", value: application.followUpAt },
    ];
    for (const { kind, value } of dueDates) {
      const date = parseDateOnly(value);
      if (!date) continue;
      const daysUntil = daysBetween(today, date);
      if (daysUntil > NOTIFICATION_WINDOW_DAYS) continue;
      items.push({
        applicationId: application.id,
        companyName: application.companyName.trim(),
        jobTitle: application.jobTitle.trim(),
        kind,
        date: value,
        daysUntil,
      });
    }
  }
  return items.sort(
    (a, b) =>
      a.daysUntil - b.daysUntil ||
      a.companyName.localeCompare(b.companyName, undefined, {
        sensitivity: "base",
      }) ||
      a.kind.localeCompare(b.kind),
  );
}

/** One notification per application, kind and due date per day. */
export function notificationKey(item: DueNotification): string {
  return `${item.applicationId}:${item.kind}:${item.date}`;
}

/** Local calendar day key (`YYYY-MM-DD`), matching the stored due dates. */
export function localDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Items that have not already been notified on the current day. */
export function freshDueNotifications(
  items: DueNotification[],
  notifiedKeys: readonly string[],
): DueNotification[] {
  const notified = new Set(notifiedKeys);
  return items.filter((item) => !notified.has(notificationKey(item)));
}

/** The ledger only applies to the day it was written for. */
export function notifiedKeysForDay(
  log: { day: string; keys: string[] },
  day: string,
): string[] {
  return log.day === day ? log.keys : [];
}

function duePhrase(daysUntil: number): string {
  if (daysUntil < 0) {
    const days = Math.abs(daysUntil);
    return `overdue by ${days} ${days === 1 ? "day" : "days"}`;
  }
  return daysUntil === 0 ? "today" : "tomorrow";
}

export function notificationTitle(item: DueNotification): string {
  const label = item.kind === "deadline" ? "Deadline" : "Follow-up";
  const company = item.companyName || "Untitled application";
  return `${label} ${duePhrase(item.daysUntil)} — ${company}`;
}

export function notificationBody(item: DueNotification): string {
  const when = duePhrase(item.daysUntil);
  const kindLabel =
    item.kind === "deadline" ? "application deadline" : "follow-up";
  const job = item.jobTitle ? `${item.jobTitle} · ` : "";
  return `${job}${kindLabel} ${when} (${item.date}).`;
}

/** One toast per check: a busy week must not flood the notification centre. */
export function buildReminderNotification(items: DueNotification[]): {
  title: string;
  body: string;
} {
  if (items.length === 1) {
    return {
      title: notificationTitle(items[0]),
      body: notificationBody(items[0]),
    };
  }
  const shown = items.slice(0, 4).map((item) => {
    const label = item.kind === "deadline" ? "Deadline" : "Follow-up";
    return `${item.companyName || "Untitled application"} — ${label} ${duePhrase(item.daysUntil)}`;
  });
  const remaining = items.length - shown.length;
  if (remaining > 0) shown.push(`and ${remaining} more`);
  return {
    title: `${items.length} applications need attention`,
    body: shown.join("\n"),
  };
}
