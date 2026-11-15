import { expect, test, type Page } from "@playwright/test";
import type { JobApplication } from "@/types";

const SETTINGS_KEY = "aas:settings.json";
const APPLICATIONS_KEY = "aas:applications.json";
const PROFILE_KEY = "aas:profile.json";

function dateFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeApplication(
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

interface SeedOptions {
  applications?: JobApplication[];
  lastTab?: "overview" | "application" | "chat" | "profile";
  onboardingDone?: boolean;
}

async function seed(page: Page, options: SeedOptions = {}) {
  const applications = options.applications ?? [];
  const settings = {
    theme: "dark",
    accent: "#34d399",
    lastTab: options.lastTab ?? "application",
    onboardingDone: options.onboardingDone ?? true,
    autoUpdateCheck: false,
    skippedUpdateVersion: "",
  };
  await page.addInitScript(
    ({
      settingsKey,
      applicationsKey,
      profileKey,
      settingsValue,
      apps,
      profileValue,
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
    },
    {
      settingsKey: SETTINGS_KEY,
      applicationsKey: APPLICATIONS_KEY,
      profileKey: PROFILE_KEY,
      settingsValue: settings,
      apps: applications,
      profileValue: profile,
    },
  );
}

test("first run shows the onboarding and remembers it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Track each application")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("tab", { name: "Application" })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "{}").onboardingDone,
        SETTINGS_KEY,
      ),
    )
    .toBe(true);
});

test("creates an application and filters the list", async ({ page }) => {
  await seed(page);
  await page.goto("/");

  await page
    .getByRole("button", { name: "Add your first application" })
    .click();
  await page.getByLabel("Company Name").fill("Acme Corp");
  await page.getByLabel("Job Title").fill("Platform Engineer");
  await expect(page.getByText("Acme Corp").first()).toBeVisible();

  const search = page.getByLabel("Search applications");
  await search.fill("zzz-no-match");
  await expect(page.getByText("No applications match.")).toBeVisible();
  await search.fill("Acme");
  await expect(page.getByText("Acme Corp").first()).toBeVisible();
});

test("theme changes and keyboard shortcuts switch sections", async ({
  page,
}) => {
  await seed(page, {
    applications: [makeApplication("theme", "Acme Corp", "applied")],
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+1");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.keyboard.press("Control+2");
  await expect(page.getByRole("tab", { name: "Application" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("overview shows pipeline stats and upcoming deadlines", async ({
  page,
}) => {
  const acme = makeApplication("acme", "Acme Corp", "applied", {
    deadline: dateFromNow(3),
  });
  const beta = makeApplication("beta", "Beta Ltd", "offer");
  await seed(page, { applications: [acme, beta], lastTab: "overview" });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Offers").first()).toBeVisible();
  await expect(page.getByText("Acme Corp").first()).toBeVisible();
  await expect(page.getByText("in 3d")).toBeVisible();
});

test("application filters survive a tab switch", async ({ page }) => {
  const acme = makeApplication("acme", "Acme Corp", "applied");
  const beta = makeApplication("beta", "Beta Ltd", "applied");
  await seed(page, { applications: [acme, beta] });
  await page.goto("/");

  await page.getByLabel("Search applications").fill("Beta");
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("tab", { name: "Application" }).click();

  await expect(page.getByLabel("Search applications")).toHaveValue("Beta");
  await expect(page.getByText("Beta Ltd").first()).toBeVisible();
  // The detail pane still shows the previously selected application, so scope
  // the absence check to the sidebar list.
  await expect(page.locator("aside").getByText("Acme Corp")).toHaveCount(0);
});
