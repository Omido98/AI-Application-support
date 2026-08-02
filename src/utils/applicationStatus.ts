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

/** Badge classes (border + tint) per status. */
export const STATUS_BADGE_CLASSES: Record<ApplicationStatus, string> = {
  wishlist: "bg-border/30 text-text-secondary border-border",
  applied: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  interview: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  offer: "bg-green-500/15 text-green-400 border-green-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};
