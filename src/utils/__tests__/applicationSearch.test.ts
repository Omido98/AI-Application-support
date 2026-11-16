import { describe, expect, it } from "vitest";
import type { JobApplication } from "@/types";
import {
  applicationMatchesQuery,
  applicationSearchText,
} from "@/utils/applicationSearch";

function application(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "app-1",
    companyName: "Acme Corp",
    jobTitle: "Frontend Engineer",
    applicationUrl: "",
    status: "applied",
    jobDescription: "",
    applicationLanguage: "English",
    requirements: "",
    companyResearch: "",
    notes: "",
    location: "Copenhagen",
    workMode: "hybrid",
    salary: "",
    source: "",
    priority: "medium",
    tags: [],
    appliedAt: "2026-01-01",
    deadline: "",
    followUpAt: "",
    contactName: "",
    contactEmail: "",
    statusHistory: [{ status: "applied", at: "2026-01-01T00:00:00.000Z" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("application search", () => {
  it("searches company, posting text, notes and tags", () => {
    const item = application({
      notes: "Met the hiring manager at a meetup",
      tags: ["typescript", "remote"],
    });

    expect(applicationMatchesQuery(item, "acme")).toBe(true);
    expect(applicationMatchesQuery(item, "hiring manager")).toBe(true);
    expect(applicationMatchesQuery(item, "TYPESCRIPT")).toBe(true);
    expect(applicationMatchesQuery(item, "copenhagen")).toBe(true);
    expect(applicationMatchesQuery(item, "nonexistent")).toBe(false);
  });

  it("matches everything for an empty or whitespace query", () => {
    const item = application();
    expect(applicationMatchesQuery(item, "")).toBe(true);
    expect(applicationMatchesQuery(item, "   ")).toBe(true);
  });

  it("builds a lower-case searchable haystack including all tags", () => {
    const text = applicationSearchText(
      application({
        tags: ["Alpha", "Beta"],
        contactEmail: "Jobs@Example.com",
      }),
    );
    expect(text).toContain("alpha");
    expect(text).toContain("beta");
    expect(text).toContain("jobs@example.com");
  });
});
