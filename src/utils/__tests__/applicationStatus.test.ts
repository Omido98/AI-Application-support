import { describe, it, expect } from "vitest";
import {
  STATUS_ORDER,
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
} from "@/utils/applicationStatus";
import type { ApplicationStatus } from "@/types";

const ALL_STATUSES: ApplicationStatus[] = [
  "wishlist",
  "applied",
  "interview",
  "offer",
  "rejected",
];

describe("STATUS_ORDER", () => {
  it("covers every status exactly once", () => {
    expect([...STATUS_ORDER].sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("starts with wishlist", () => {
    expect(STATUS_ORDER[0]).toBe("wishlist");
  });
});

describe("STATUS_LABELS", () => {
  it("provides a label for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(typeof STATUS_LABELS[status]).toBe("string");
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

describe("STATUS_BADGE_CLASSES", () => {
  it("provides badge classes for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(typeof STATUS_BADGE_CLASSES[status]).toBe("string");
      expect(STATUS_BADGE_CLASSES[status].length).toBeGreaterThan(0);
    }
  });

  it("uses theme-aware text colours for the status tint", () => {
    const applied = STATUS_BADGE_CLASSES.applied;
    expect(applied).toContain("dark:text-blue-400");
    expect(applied).toContain("text-blue-600");
  });
});
