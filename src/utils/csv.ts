import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/utils/runtime";
import { STATUS_LABELS } from "@/utils/applicationStatus";
import type { JobApplication, WorkMode } from "@/types";

const HEADERS = [
  "Company",
  "Job title",
  "Status",
  "Priority",
  "Location",
  "Work mode",
  "Salary",
  "Source",
  "Applied on",
  "Deadline",
  "Follow-up",
  "Contact name",
  "Contact email",
  "Tags",
  "Application URL",
  "Created",
  "Updated",
];

function workModeLabel(mode: WorkMode): string {
  switch (mode) {
    case "onsite":
      return "On-site";
    case "hybrid":
      return "Hybrid";
    case "remote":
      return "Remote";
    default:
      return "";
  }
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

/** RFC 4180 escaping: quote cells containing a comma, quote or newline. */
function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function applicationsToCsv(applications: JobApplication[]): string {
  const header = HEADERS.map(escapeCsv).join(",");
  const rows = applications.map((app) =>
    [
      app.companyName,
      app.jobTitle,
      STATUS_LABELS[app.status],
      capitalize(app.priority),
      app.location,
      workModeLabel(app.workMode),
      app.salary,
      app.source,
      app.appliedAt,
      app.deadline,
      app.followUpAt,
      app.contactName,
      app.contactEmail,
      app.tags.join("; "),
      app.applicationUrl,
      app.createdAt,
      app.updatedAt,
    ]
      .map(escapeCsv)
      .join(","),
  );
  return [header, ...rows].join("\r\n") + "\r\n";
}

/**
 * Save the tracker as a UTF-8 CSV (with BOM so Excel reads accents). Uses the
 * native save dialog in Tauri and a browser download during web development.
 * Returns the chosen path/name, or null when the dialog was cancelled.
 */
export async function exportApplicationsCsv(
  applications: JobApplication[],
): Promise<string | null> {
  const csv = "\uFEFF" + applicationsToCsv(applications);
  const defaultName = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
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
