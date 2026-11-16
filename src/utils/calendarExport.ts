import { invoke } from "@tauri-apps/api/core";
import type { JobApplication } from "@/types";
import { isArchivedStatus, STATUS_LABELS } from "@/utils/applicationStatus";
import { parseDateOnly } from "@/utils/pipelineStats";
import { isTauriRuntime } from "@/utils/runtime";

/** All-day calendar entry derived from a deadline or follow-up date. */
export interface CalendarEvent {
  uid: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  summary: string;
  description: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** UTC timestamp in the iCalendar `YYYYMMDDTHHMMSSZ` form. */
function icsTimestamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
      date.getUTCDate(),
    )}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
      date.getUTCSeconds(),
    )}Z`
  );
}

function icsDate(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}`;
}

function saveDateName(date: Date): string {
  return localDateString(date);
}

function companyLabel(application: JobApplication): string {
  return application.companyName.trim() || "Untitled application";
}

/**
 * Future deadlines and follow-ups for active applications, sorted by date.
 * Archived applications are skipped; past dates are not useful in a calendar.
 */
export function getCalendarEvents(
  applications: JobApplication[],
  now: Date = new Date(),
): CalendarEvent[] {
  const today = startOfDay(now);
  const events: CalendarEvent[] = [];

  for (const application of applications) {
    if (isArchivedStatus(application.status)) continue;
    const company = companyLabel(application);
    const role = application.jobTitle.trim();
    const title = role ? `${company} — ${role}` : company;
    const descriptionLines = [`Status: ${STATUS_LABELS[application.status]}`];
    if (application.applicationUrl.trim()) {
      descriptionLines.push(
        `Application: ${application.applicationUrl.trim()}`,
      );
    }

    for (const kind of ["deadline", "followUp"] as const) {
      const value =
        kind === "deadline" ? application.deadline : application.followUpAt;
      const date = parseDateOnly(value);
      if (!date || date.getTime() < today.getTime()) continue;
      events.push({
        uid: `${application.id}-${kind}@ai-application-support`,
        date: localDateString(date),
        summary: `${kind === "deadline" ? "Deadline" : "Follow-up"}: ${title}`,
        description: descriptionLines.join("\n"),
      });
    }
  }

  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.summary.localeCompare(b.summary, undefined, { sensitivity: "base" }),
  );
}

export function countCalendarEvents(
  applications: JobApplication[],
  now: Date = new Date(),
): number {
  return getCalendarEvents(applications, now).length;
}

/** Escape text for an iCalendar TEXT value (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line at 75 UTF-8 octets. Continuation lines start with one
 * space, which counts toward their own 75-octet limit.
 */
export function foldIcsLine(line: string): string[] {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let bytes = 0;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    const limit = lines.length === 0 ? 75 : 74;
    if (bytes + characterBytes > limit && current) {
      lines.push(current);
      current = character;
      bytes = characterBytes;
    } else {
      current += character;
      bytes += characterBytes;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines.map((part, index) => (index === 0 ? part : ` ${part}`));
}

function addOneDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

/** Build a complete VCALENDAR document with CRLF line endings. */
export function buildCalendarIcs(
  events: CalendarEvent[],
  now: Date = new Date(),
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI Application Support//Calendar export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    const date = parseDateOnly(event.date);
    if (!date) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${icsTimestamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(date)}`,
      `DTEND;VALUE=DATE:${icsDate(addOneDay(date))}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
      "STATUS:CONFIRMED",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.flatMap((line) => foldIcsLine(line)).join("\r\n") + "\r\n";
}

/**
 * Save all future deadlines/follow-ups as an .ics file. Returns null when
 * there is nothing to export or the user cancels the save dialog.
 */
export async function exportCalendarIcs(
  applications: JobApplication[],
  now: Date = new Date(),
): Promise<string | null> {
  const events = getCalendarEvents(applications, now);
  if (events.length === 0) return null;
  const contents = buildCalendarIcs(events, now);
  const defaultName = `applications-calendar-${saveDateName(now)}.ics`;

  if (!isTauriRuntime()) {
    const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = defaultName;
    anchor.click();
    URL.revokeObjectURL(url);
    return defaultName;
  }

  return invoke<string | null>("export_ics_file", {
    defaultName,
    contents,
  });
}
