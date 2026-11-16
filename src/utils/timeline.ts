import { invoke } from "@tauri-apps/api/core";
import type { JobApplication } from "@/types";
import { STATUS_LABELS } from "@/utils/applicationStatus";
import { escapeCsv } from "@/utils/csv";
import { parseDateOnly } from "@/utils/pipelineStats";
import { isTauriRuntime } from "@/utils/runtime";

/** One row in an application's activity record. */
export interface TimelineRow {
  /** Milliseconds since epoch; used only for sorting. */
  timestamp: number;
  /** Local `YYYY-MM-DD` for date-only fields, `YYYY-MM-DD HH:mm` for timestamps. */
  date: string;
  event: string;
  status: string;
  detail: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseMoment(
  value: string,
): { timestamp: number; date: string } | null {
  if (!value) return null;
  if (DATE_ONLY_RE.test(value)) {
    const parsed = parseDateOnly(value);
    return parsed ? { timestamp: parsed.getTime(), date: value } : null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return { timestamp: parsed.getTime(), date: formatTimestamp(parsed) };
}

/**
 * Flatten an application's lifecycle into chronological rows: creation,
 * application date, every status change, deadline, follow-up and (when the
 * history is behind the current status) a final current-status row.
 */
export function getApplicationTimeline(
  application: JobApplication,
): TimelineRow[] {
  const rows: TimelineRow[] = [];

  const add = (
    value: string,
    event: string,
    status: string,
    detail: string,
  ) => {
    const moment = parseMoment(value);
    if (!moment) return;
    rows.push({ ...moment, event, status, detail });
  };

  add(application.createdAt, "Created", "", "");
  if (application.appliedAt) add(application.appliedAt, "Applied", "", "");

  const history = application.statusHistory
    .map((entry) => ({ entry, moment: parseMoment(entry.at) }))
    .filter(
      (
        item,
      ): item is {
        entry: JobApplication["statusHistory"][number];
        moment: { timestamp: number; date: string };
      } => item.moment !== null,
    )
    .sort((a, b) => a.moment.timestamp - b.moment.timestamp);

  history.forEach((item, index) => {
    const previous = history[index - 1];
    add(
      item.entry.at,
      "Status changed",
      STATUS_LABELS[item.entry.status],
      previous ? `From ${STATUS_LABELS[previous.entry.status]}` : "",
    );
  });

  if (application.deadline) add(application.deadline, "Deadline", "", "");
  if (application.followUpAt) {
    add(application.followUpAt, "Follow-up", "", "");
  }

  const lastHistoryStatus = history.at(-1)?.entry.status;
  if (lastHistoryStatus !== application.status) {
    add(
      application.updatedAt,
      "Current status",
      STATUS_LABELS[application.status],
      "",
    );
  }

  return rows.sort((a, b) => a.timestamp - b.timestamp);
}

const TIMELINE_HEADERS = [
  "Company",
  "Job title",
  "Date",
  "Event",
  "Status",
  "Detail",
];

/** RFC 4180 CSV with a header, including a final CRLF. */
export function applicationTimelineCsv(application: JobApplication): string {
  const rows = getApplicationTimeline(application).map((row) =>
    [
      application.companyName,
      application.jobTitle,
      row.date,
      row.event,
      row.status,
      row.detail,
    ]
      .map(escapeCsv)
      .join(","),
  );
  return (
    [TIMELINE_HEADERS.map(escapeCsv).join(","), ...rows].join("\r\n") + "\r\n"
  );
}

function slug(value: string): string {
  return (
    value
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "application"
  );
}

/**
 * Save one application's timeline as a CSV. Uses the native save dialog in
 * Tauri and a browser download during web development. Returns the chosen
 * path/name, or null when the dialog was cancelled.
 */
export async function exportApplicationTimeline(
  application: JobApplication,
): Promise<string | null> {
  const csv = "\uFEFF" + applicationTimelineCsv(application);
  const defaultName = `${slug(application.companyName)}-timeline-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  if (!isTauriRuntime()) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = defaultName;
    anchor.click();
    URL.revokeObjectURL(url);
    return defaultName;
  }

  return invoke<string | null>("export_csv_file", {
    defaultName,
    contents: csv,
  });
}
