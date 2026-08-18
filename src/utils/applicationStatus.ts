import type { ApplicationStatus, JobApplication } from "@/types";

export const STATUS_ORDER: ApplicationStatus[] = [
  "wishlist",
  "applied",
  "interview",
  "offer",
  "rejected",
];

/** Statuses that live in the archive instead of the active list. */
export const ARCHIVED_STATUSES: ApplicationStatus[] = ["offer", "rejected"];

export const isArchivedStatus = (status: ApplicationStatus): boolean =>
  ARCHIVED_STATUSES.includes(status);

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  wishlist: "Wishlist",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

/** Badge classes (border + tint) per status, tuned for light and dark themes. */
export const STATUS_BADGE_CLASSES: Record<ApplicationStatus, string> = {
  wishlist: "bg-border/30 text-text-secondary border-border",
  applied:
    "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  interview:
    "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400",
  offer: "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

/**
 * Sort by status rank (Wishlist first, Rejected last), then alphabetically by
 * company name (case-insensitive) within each status group.
 */
export function sortApplications(
  applications: JobApplication[],
): JobApplication[] {
  return [...applications].sort((a, b) => {
    const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (byStatus !== 0) return byStatus;
    return a.companyName.localeCompare(b.companyName, undefined, {
      sensitivity: "base",
    });
  });
}
