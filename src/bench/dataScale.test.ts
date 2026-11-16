import { describe, expect, it } from "vitest";
import type { ApplicationStatus, JobApplication } from "@/types";
import {
  DATA_SCALE_LIMITS,
  exceedsDataScaleLimits,
  measureDataScale,
} from "@/utils/dataScale";

/**
 * Synthetic data-scale report, not a performance gate. `npm test` runs it as
 * a smoke check and `npm run bench:data` prints the full report. The measured
 * numbers and the resulting storage decision live in docs/data-storage.md.
 */

const STATUSES: ApplicationStatus[] = [
  "wishlist",
  "applied",
  "interview",
  "offer",
  "rejected",
];

const COMPANY_PREFIXES = [
  "Acme",
  "Northwind",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
  "Vandelay",
  "Stark",
];

function syntheticApplications(count: number): JobApplication[] {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return Array.from({ length: count }, (_, index) => {
    const status = STATUSES[index % STATUSES.length];
    return {
      id: `bench-${index}`,
      companyName: `${COMPANY_PREFIXES[index % COMPANY_PREFIXES.length]} ${index}`,
      jobTitle: index % 3 === 0 ? "TypeScript Engineer" : "Product Engineer",
      applicationUrl: `https://example.com/jobs/${index}`,
      status,
      jobDescription:
        "Build and maintain TypeScript services with React. ".repeat(8),
      applicationLanguage: "English",
      requirements: "Strong TypeScript, React and testing experience. ".repeat(
        6,
      ),
      companyResearch:
        `Company research notes for application ${index}. `.repeat(4),
      notes: `Interview notes and follow-up context ${index}. `.repeat(3),
      location: index % 2 === 0 ? "Copenhagen" : "Remote",
      workMode: index % 2 === 0 ? "hybrid" : "remote",
      salary: "€60,000",
      source: index % 2 === 0 ? "Referral" : "LinkedIn",
      priority: index % 5 === 0 ? "high" : "medium",
      tags: ["typescript", `batch-${index % 20}`],
      appliedAt: "2025-12-01",
      deadline: index % 7 === 0 ? "2026-01-15" : "",
      followUpAt: index % 11 === 0 ? "2026-01-20" : "",
      contactName: "Hiring Manager",
      contactEmail: "jobs@example.com",
      statusHistory: [{ status, at: timestamp }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

describe("data-scale diagnostic", () => {
  it.each([1_000, DATA_SCALE_LIMITS.applications])(
    "reports load and search cost for %i applications",
    (count) => {
      const metrics = measureDataScale(syntheticApplications(count));

      console.log(
        `[data-scale] ${metrics.applicationCount} applications · ` +
          `${(metrics.jsonBytes / 1024 / 1024).toFixed(2)} MB JSON · ` +
          `load ${metrics.loadMs} ms · search ${metrics.searchMs} ms ` +
          `(${metrics.searchMatches} matches for "${metrics.query}")`,
      );

      expect(metrics.applicationCount).toBe(count);
      expect(metrics.jsonBytes).toBeGreaterThan(0);
      expect(metrics.searchMatches).toBeGreaterThan(0);
      // Generous sanity ceiling; the real decision thresholds are documented.
      expect(metrics.loadMs).toBeLessThan(2_000);
      expect(metrics.searchMs).toBeLessThan(1_000);
      expect(typeof exceedsDataScaleLimits(metrics)).toBe("boolean");
    },
  );
});
