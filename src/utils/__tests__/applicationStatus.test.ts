import { describe, it, expect } from "vitest";
import {
  STATUS_ORDER,
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  ARCHIVED_STATUSES,
  isArchivedStatus,
  sortApplications,
} from "@/utils/applicationStatus";
import type { ApplicationStatus, JobApplication } from "@/types";

const ALL_STATUSES: ApplicationStatus[] = [
  "wishlist",
  "applied",
  "interview",
  "offer",
  "rejected",
];

function makeApp(
  id: string,
  companyName: string,
  status: ApplicationStatus,
): JobApplication {
  return {
    id,
    companyName,
    jobTitle: "",
    applicationUrl: "",
    status,
    jobDescription: "",
    applicationLanguage: "",
    requirements: "",
    companyResearch: "",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

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
    expect(applied).toContain("dark:text-blue-300");
    expect(applied).toContain("text-blue-700");
  });
});

describe("ARCHIVED_STATUSES", () => {
  it("archives offer and rejected only", () => {
    expect(ARCHIVED_STATUSES).toEqual(["offer", "rejected"]);
  });

  it("flags archived statuses and not others", () => {
    expect(isArchivedStatus("offer")).toBe(true);
    expect(isArchivedStatus("rejected")).toBe(true);
    for (const status of ["wishlist", "applied", "interview"] as const) {
      expect(isArchivedStatus(status)).toBe(false);
    }
  });
});

describe("sortApplications", () => {
  it("groups by status with wishlist first and rejected last", () => {
    const apps = [
      makeApp("1", "Zeta", "rejected"),
      makeApp("2", "Alpha", "wishlist"),
      makeApp("3", "Beta", "interview"),
      makeApp("4", "Gamma", "applied"),
      makeApp("5", "Delta", "offer"),
    ];
    const sorted = sortApplications(apps).map((a) => a.id);
    expect(sorted).toEqual(["2", "4", "3", "5", "1"]);
  });

  it("sorts alphabetically within the same status", () => {
    const apps = [
      makeApp("1", "Zulu", "applied"),
      makeApp("2", "Alpha", "applied"),
      makeApp("3", "Mike", "applied"),
    ];
    expect(sortApplications(apps).map((a) => a.id)).toEqual(["2", "3", "1"]);
  });

  it("sorts alphabetically case-insensitively", () => {
    const apps = [
      makeApp("1", "zebra", "wishlist"),
      makeApp("2", "Apple", "wishlist"),
      makeApp("3", "banana", "wishlist"),
    ];
    expect(sortApplications(apps).map((a) => a.id)).toEqual(["2", "3", "1"]);
  });

  it("does not mutate the input array", () => {
    const apps = [
      makeApp("1", "Zulu", "applied"),
      makeApp("2", "Alpha", "wishlist"),
    ];
    const copy = [...apps];
    sortApplications(apps);
    expect(apps).toEqual(copy);
  });
});
