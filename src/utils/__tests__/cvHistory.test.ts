import { describe, expect, it } from "vitest";
import type { CvDocument } from "@/types/cv";
import {
  MAX_CV_HISTORY,
  cloneCvDocument,
  createCvSnapshot,
  normalizeCvHistory,
  serializeCvHistory,
} from "@/utils/cvHistory";

function document(overrides: Partial<CvDocument> = {}): CvDocument {
  return {
    schemaVersion: 1,
    language: "en",
    pageSize: "a4",
    generatedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    profileFingerprint: "abc",
    applicationUpdatedAt: "2026-01-01T00:00:00.000Z",
    extraContext: "",
    contact: {
      fullName: "Jane",
      email: "jane@example.com",
      phone: "",
      location: "",
      linkedinUrl: "",
      portfolioUrl: "",
      githubUrl: "",
    },
    headline: "",
    summary: "Summary",
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    languages: [],
    otherEngagements: [],
    sectionOrder: [
      "summary",
      "skills",
      "experience",
      "education",
      "projects",
      "certifications",
      "languages",
      "other",
    ],
    ...overrides,
  };
}

describe("cv history", () => {
  it("deep-clones snapshots so later edits cannot mutate history", () => {
    const cv = document();
    const snapshot = createCvSnapshot(cv, "Before rewrite");
    cv.summary = "Changed";

    expect(snapshot.document.summary).toBe("Summary");
    expect(cloneCvDocument(cv).summary).toBe("Changed");
  });

  it("normalizes, sorts newest first and caps the history", () => {
    const snapshots = Array.from(
      { length: MAX_CV_HISTORY + 3 },
      (_, index) => ({
        id: `snapshot-${index}`,
        savedAt: new Date(2026, 0, index + 1).toISOString(),
        label: `Version ${index}`,
        document: document(),
      }),
    );
    const normalized = normalizeCvHistory({
      schemaVersion: 1,
      snapshots: snapshots.reverse(),
    });

    expect(normalized).toHaveLength(MAX_CV_HISTORY);
    expect(normalized[0].id).toBe("snapshot-7");
    expect(normalized[0].label).toBe("Version 7");
  });

  it("drops malformed snapshots and serializes a stable envelope", () => {
    const normalized = normalizeCvHistory({
      schemaVersion: 1,
      snapshots: [
        null,
        { id: "bad", document: { schemaVersion: 2 } },
        { id: "good", document: document() },
      ],
    });

    expect(normalized).toHaveLength(1);
    expect(normalized[0].label).toBe("Previous version");
    expect(serializeCvHistory(normalized).schemaVersion).toBe(1);
  });
});
