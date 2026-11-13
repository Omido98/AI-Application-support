import { describe, it, expect } from "vitest";
import {
  normalizeApiConfigData,
  normalizeApplicationsPayload,
  normalizeDraftsData,
  normalizeProfileData,
  normalizeSettingsData,
} from "@/utils/dataValidation";

describe("normalizeApplicationsPayload", () => {
  it("rejects a non-object or a non-array applications field", () => {
    expect(normalizeApplicationsPayload(null)).toBeNull();
    expect(normalizeApplicationsPayload([])).toBeNull();
    expect(
      normalizeApplicationsPayload({ applications: { id: "x" } }),
    ).toBeNull();
  });

  it("coerces fields and drops non-object entries", () => {
    const result = normalizeApplicationsPayload({
      applications: [
        {
          id: "a",
          companyName: 123,
          jobTitle: "Engineer",
          status: "not-a-status",
          createdAt: null,
        },
        "not an application",
        null,
      ],
      selectedApplicationId: "missing",
    });

    expect(result).not.toBeNull();
    expect(result?.applications).toHaveLength(1);
    expect(result?.applications[0]).toMatchObject({
      id: "a",
      companyName: "",
      jobTitle: "Engineer",
      status: "wishlist",
      applicationUrl: "",
      jobDescription: "",
      notes: "",
    });
    expect(typeof result?.applications[0].createdAt).toBe("string");
    // The stored selection did not exist, so the first application wins.
    expect(result?.selectedApplicationId).toBe("a");
  });

  it("normalizes tracker fields and repairs status history", () => {
    const result = normalizeApplicationsPayload({
      applications: [
        {
          id: "a",
          status: "applied",
          priority: "urgent",
          workMode: "remote",
          tags: ["  remote ", "remote", "", 42, "fintech"],
          appliedAt: "2026-02-31",
          deadline: "2026-03-15T10:00:00Z",
          followUpAt: "sometime soon",
          contactEmail: "jobs@example.com",
          statusHistory: [
            { status: "wishlist", at: "2026-01-01T00:00:00.000Z" },
            { status: "bogus", at: "2026-01-02T00:00:00.000Z" },
            { status: "applied" },
          ],
        },
      ],
    });

    const app = result?.applications[0];
    expect(app?.priority).toBe("medium");
    expect(app?.workMode).toBe("remote");
    expect(app?.tags).toEqual(["remote", "fintech"]);
    // 31 February is not a real date, so it must not reach a date input.
    expect(app?.appliedAt).toBe("");
    expect(app?.deadline).toBe("2026-03-15");
    expect(app?.followUpAt).toBe("");
    expect(app?.contactEmail).toBe("jobs@example.com");
    expect(app?.statusHistory.map((entry) => entry.status)).toEqual([
      "wishlist",
      "applied",
    ]);
    expect(app?.statusHistory.every((entry) => entry.at)).toBe(true);
  });

  it("seeds status history for files that predate it", () => {
    const result = normalizeApplicationsPayload({
      applications: [
        {
          id: "old",
          status: "interview",
          createdAt: "2025-05-01T00:00:00.000Z",
        },
      ],
    });
    expect(result?.applications[0].statusHistory).toEqual([
      { status: "interview", at: "2025-05-01T00:00:00.000Z" },
    ]);
  });

  it("generates ids for missing or duplicate ids", () => {
    const result = normalizeApplicationsPayload({
      applications: [
        { id: "same", companyName: "A" },
        { id: "same", companyName: "B" },
        { companyName: "C" },
      ],
      selectedApplicationId: "same",
    });

    const ids = result?.applications.map((app) => app.id) ?? [];
    expect(new Set(ids).size).toBe(3);
    expect(result?.selectedApplicationId).toBe("same");
  });
});

describe("normalizeProfileData", () => {
  it("returns null for a non-object", () => {
    expect(normalizeProfileData("not a profile")).toBeNull();
    expect(normalizeProfileData(null)).toBeNull();
  });

  it("coerces every collection and drops malformed entries", () => {
    const profile = normalizeProfileData({
      fullName: "Jane",
      skills: [{ id: "s1", name: "TypeScript" }, "not a skill"],
      languages: [{ name: "Danish", fluency: "not-a-level" }],
      workExperience: [
        {
          company: "Acme",
          role: "Engineer",
          projects: ["Legacy project", { name: "New project", startYear: 2024 }],
        },
      ],
      education: "not an array",
      coverLetters: [{ content: "Hello", company: 42 }],
    });

    expect(profile).not.toBeNull();
    expect(profile?.fullName).toBe("Jane");
    expect(profile?.skills).toEqual([{ id: "s1", name: "TypeScript" }]);
    expect(profile?.languages[0].fluency).toBe("Intermediate");
    expect(profile?.education).toEqual([]);
    expect(profile?.workExperience[0].projects).toHaveLength(2);
    expect(profile?.workExperience[0].projects[0].name).toBe("Legacy project");
    expect(profile?.workExperience[0].projects[1].startYear).toBe("");
    expect(profile?.coverLetters[0].company).toBeUndefined();
  });
});

describe("normalizeSettingsData", () => {
  it("falls back to a valid theme and rejects an invalid accent", () => {
    expect(normalizeSettingsData({ theme: "light", accent: "#34d399" })).toMatchObject({
      theme: "light",
      accent: "#34d399",
      lastTab: "application",
      onboardingDone: false,
    });
    expect(
      normalizeSettingsData({ theme: "system", accent: "#34d399" }),
    ).toMatchObject({
      theme: "system",
      accent: "#34d399",
      lastTab: "application",
      onboardingDone: false,
    });
    expect(
      normalizeSettingsData({
        theme: "dark",
        accent: "#34d399",
        lastTab: "chat",
      }),
    ).toMatchObject({
      theme: "dark",
      accent: "#34d399",
      lastTab: "chat",
      onboardingDone: false,
    });
    expect(normalizeSettingsData({ theme: "neon", accent: "red" })).toMatchObject({
      theme: "dark",
      accent: "",
      lastTab: "application",
      onboardingDone: false,
    });
    expect(normalizeSettingsData("nope")).toBeNull();
  });

  it("keeps every valid last tab, including overview", () => {
    for (const tab of ["application", "chat", "profile", "overview"] as const) {
      expect(normalizeSettingsData({ lastTab: tab })?.lastTab).toBe(tab);
    }
    expect(normalizeSettingsData({ lastTab: "bogus" })?.lastTab).toBe(
      "application",
    );
  });

  it("keeps a custom profile order and appends missing sections", () => {
    const normalized = normalizeSettingsData({
      profileSectionOrder: ["languages", "skills", "bogus", "languages"],
    });
    expect(normalized?.profileSectionOrder.slice(0, 2)).toEqual([
      "languages",
      "skills",
    ]);
    expect(normalized?.profileSectionOrder).toHaveLength(9);
    expect(new Set(normalized?.profileSectionOrder).size).toBe(9);
  });
});

describe("normalizeDraftsData", () => {
  it("keeps only non-empty string drafts", () => {
    expect(
      normalizeDraftsData({
        "app-1": "hello",
        "app-2": "",
        "app-3": 42,
        "": "no thread",
      }),
    ).toEqual({ "app-1": "hello" });
  });

  it("rejects prototype-mutating keys", () => {
    const drafts = normalizeDraftsData(
      JSON.parse('{"__proto__":"polluted","constructor":"x","app-1":"ok"}'),
    );
    expect(drafts).toEqual({ "app-1": "ok" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("returns null for a non-object", () => {
    expect(normalizeDraftsData([])).toBeNull();
    expect(normalizeDraftsData(null)).toBeNull();
  });
});

describe("normalizeApiConfigData", () => {
  it("coerces invalid fields and infers the provider", () => {
    const config = normalizeApiConfigData({
      baseUrl: "https://api.anthropic.com",
      apiKey: 123,
      model: null,
      webSearchEnabled: "yes",
      customSystemPrompt: 5,
      reasoningEffort: 2,
    });

    expect(config).toMatchObject({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "",
      contextWindow: 128_000,
      webSearchEnabled: false,
      customSystemPrompt: "",
      reasoningEffort: null,
      systemPromptMode: "standard",
    });
  });

  it("validates the configured context window", () => {
    expect(
      normalizeApiConfigData({ contextWindow: 32_000 })?.contextWindow,
    ).toBe(32_000);
    expect(
      normalizeApiConfigData({ contextWindow: 100 })?.contextWindow,
    ).toBe(128_000);
    expect(
      normalizeApiConfigData({ contextWindow: "many" })?.contextWindow,
    ).toBe(128_000);
  });

  it("defaults an empty config to Zen and preserves custom mode", () => {
    expect(normalizeApiConfigData({})).toMatchObject({
      provider: "zen",
      baseUrl: "",
    });
    expect(
      normalizeApiConfigData({
        systemPromptMode: "custom",
        customSystemPrompt: "Be brief.",
      }),
    ).toMatchObject({
      systemPromptMode: "custom",
      customSystemPrompt: "Be brief.",
    });
  });

  it("returns null for a non-object", () => {
    expect(normalizeApiConfigData([])).toBeNull();
    expect(normalizeApiConfigData(null)).toBeNull();
  });
});
