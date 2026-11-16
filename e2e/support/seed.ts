import { expect, type Page } from "@playwright/test";
import type { JobApplication } from "@/types";

/**
 * Shared browser-mode seed data. Written with an init script so localStorage
 * exists before the app mounts; no reload races.
 */

export const SETTINGS_KEY = "aas:settings.json";
export const APPLICATIONS_KEY = "aas:applications.json";
export const PROFILE_KEY = "aas:profile.json";
export const CONFIG_KEY = "aas:config.json";

export function dateFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function makeApplication(
  id: string,
  companyName: string,
  status: JobApplication["status"],
  overrides: Partial<JobApplication> = {},
): JobApplication {
  const now = new Date().toISOString();
  return {
    id,
    companyName,
    jobTitle: "Frontend Engineer",
    applicationUrl: "https://example.com/jobs",
    status,
    jobDescription: "Build things with TypeScript and React.",
    applicationLanguage: "English",
    requirements: "Strong TypeScript and React experience.",
    companyResearch: "",
    notes: "",
    location: "Copenhagen",
    workMode: "hybrid",
    salary: "",
    source: "Referral",
    priority: "medium",
    tags: ["frontend"],
    appliedAt: dateFromNow(-10),
    deadline: "",
    followUpAt: "",
    contactName: "",
    contactEmail: "",
    statusHistory: [{ status, at: now }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const profile = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  city: "Copenhagen",
  country: "Denmark",
  linkedinUrl: "",
  coverLetterSummary: "",
  interests: [],
  education: [],
  coverLetters: [],
  workExperience: [],
  otherEngagements: [],
  certifications: [],
  skills: [{ id: "s1", name: "TypeScript" }],
  languages: [],
};

/**
 * A persisted chat config. In browser mode the keychain call fails, the store
 * keeps the key session-only, and the chat UI renders without a provider.
 */
const chatConfig = {
  provider: "zen",
  baseUrl: "https://opencode.ai/zen/v1",
  apiKey: "e2e-test-key",
  model: "deepseek-v4-flash-free",
  reasoningEffort: null,
  contextWindow: 128000,
  webSearchEnabled: false,
  systemPromptMode: "standard",
  customSystemPrompt: "",
  keychainAccount: null,
  sessionKeyOnly: true,
};

function makeThread(application: JobApplication) {
  const timestamp = new Date().toISOString();
  const company = application.companyName;
  return {
    key: `aas:chat_${application.id}.json`,
    value: [
      {
        id: "e2e-user-1",
        role: "user",
        content: `Draft a cover letter for ${company}.`,
        timestamp,
      },
      {
        id: "e2e-assistant-1",
        role: "assistant",
        content:
          `Here is a draft:\n\nDear hiring team at **${company}**,\n\n` +
          "I am applying for the Frontend Engineer role and would love to help.",
        timestamp,
      },
    ],
  };
}

export interface SeedOptions {
  applications?: JobApplication[];
  lastTab?: "overview" | "application" | "chat" | "profile";
  onboardingDone?: boolean;
  theme?: "dark" | "light" | "system";
  accent?: string;
  /** Seed an API key and one chat thread so the chat UI is meaningful. */
  withChat?: boolean;
}

export async function seed(
  page: Page,
  options: SeedOptions = {},
): Promise<void> {
  const applications = options.applications ?? [];
  const settings = {
    theme: options.theme ?? "dark",
    accent: options.accent ?? "#34d399",
    lastTab: options.lastTab ?? "application",
    onboardingDone: options.onboardingDone ?? true,
    autoUpdateCheck: false,
    skippedUpdateVersion: "",
    notificationsEnabled: false,
    notificationLog: { day: "", keys: [] },
  };
  const config = options.withChat ? chatConfig : null;
  const thread =
    options.withChat && applications[0] ? makeThread(applications[0]) : null;

  await page.addInitScript(
    ({
      settingsKey,
      applicationsKey,
      profileKey,
      configKey,
      settingsValue,
      apps,
      profileValue,
      configValue,
      threadValue,
    }) => {
      localStorage.setItem(settingsKey, JSON.stringify(settingsValue));
      localStorage.setItem(
        applicationsKey,
        JSON.stringify({
          applications: apps,
          selectedApplicationId: apps[0]?.id ?? null,
        }),
      );
      localStorage.setItem(profileKey, JSON.stringify(profileValue));
      if (configValue) {
        localStorage.setItem(configKey, JSON.stringify(configValue));
      }
      if (threadValue) {
        localStorage.setItem(
          threadValue.key,
          JSON.stringify(threadValue.value),
        );
      }
    },
    {
      settingsKey: SETTINGS_KEY,
      applicationsKey: APPLICATIONS_KEY,
      profileKey: PROFILE_KEY,
      configKey: CONFIG_KEY,
      settingsValue: settings,
      apps: applications,
      profileValue: profile,
      configValue: config,
      threadValue: thread,
    },
  );
}

/** Seed, open the app, and wait until the shell and fonts have settled. */
export async function openApp(
  page: Page,
  options: SeedOptions = {},
): Promise<void> {
  await seed(page, options);
  await page.goto("/");
  // A modal (first-run walkthrough) hides the shell from the a11y tree, so
  // wait for either the tab bar or a dialog before touching the page.
  await expect(
    page
      .getByRole("tab", { name: "Overview" })
      .or(page.getByRole("dialog"))
      .first(),
  ).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
