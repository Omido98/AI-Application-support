import type { ApplicationStatus, JobApplication } from "@/types";
import { isArchivedStatus } from "@/utils/applicationStatus";

/**
 * Pure pipeline analytics for the Overview tab.
 *
 * Every function takes a plain `JobApplication[]` and never touches the clock
 * unless it is given a reference date, so the numbers are deterministic and
 * easy to test.
 *
 * Rate denominators: all three rates are measured against applications that
 * moved past the wishlist ("applied or later" = applied + interview + offer +
 * rejected). Wishlist entries have not been applied to yet, so counting them
 * would dilute the rates. A rejection counts as a response. Rates are 0 when
 * nothing has moved past the wishlist.
 */

/** A deadline/follow-up further out than this many days is not "upcoming". */
export const UPCOMING_WINDOW_DAYS = 14;

/** Compact month labels for the six-month activity chart. */
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export interface PipelineTotals {
  total: number;
  /** Applications still in the pipeline (wishlist, applied, interview). */
  active: number;
  /** Applications that moved past the wishlist (applied or later). */
  applied: number;
  /** Interview or offer. */
  interviews: number;
  offers: number;
  rejected: number;
}

export interface PipelineRates {
  /** (interview + offer + rejected) / applied or later. */
  responseRate: number;
  /** (interview + offer) / applied or later. */
  interviewRate: number;
  /** offer / applied or later. */
  offerRate: number;
}

/** Numeric summary of the time from applying to the first response. */
export interface TimeToResponseStats {
  /** Median days, or null when no application has a usable response date. */
  medianDays: number | null;
  averageDays: number | null;
  /** Number of applications with both an applied and a response date. */
  sampleCount: number;
}

/** Response/interview/offer performance for one normalized source value. */
export interface SourceEffectiveness {
  /** Original casing of the first non-empty value, or "Not set". */
  source: string;
  applied: number;
  responses: number;
  interviews: number;
  offers: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  /** False below SOURCE_EFFECTIVENESS_MIN_SAMPLE; the UI hides percentages. */
  hasEnoughData: boolean;
}

/** Hide source percentages below this many applications to avoid noise. */
export const SOURCE_EFFECTIVENESS_MIN_SAMPLE = 3;

export type StatusCounts = Record<ApplicationStatus, number>;

export interface UpcomingItem {
  applicationId: string;
  companyName: string;
  kind: "deadline" | "followUp";
  /** The stored `YYYY-MM-DD` date. */
  date: string;
  /** Whole days from today; negative means overdue. */
  daysUntil: number;
}

export interface MonthlyApplicationCount {
  /** e.g. "Mar" */
  label: string;
  count: number;
}

export interface RecentStatusChange {
  applicationId: string;
  companyName: string;
  status: ApplicationStatus;
  /** ISO timestamp of the change. */
  at: string;
}

export interface PipelineStats {
  totals: PipelineTotals;
  rates: PipelineRates;
  statusCounts: StatusCounts;
  upcoming: UpcomingItem[];
  monthlyApplications: MonthlyApplicationCount[];
  recentStatusChanges: RecentStatusChange[];
  timeToResponse: TimeToResponseStats;
  sourceEffectiveness: SourceEffectiveness[];
}

/**
 * Parse a stored date-only value as local midnight. Timestamps, empty strings
 * and impossible dates (e.g. 31 February) are ignored rather than guessed at.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days between two local-midnight dates (DST-safe). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function getStatusCounts(applications: JobApplication[]): StatusCounts {
  const counts: StatusCounts = {
    wishlist: 0,
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  };
  for (const application of applications) {
    counts[application.status] += 1;
  }
  return counts;
}

export function getPipelineTotals(
  applications: JobApplication[],
): PipelineTotals {
  const counts = getStatusCounts(applications);
  return {
    total: applications.length,
    active: applications.filter((app) => !isArchivedStatus(app.status)).length,
    applied: counts.applied + counts.interview + counts.offer + counts.rejected,
    interviews: counts.interview + counts.offer,
    offers: counts.offer,
    rejected: counts.rejected,
  };
}

export function getPipelineRates(totals: PipelineTotals): PipelineRates {
  const denominator = totals.applied;
  if (denominator === 0) {
    return { responseRate: 0, interviewRate: 0, offerRate: 0 };
  }
  return {
    responseRate: (totals.interviews + totals.rejected) / denominator,
    interviewRate: totals.interviews / denominator,
    offerRate: totals.offers / denominator,
  };
}

const RESPONSE_STATUSES: ApplicationStatus[] = [
  "interview",
  "offer",
  "rejected",
];

/** The local day an application was submitted, from the field or history. */
function appliedDate(application: JobApplication): Date | null {
  const fromField = parseDateOnly(application.appliedAt);
  if (fromField) return fromField;

  let earliest: Date | null = null;
  for (const entry of application.statusHistory) {
    if (entry.status !== "applied") continue;
    const at = new Date(entry.at);
    if (Number.isNaN(at.getTime())) continue;
    const day = startOfDay(at);
    if (!earliest || day.getTime() < earliest.getTime()) earliest = day;
  }
  return earliest;
}

/**
 * Days from the applied date to the first interview, offer or rejection.
 * Applications without a usable applied date or response event are excluded;
 * only recorded dates are used, never `updatedAt`, to avoid inventing speed.
 */
export function getTimeToResponse(
  applications: JobApplication[],
): TimeToResponseStats {
  const durations: number[] = [];

  for (const application of applications) {
    const start = appliedDate(application);
    if (!start) continue;

    let response: Date | null = null;
    for (const entry of application.statusHistory) {
      if (!RESPONSE_STATUSES.includes(entry.status)) continue;
      const at = new Date(entry.at);
      if (Number.isNaN(at.getTime())) continue;
      const day = startOfDay(at);
      if (day.getTime() < start.getTime()) continue;
      if (!response || day.getTime() < response.getTime()) response = day;
    }
    if (!response) continue;
    durations.push(Math.max(0, daysBetween(start, response)));
  }

  if (durations.length === 0) {
    return { medianDays: null, averageDays: null, sampleCount: 0 };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  const average =
    durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

  return {
    medianDays: median,
    averageDays: average,
    sampleCount: durations.length,
  };
}

/**
 * Group applied-or-later applications by source and compute response,
 * interview and offer rates. Source matching is case-insensitive; blank
 * sources form a visible "Not set" group.
 */
export function getSourceEffectiveness(
  applications: JobApplication[],
): SourceEffectiveness[] {
  const groups = new Map<
    string,
    {
      source: string;
      applied: number;
      responses: number;
      interviews: number;
      offers: number;
    }
  >();

  for (const application of applications) {
    if (application.status === "wishlist") continue;
    const raw = application.source.trim();
    const key = raw ? raw.toLocaleLowerCase() : "__not_set__";
    const group = groups.get(key) ?? {
      source: raw || "Not set",
      applied: 0,
      responses: 0,
      interviews: 0,
      offers: 0,
    };
    group.applied += 1;
    if (application.status !== "applied") group.responses += 1;
    if (application.status === "interview" || application.status === "offer") {
      group.interviews += 1;
    }
    if (application.status === "offer") group.offers += 1;
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      source: group.source,
      applied: group.applied,
      responses: group.responses,
      interviews: group.interviews,
      offers: group.offers,
      responseRate: group.applied ? group.responses / group.applied : 0,
      interviewRate: group.applied ? group.interviews / group.applied : 0,
      offerRate: group.applied ? group.offers / group.applied : 0,
      hasEnoughData: group.applied >= SOURCE_EFFECTIVENESS_MIN_SAMPLE,
    }))
    .sort(
      (a, b) =>
        b.applied - a.applied ||
        a.source.localeCompare(b.source, undefined, {
          sensitivity: "base",
        }),
    );
}

/**
 * Deadlines and follow-ups that are overdue or due within the next
 * `UPCOMING_WINDOW_DAYS` days, sorted by date (oldest overdue first).
 * Archived applications (offer/rejected) are skipped: they no longer need
 * chasing, and their old dates would otherwise sit in "overdue" forever.
 */
export function getUpcomingItems(
  applications: JobApplication[],
  now: Date = new Date(),
): UpcomingItem[] {
  const today = startOfDay(now);
  const items: UpcomingItem[] = [];

  for (const application of applications) {
    if (isArchivedStatus(application.status)) continue;

    const dueDates: { kind: UpcomingItem["kind"]; value: string }[] = [
      { kind: "deadline", value: application.deadline },
      { kind: "followUp", value: application.followUpAt },
    ];
    for (const { kind, value } of dueDates) {
      const date = parseDateOnly(value);
      if (!date) continue;
      const daysUntil = daysBetween(today, date);
      if (daysUntil > UPCOMING_WINDOW_DAYS) continue;
      items.push({
        applicationId: application.id,
        companyName: application.companyName,
        kind,
        date: value,
        daysUntil,
      });
    }
  }

  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.companyName.localeCompare(b.companyName, undefined, {
        sensitivity: "base",
      }) ||
      a.kind.localeCompare(b.kind),
  );
}

/**
 * Applications created in each of the last six calendar months, oldest first.
 * The current month is included, so the list always has six entries.
 */
export function getMonthlyApplications(
  applications: JobApplication[],
  now: Date = new Date(),
): MonthlyApplicationCount[] {
  const buckets: { year: number; month: number; count: number }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      year: month.getFullYear(),
      month: month.getMonth(),
      count: 0,
    });
  }

  for (const application of applications) {
    const createdAt = new Date(application.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const bucket = buckets.find(
      (entry) =>
        entry.year === createdAt.getFullYear() &&
        entry.month === createdAt.getMonth(),
    );
    if (bucket) bucket.count += 1;
  }

  return buckets.map((bucket) => ({
    label: MONTH_LABELS[bucket.month],
    count: bucket.count,
  }));
}

/** Flattened status history, newest first, limited to the latest `limit`. */
export function getRecentStatusChanges(
  applications: JobApplication[],
  limit = 10,
): RecentStatusChange[] {
  const changes: (RecentStatusChange & { timestamp: number })[] = [];
  for (const application of applications) {
    for (const entry of application.statusHistory) {
      const timestamp = new Date(entry.at).getTime();
      if (Number.isNaN(timestamp)) continue;
      changes.push({
        applicationId: application.id,
        companyName: application.companyName,
        status: entry.status,
        at: entry.at,
        timestamp,
      });
    }
  }

  changes.sort((a, b) => b.timestamp - a.timestamp);
  return changes.slice(0, limit).map((change) => ({
    applicationId: change.applicationId,
    companyName: change.companyName,
    status: change.status,
    at: change.at,
  }));
}

/** Everything the Overview tab needs, derived from the current applications. */
export function computePipelineStats(
  applications: JobApplication[],
  now: Date = new Date(),
): PipelineStats {
  const totals = getPipelineTotals(applications);
  return {
    totals,
    rates: getPipelineRates(totals),
    statusCounts: getStatusCounts(applications),
    upcoming: getUpcomingItems(applications, now),
    monthlyApplications: getMonthlyApplications(applications, now),
    recentStatusChanges: getRecentStatusChanges(applications),
    timeToResponse: getTimeToResponse(applications),
    sourceEffectiveness: getSourceEffectiveness(applications),
  };
}
