import { describe, expect, it } from "vitest";
import type { JobApplication } from "@/types";
import {
  applicationTimelineCsv,
  getApplicationTimeline,
} from "@/utils/timeline";

function makeApp(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "app-1",
    companyName: "Acme",
    jobTitle: "Engineer",
    applicationUrl: "",
    status: "interview",
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
    appliedAt: "2026-03-02",
    deadline: "2026-03-20",
    followUpAt: "2026-03-15",
    contactName: "",
    contactEmail: "",
    statusHistory: [
      { status: "applied", at: "2026-03-02T10:00:00" },
      { status: "interview", at: "2026-03-06T14:00:00" },
    ],
    createdAt: "2026-03-01T09:00:00",
    updatedAt: "2026-03-06T14:00:00",
    ...overrides,
  };
}

describe("getApplicationTimeline", () => {
  it("orders creation, application, status changes and due dates", () => {
    const rows = getApplicationTimeline(makeApp());

    expect(rows.map((row) => row.event)).toEqual([
      "Created",
      "Applied",
      "Status changed",
      "Status changed",
      "Follow-up",
      "Deadline",
    ]);
    expect(rows.map((row) => row.date)).toEqual([
      "2026-03-01 09:00",
      "2026-03-02",
      "2026-03-02 10:00",
      "2026-03-06 14:00",
      "2026-03-15",
      "2026-03-20",
    ]);
    expect(rows[3].status).toBe("Interview");
    expect(rows[3].detail).toBe("From Applied");
  });

  it("adds a current-status row when history is missing or stale", () => {
    const rows = getApplicationTimeline(
      makeApp({
        status: "offer",
        statusHistory: [],
        appliedAt: "",
        deadline: "",
        followUpAt: "",
        updatedAt: "2026-03-10T12:00:00",
      }),
    );

    expect(rows.map((row) => row.event)).toEqual(["Created", "Current status"]);
    expect(rows[1].status).toBe("Offer");
    expect(rows[1].date).toBe("2026-03-10 12:00");
  });

  it("skips invalid dates and does not duplicate a matching current status", () => {
    const rows = getApplicationTimeline(
      makeApp({
        createdAt: "not-a-date",
        statusHistory: [
          { status: "applied", at: "also-not-a-date" },
          { status: "interview", at: "2026-03-06T14:00:00" },
        ],
        deadline: "2026-02-31",
        followUpAt: "",
      }),
    );

    expect(rows.map((row) => row.event)).toEqual(["Applied", "Status changed"]);
  });
});

describe("applicationTimelineCsv", () => {
  it("writes the fixed header, escapes cells and ends with CRLF", () => {
    const csv = applicationTimelineCsv(
      makeApp({ companyName: 'Acme, "Inc"', jobTitle: "Line\nBreak" }),
    );
    const [header, firstRow] = csv.split("\r\n");

    expect(header).toBe("Company,Job title,Date,Event,Status,Detail");
    expect(firstRow).toContain('"Acme, ""Inc"""');
    expect(csv).toContain('"Line\nBreak"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
