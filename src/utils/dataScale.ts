import type { JobApplication } from "@/types";
import { normalizeApplicationsPayload } from "@/utils/dataValidation";
import { applicationMatchesQuery } from "@/utils/applicationSearch";

/**
 * Data-scale diagnostic for the JSON storage decision.
 *
 * The tracker keeps plain JSON and scans applications in memory. These
 * measurements make the trade-off explicit: how much JSON a realistic data
 * set produces, how long parsing + normalization takes, and how long a
 * representative in-memory search takes. Re-run with `npm run bench:data`.
 */

/** Revisit SQLite/FTS5 beyond either limit (see docs/data-storage.md). */
export const DATA_SCALE_LIMITS = {
  applications: 5_000,
  searchMs: 250,
} as const;

export const DEFAULT_SCALE_QUERY = "typescript";

export interface DataScaleMetrics {
  applicationCount: number;
  /** UTF-8 size of the applications.json payload. */
  jsonBytes: number;
  /** Median JSON.parse + normalize time in milliseconds. */
  loadMs: number;
  /** Median full-application search time in milliseconds. */
  searchMs: number;
  searchMatches: number;
  query: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function measureDataScale(
  applications: JobApplication[],
  query: string = DEFAULT_SCALE_QUERY,
  runs = 5,
): DataScaleMetrics {
  const payload = JSON.stringify({
    applications,
    selectedApplicationId: applications[0]?.id ?? null,
  });
  const jsonBytes = new TextEncoder().encode(payload).length;

  const loadSamples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    const parsed: unknown = JSON.parse(payload);
    normalizeApplicationsPayload(parsed);
    loadSamples.push(performance.now() - started);
  }

  const searchSamples: number[] = [];
  let searchMatches = 0;
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    searchMatches = applications.filter((application) =>
      applicationMatchesQuery(application, query),
    ).length;
    searchSamples.push(performance.now() - started);
  }

  return {
    applicationCount: applications.length,
    jsonBytes,
    loadMs: round(median(loadSamples)),
    searchMs: round(median(searchSamples)),
    searchMatches,
    query,
  };
}

/** Whether the measured data set is past the documented decision gate. */
export function exceedsDataScaleLimits(metrics: DataScaleMetrics): boolean {
  return (
    metrics.applicationCount > DATA_SCALE_LIMITS.applications ||
    metrics.searchMs > DATA_SCALE_LIMITS.searchMs
  );
}
