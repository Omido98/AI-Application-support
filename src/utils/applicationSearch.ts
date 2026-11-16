import type { JobApplication } from "@/types";

/**
 * The searchable text of one application. Notes, tags and posting text are
 * included so the tracker search finds anything the user wrote, not only the
 * company and title.
 */
export function applicationSearchText(application: JobApplication): string {
  return [
    application.companyName,
    application.jobTitle,
    application.jobDescription,
    application.requirements,
    application.companyResearch,
    application.notes,
    application.location,
    application.workMode,
    application.salary,
    application.source,
    application.contactName,
    application.contactEmail,
    ...application.tags,
  ]
    .join(" ")
    .toLowerCase();
}

/** Case-insensitive full-application search; an empty query matches all. */
export function applicationMatchesQuery(
  application: JobApplication,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return applicationSearchText(application).includes(normalized);
}
