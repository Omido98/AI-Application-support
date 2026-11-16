import { describe, it, expect } from "vitest";
import type { JobApplication } from "@/types";
import {
  buildReminderNotification,
  collectDueNotifications,
  freshDueNotifications,
  localDateKey,
  notificationBody,
  notificationKey,
  notificationTitle,
  notifiedKeysForDay,
  type DueNotification,
} from "@/utils/notifications";
import {
  ensureNotificationPermission,
  sendDesktopNotification,
  sendTestNotification,
} from "@/utils/notificationClient";

const TODAY = new Date(2026, 4, 20, 12, 0, 0); // 20 May 2026, local noon

function application(
  id: string,
  overrides: Partial<JobApplication> = {},
): JobApplication {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    companyName: `Company ${id}`,
    jobTitle: "Engineer",
    applicationUrl: "",
    status: "applied",
    jobDescription: "",
    applicationLanguage: "English",
    requirements: "",
    companyResearch: "",
    notes: "",
    location: "",
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
    statusHistory: [{ status: "applied", at: now }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function dateFromNow(days: number): string {
  const date = new Date(2026, 4, 20 + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

describe("collectDueNotifications", () => {
  it("includes overdue, today and tomorrow but not the day after", () => {
    const items = collectDueNotifications(
      [
        application("overdue", { deadline: dateFromNow(-3) }),
        application("today", { deadline: dateFromNow(0) }),
        application("tomorrow", { followUpAt: dateFromNow(1) }),
        application("later", { deadline: dateFromNow(2) }),
      ],
      TODAY,
    );

    expect(items.map((item) => item.applicationId)).toEqual([
      "overdue",
      "today",
      "tomorrow",
    ]);
    expect(items[0].daysUntil).toBe(-3);
    expect(items[1].daysUntil).toBe(0);
    expect(items[2].daysUntil).toBe(1);
    expect(items[2].kind).toBe("followUp");
  });

  it("skips archived applications and invalid dates", () => {
    const items = collectDueNotifications(
      [
        application("rejected", {
          status: "rejected",
          deadline: dateFromNow(-1),
        }),
        application("offer", { status: "offer", followUpAt: dateFromNow(0) }),
        application("invalid", { deadline: "2026-02-31" }),
        application("empty", { deadline: "" }),
        application("wishlist", {
          status: "wishlist",
          deadline: dateFromNow(0),
        }),
      ],
      TODAY,
    );

    expect(items.map((item) => item.applicationId)).toEqual(["wishlist"]);
  });

  it("includes both a deadline and a follow-up for one application", () => {
    const items = collectDueNotifications(
      [
        application("both", {
          companyName: " Acme ",
          deadline: dateFromNow(0),
          followUpAt: dateFromNow(1),
        }),
      ],
      TODAY,
    );

    expect(items).toHaveLength(2);
    expect(items[0].companyName).toBe("Acme");
    expect(items.map((item) => item.kind).sort()).toEqual([
      "deadline",
      "followUp",
    ]);
  });
});

describe("reminder ledger", () => {
  const due = collectDueNotifications(
    [
      application("a", { deadline: dateFromNow(-1) }),
      application("b", { followUpAt: dateFromNow(0) }),
    ],
    TODAY,
  );

  it("keys each item by application, kind and due date", () => {
    expect(notificationKey(due[0])).toBe(`a:deadline:${dateFromNow(-1)}`);
  });

  it("builds a local date key, not a UTC one", () => {
    expect(localDateKey(TODAY)).toBe("2026-05-20");
    expect(localDateKey(new Date(2026, 0, 2, 23, 30))).toBe("2026-01-02");
  });

  it("filters out items already notified today", () => {
    const keys = due.map(notificationKey);
    expect(freshDueNotifications(due, keys)).toEqual([]);
    expect(freshDueNotifications(due, [keys[0]])).toHaveLength(1);
  });

  it("ignores a ledger from a previous day", () => {
    const keys = due.map(notificationKey);
    expect(
      notifiedKeysForDay({ day: "2026-05-19", keys }, "2026-05-20"),
    ).toEqual([]);
    expect(notifiedKeysForDay({ day: "2026-05-20", keys }, "2026-05-20")).toBe(
      keys,
    );
  });
});

describe("notification copy", () => {
  const single: DueNotification = {
    applicationId: "a",
    companyName: "Acme Corp",
    jobTitle: "Platform Engineer",
    kind: "deadline",
    date: "2026-05-20",
    daysUntil: 0,
  };

  it("spells out a single reminder", () => {
    expect(notificationTitle(single)).toBe("Deadline today — Acme Corp");
    expect(notificationBody(single)).toContain("Platform Engineer");
    expect(notificationBody(single)).toContain("2026-05-20");
  });

  it("summarises several reminders and caps the body lines", () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      ...single,
      applicationId: `app-${index}`,
      companyName: `Company ${index}`,
      kind: index % 2 === 0 ? ("deadline" as const) : ("followUp" as const),
      daysUntil: index - 3,
    }));

    const notification = buildReminderNotification(many);
    expect(notification.title).toBe("6 applications need attention");
    expect(notification.body.split("\n")).toHaveLength(5);
    expect(notification.body).toContain("and 2 more");
  });
});

describe("notification client outside Tauri", () => {
  it("reports notifications as unsupported in browser mode", async () => {
    await expect(ensureNotificationPermission()).resolves.toBe("unsupported");
    await expect(sendDesktopNotification("title", "body")).resolves.toBe(false);
    await expect(sendTestNotification()).resolves.toBe(false);
  });
});
