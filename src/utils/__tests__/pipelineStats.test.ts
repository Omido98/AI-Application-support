import { describe, it, expect } from "vitest";
import {
  UPCOMING_WINDOW_DAYS,
  computePipelineStats,
  getMonthlyApplications,
  getPipelineRates,
  getPipelineTotals,
  getRecentStatusChanges,
  getStatusCounts,
  getUpcomingItems,
} from "@/utils/pipelineStats";
import type {
  ApplicationStatus,
  JobApplication,
  StatusHistoryEntry,
} from "@/types";

/** Sunday 15 March 2026, local noon — fixed so date math never hits the clock. */
const NOW = new Date(2026, 2, 15, 12, 0, 0);

function makeApp(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "app-1",
    companyName: "Acme",
    jobTitle: "Engineer",
    applicationUrl: "",
    status: "wishlist",
    jobDescription: "",
    applicationLanguage: "",
    requirements: "",
    companyResearch: "",
    notes: "",
    location: "",
    workMode: "",
    salary: "",
    source: "",
    priority: "medium",
    tags: [],
    appliedAt: "",
    deadline: "",
    followUpAt: "",
    contactName: "",
    contactEmail: "",
    statusHistory: [{ status: "wishlist", at: "2026-03-01T10:00:00.000Z" }],
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

function at(status: ApplicationStatus, iso: string): StatusHistoryEntry {
  return { status, at: iso };
}

describe("getStatusCounts", () => {
  it("counts every status and seeds missing ones with zero", () => {
    const applications = [
      makeApp({ id: "w", status: "wishlist" }),
      makeApp({ id: "a", status: "applied" }),
      makeApp({ id: "i1", status: "interview" }),
      makeApp({ id: "i2", status: "interview" }),
      makeApp({ id: "o", status: "offer" }),
      makeApp({ id: "r", status: "rejected" }),
    ];

    expect(getStatusCounts(applications)).toEqual({
      wishlist: 1,
      applied: 1,
      interview: 2,
      offer: 1,
      rejected: 1,
    });
    expect(getStatusCounts([])).toEqual({
      wishlist: 0,
      applied: 0,
      interview: 0,
      offer: 0,
      rejected: 0,
    });
  });
});

describe("getPipelineTotals", () => {
  it("derives totals from the current statuses", () => {
    const applications = [
      makeApp({ id: "w", status: "wishlist" }),
      makeApp({ id: "a", status: "applied" }),
      makeApp({ id: "i1", status: "interview" }),
      makeApp({ id: "i2", status: "interview" }),
      makeApp({ id: "o", status: "offer" }),
      makeApp({ id: "r", status: "rejected" }),
    ];

    expect(getPipelineTotals(applications)).toEqual({
      total: 6,
      // wishlist + applied + two interviews; offers/rejections are archived.
      active: 4,
      applied: 5,
      interviews: 3,
      offers: 1,
      rejected: 1,
    });
  });

  it("returns zeroed totals for an empty pipeline", () => {
    expect(getPipelineTotals([])).toEqual({
      total: 0,
      active: 0,
      applied: 0,
      interviews: 0,
      offers: 0,
      rejected: 0,
    });
  });
});

describe("getPipelineRates", () => {
  it("measures responses, interviews and offers against applied-or-later", () => {
    const rates = getPipelineRates({
      total: 6,
      active: 4,
      applied: 5,
      interviews: 3,
      offers: 1,
      rejected: 1,
    });

    expect(rates.responseRate).toBeCloseTo(4 / 5); // 3 interviews + 1 rejection
    expect(rates.interviewRate).toBeCloseTo(3 / 5);
    expect(rates.offerRate).toBeCloseTo(1 / 5);
  });

  it("ignores wishlist-only applications in the denominator", () => {
    const applications = [
      makeApp({ id: "w1", status: "wishlist" }),
      makeApp({ id: "w2", status: "wishlist" }),
      makeApp({ id: "w3", status: "wishlist" }),
    ];
    const rates = getPipelineRates(getPipelineTotals(applications));
    expect(rates).toEqual({
      responseRate: 0,
      interviewRate: 0,
      offerRate: 0,
    });
  });

  it("returns 0..1 fractions and never divides by zero", () => {
    const rates = getPipelineRates(getPipelineTotals([]));
    expect(rates.responseRate).toBe(0);
    expect(rates.interviewRate).toBe(0);
    expect(rates.offerRate).toBe(0);
  });
});

describe("getUpcomingItems", () => {
  it("includes overdue items and the next 14 days, sorted by date", () => {
    const applications = [
      makeApp({
        id: "overdue",
        companyName: "Beta",
        status: "applied",
        deadline: "2026-03-10",
      }),
      makeApp({
        id: "today",
        companyName: "Alpha",
        status: "interview",
        followUpAt: "2026-03-15",
      }),
      makeApp({
        id: "window",
        companyName: "Gamma",
        status: "wishlist",
        deadline: "2026-03-29",
      }),
      makeApp({
        id: "later",
        companyName: "Delta",
        status: "applied",
        deadline: "2026-03-30",
      }),
      makeApp({
        id: "archived",
        companyName: "Epsilon",
        status: "offer",
        deadline: "2026-03-16",
      }),
      makeApp({ id: "unset", companyName: "Zeta", status: "applied" }),
    ];

    const items = getUpcomingItems(applications, NOW);

    expect(items).toEqual([
      {
        applicationId: "overdue",
        companyName: "Beta",
        kind: "deadline",
        date: "2026-03-10",
        daysUntil: -5,
      },
      {
        applicationId: "today",
        companyName: "Alpha",
        kind: "followUp",
        date: "2026-03-15",
        daysUntil: 0,
      },
      {
        applicationId: "window",
        companyName: "Gamma",
        kind: "deadline",
        date: "2026-03-29",
        daysUntil: UPCOMING_WINDOW_DAYS,
      },
    ]);
  });

  it("lists both a deadline and a follow-up when they share a date", () => {
    const items = getUpcomingItems(
      [makeApp({ deadline: "2026-03-20", followUpAt: "2026-03-20" })],
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual(["deadline", "followUp"]);
    expect(items.every((item) => item.daysUntil === 5)).toBe(true);
  });

  it("ignores impossible date-only values", () => {
    const items = getUpcomingItems(
      [
        makeApp({
          deadline: "2026-02-31",
          followUpAt: "2026-03-20T09:00:00.000Z",
        }),
      ],
      NOW,
    );
    expect(items).toEqual([]);
  });
});

describe("getMonthlyApplications", () => {
  it("buckets the last six calendar months, oldest first", () => {
    const applications = [
      // September is outside the window (Oct 2025 – Mar 2026).
      makeApp({ id: "sep", createdAt: "2025-09-20T12:00:00.000Z" }),
      makeApp({ id: "oct", createdAt: "2025-10-05T12:00:00.000Z" }),
      makeApp({ id: "dec", createdAt: "2025-12-15T12:00:00.000Z" }),
      makeApp({ id: "jan", createdAt: "2026-01-20T12:00:00.000Z" }),
      makeApp({ id: "feb1", createdAt: "2026-02-10T12:00:00.000Z" }),
      makeApp({ id: "feb2", createdAt: "2026-02-20T12:00:00.000Z" }),
      makeApp({ id: "mar", createdAt: "2026-03-01T12:00:00.000Z" }),
      makeApp({ id: "invalid", createdAt: "not-a-date" }),
    ];

    expect(getMonthlyApplications(applications, NOW)).toEqual([
      { label: "Oct", count: 1 },
      { label: "Nov", count: 0 },
      { label: "Dec", count: 1 },
      { label: "Jan", count: 1 },
      { label: "Feb", count: 2 },
      { label: "Mar", count: 1 },
    ]);
  });

  it("keeps six buckets when the pipeline is empty", () => {
    const months = getMonthlyApplications([], NOW);
    expect(months.map((month) => month.label)).toEqual([
      "Oct",
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
    ]);
    expect(months.every((month) => month.count === 0)).toBe(true);
  });
});

describe("getRecentStatusChanges", () => {
  it("flattens histories newest first across applications", () => {
    const applications = [
      makeApp({
        id: "a",
        companyName: "Acme",
        status: "interview",
        statusHistory: [
          at("wishlist", "2026-03-01T09:00:00.000Z"),
          at("applied", "2026-03-02T09:00:00.000Z"),
          at("interview", "2026-03-05T09:00:00.000Z"),
        ],
      }),
      makeApp({
        id: "b",
        companyName: "Beta",
        status: "rejected",
        statusHistory: [
          at("wishlist", "2026-03-03T09:00:00.000Z"),
          at("rejected", "2026-03-04T09:00:00.000Z"),
        ],
      }),
    ];

    const changes = getRecentStatusChanges(applications);

    expect(changes).toEqual([
      {
        applicationId: "a",
        companyName: "Acme",
        status: "interview",
        at: "2026-03-05T09:00:00.000Z",
      },
      {
        applicationId: "b",
        companyName: "Beta",
        status: "rejected",
        at: "2026-03-04T09:00:00.000Z",
      },
      {
        applicationId: "b",
        companyName: "Beta",
        status: "wishlist",
        at: "2026-03-03T09:00:00.000Z",
      },
      {
        applicationId: "a",
        companyName: "Acme",
        status: "applied",
        at: "2026-03-02T09:00:00.000Z",
      },
      {
        applicationId: "a",
        companyName: "Acme",
        status: "wishlist",
        at: "2026-03-01T09:00:00.000Z",
      },
    ]);
  });

  it("keeps only the ten most recent entries", () => {
    const history: StatusHistoryEntry[] = Array.from(
      { length: 12 },
      (_, index) => ({
        status: "applied" as ApplicationStatus,
        at: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
      }),
    );

    const changes = getRecentStatusChanges([
      makeApp({ id: "long", statusHistory: history }),
    ]);

    expect(changes).toHaveLength(10);
    expect(changes[0].at).toBe(history[11].at);
    expect(changes[9].at).toBe(history[2].at);
  });

  it("drops entries with an invalid timestamp", () => {
    const changes = getRecentStatusChanges([
      makeApp({
        statusHistory: [
          at("wishlist", "not-a-date"),
          at("applied", "2026-03-02T09:00:00.000Z"),
        ],
      }),
    ]);
    expect(changes).toEqual([
      {
        applicationId: "app-1",
        companyName: "Acme",
        status: "applied",
        at: "2026-03-02T09:00:00.000Z",
      },
    ]);
  });
});

describe("computePipelineStats", () => {
  it("returns totals, rates, status counts and timeline sections together", () => {
    const applications = [
      makeApp({
        id: "a",
        companyName: "Acme",
        status: "interview",
        deadline: "2026-03-20",
        createdAt: "2026-02-10T12:00:00.000Z",
        statusHistory: [
          at("wishlist", "2026-02-10T12:00:00.000Z"),
          at("applied", "2026-03-01T09:00:00.000Z"),
          at("interview", "2026-03-05T09:00:00.000Z"),
        ],
      }),
      makeApp({
        id: "b",
        companyName: "Beta",
        status: "wishlist",
        followUpAt: "2026-03-16",
        createdAt: "2026-03-02T12:00:00.000Z",
      }),
    ];

    const stats = computePipelineStats(applications, NOW);

    expect(stats.totals).toEqual({
      total: 2,
      active: 2,
      applied: 1,
      interviews: 1,
      offers: 0,
      rejected: 0,
    });
    expect(stats.rates.responseRate).toBe(1);
    expect(stats.rates.interviewRate).toBe(1);
    expect(stats.rates.offerRate).toBe(0);
    expect(stats.statusCounts.interview).toBe(1);
    expect(stats.upcoming).toHaveLength(2);
    expect(stats.monthlyApplications).toHaveLength(6);
    expect(stats.recentStatusChanges[0]).toMatchObject({
      applicationId: "a",
      status: "interview",
    });
  });
});
