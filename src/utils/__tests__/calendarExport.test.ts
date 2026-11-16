import { describe, expect, it } from "vitest";
import type { JobApplication } from "@/types";
import {
  buildCalendarIcs,
  countCalendarEvents,
  escapeIcsText,
  foldIcsLine,
  getCalendarEvents,
} from "@/utils/calendarExport";

const NOW = new Date(2026, 2, 15, 12, 0, 0);

function makeApp(overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: "app-1",
    companyName: "Acme",
    jobTitle: "Engineer",
    applicationUrl: "https://example.com/jobs/1",
    status: "applied",
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
    appliedAt: "2026-03-01",
    deadline: "2026-03-20",
    followUpAt: "2026-03-16",
    contactName: "",
    contactEmail: "",
    statusHistory: [],
    createdAt: "2026-03-01T09:00:00",
    updatedAt: "2026-03-01T09:00:00",
    ...overrides,
  };
}

describe("getCalendarEvents", () => {
  it("includes future deadline and follow-up dates for active applications", () => {
    const events = getCalendarEvents([makeApp()], NOW);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      uid: "app-1-followUp@ai-application-support",
      date: "2026-03-16",
      summary: "Follow-up: Acme — Engineer",
      description: "Status: Applied\nApplication: https://example.com/jobs/1",
    });
    expect(events[1].uid).toBe("app-1-deadline@ai-application-support");
  });

  it("skips past dates, archived applications, invalid dates and blanks", () => {
    const events = getCalendarEvents(
      [
        makeApp({
          id: "past",
          deadline: "2026-03-14",
          followUpAt: "",
        }),
        makeApp({
          id: "rejected",
          status: "rejected",
          deadline: "2026-03-25",
          followUpAt: "",
        }),
        makeApp({
          id: "invalid",
          deadline: "2026-02-31",
          followUpAt: "",
        }),
        makeApp({ id: "blank", deadline: "", followUpAt: "" }),
        makeApp({
          id: "today",
          deadline: "2026-03-15",
          followUpAt: "",
        }),
      ],
      NOW,
    );

    expect(events).toHaveLength(1);
    expect(events[0].uid).toBe("today-deadline@ai-application-support");
    expect(countCalendarEvents([makeApp()], NOW)).toBe(2);
  });
});

describe("buildCalendarIcs", () => {
  it("builds a CRLF VCALENDAR with all-day events and stable UIDs", () => {
    const ics = buildCalendarIcs(getCalendarEvents([makeApp()], NOW), NOW);

    expect(ics).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n");
    expect(ics).toContain("UID:app-1-followUp@ai-application-support\r\n");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260316\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260317\r\n");
    expect(ics).toContain("SUMMARY:Follow-up: Acme — Engineer\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes text and folds long lines at 75 UTF-8 octets", () => {
    expect(escapeIcsText("Acme, Inc; \\ next\nline")).toBe(
      "Acme\\, Inc\\; \\\\ next\\nline",
    );

    const longSummary = `Deadline: ${"Å".repeat(80)}`;
    const ics = buildCalendarIcs(
      [
        {
          uid: "long@example",
          date: "2026-03-20",
          summary: longSummary,
          description: "Status: Applied",
        },
      ],
      NOW,
    );
    const lines = ics.split("\r\n").filter(Boolean);
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    // Unfold the CRLF + single-space continuations before checking the text.
    expect(ics.replace(/\r\n /g, "")).toContain(longSummary);
  });

  it("folds a plain line without changing its content when unfolded", () => {
    const line = `DESCRIPTION:${"x".repeat(200)}`;
    const folded = foldIcsLine(line);
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    const unfolded = folded
      .map((part, index) => (index === 0 ? part : part.slice(1)))
      .join("");
    expect(unfolded).toBe(line);
  });
});

describe("export selection", () => {
  it("has nothing to export when no future events exist", () => {
    expect(
      getCalendarEvents([makeApp({ deadline: "", followUpAt: "" })], NOW),
    ).toEqual([]);
  });
});
