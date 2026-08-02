import type { ApplicationStatus } from "@/types";

export const STATUS_ORDER: ApplicationStatus[] = [
  "wishlist",
  "applied",
  "interview",
  "offer",
  "rejected",
];

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
    "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400",
  interview:
    "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400",
  offer: "bg-green-500/15 text-green-600 border-green-500/30 dark:text-green-400",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};
