import { expect, test } from "@playwright/test";
import {
  dateFromNow,
  makeApplication,
  seed,
  PROFILE_KEY,
  SETTINGS_KEY,
} from "./support/seed";

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

test("deadline reminder toggle is safe in browser mode", async ({ page }) => {
  await seed(page, { applications: [makeApplication("a", "Acme", "applied")] });
  await page.goto("/");

  await page.getByRole("button", { name: "Settings" }).click();
  const toggle = page.getByRole("checkbox", {
    name: "Notify me about due deadlines and follow-ups",
  });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(
    page.getByText("Desktop notifications only work in the installed app."),
  ).toBeVisible();
  await expect(toggle).not.toBeChecked();
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

test("cover-letter summary can be edited, saved, and cancelled", async ({
  page,
}) => {
  await seed(page, { lastTab: "profile" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

  const summary = page.getByPlaceholder(
    "Add cover letters first, then summarize.",
  );
  await expect(summary).toBeEditable();

  await summary.fill("Manual summary of my cover letters.");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save summary" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) ?? "{}").coverLetterSummary,
        PROFILE_KEY,
      ),
    )
    .toBe("Manual summary of my cover letters.");

  await summary.fill("This edit will be cancelled.");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(summary).toHaveValue("Manual summary of my cover letters.");
  await expect(page.getByText("All changes saved")).toBeVisible();
});

test("application detail scroll position survives a tab switch", async ({
  page,
}) => {
  const longText = Array.from(
    { length: 80 },
    (_, index) => `Requirement line ${index + 1}: a long, detailed sentence.`,
  ).join("\n");
  const application = makeApplication("scroll", "Scroll Corp", "applied", {
    jobDescription: longText,
    requirements: longText,
    notes: longText,
  });
  await seed(page, { applications: [application] });
  await page.goto("/");

  const detail = page.locator("#tabpanel-main .overflow-y-auto").nth(1);
  await expect(detail).toBeVisible();
  const scrollable = await detail.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  );
  expect(scrollable).toBeGreaterThan(200);

  await detail.evaluate((element) => {
    element.scrollTop = 150;
    element.dispatchEvent(new Event("scroll"));
  });
  const saved = await detail.evaluate((element) => element.scrollTop);
  expect(saved).toBeGreaterThan(0);

  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("tab", { name: "Application" }).click();
  await expect
    .poll(() => detail.evaluate((element) => element.scrollTop))
    .toBe(saved);
});

test("exports a per-application timeline CSV", async ({ page }) => {
  const application = makeApplication("timeline", "Timeline Corp", "interview");
  await seed(page, { applications: [application] });
  await page.goto("/");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export timeline" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /-timeline-\d{4}-\d{2}-\d{2}\.csv$/,
  );
});

test("exports future deadlines and follow-ups as an ICS calendar", async ({
  page,
}) => {
  const application = makeApplication("calendar", "Calendar Corp", "applied", {
    deadline: dateFromNow(3),
    followUpAt: dateFromNow(5),
  });
  await seed(page, { applications: [application], lastTab: "overview" });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Source effectiveness" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Time to first response" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export calendar (.ics)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^applications-calendar-\d{4}-\d{2}-\d{2}\.ics$/,
  );
});

test("CV sub-view starts from the profile and exports a Word file", async ({
  page,
}) => {
  const application = makeApplication("cv", "CV Corp", "applied");
  await seed(page, { applications: [application] });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await expect(
    page.getByRole("heading", { name: "Tailor a CV for this application" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start from profile" }).click();
  await expect(
    page.getByRole("heading", { name: "Tailored CV" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Jane Doe");
  await expect(page.getByText("Saved locally")).toBeVisible();

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByLabel("CV preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jane Doe" })).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Word" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);

  await page.reload();
  await page.getByRole("button", { name: "Tailored CV" }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("Jane Doe");
});

test("CV section rewrite dialog opens with guidance", async ({ page }) => {
  const application = makeApplication("cv-rewrite", "Rewrite Corp", "applied");
  await seed(page, { applications: [application], withChat: true });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Start from profile" }).click();
  await expect(page.getByText("Saved locally")).toBeVisible();

  const rewrite = page.getByRole("button", { name: "AI rewrite" });
  await expect(rewrite).toBeEnabled();
  await rewrite.click();
  await expect(
    page.getByRole("heading", { name: "Rewrite summary and headline" }),
  ).toBeVisible();
  await page
    .getByLabel("Guidance for the rewrite (optional)")
    .fill("Make it more concise.");
  await page.getByRole("button", { name: "Shorter" }).click();
  await expect(
    page.getByLabel("Guidance for the rewrite (optional)"),
  ).toHaveValue("Make it shorter and tighter without losing important facts.");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Rewrite summary and headline" }),
  ).toHaveCount(0);
});

test("CV buffered edits commit and survive reload", async ({ page }) => {
  const application = makeApplication(
    "cv-buffered",
    "Buffered Corp",
    "applied",
  );
  await seed(page, { applications: [application] });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Start from profile" }).click();
  const summary = page.getByRole("textbox", { name: "Professional summary" });
  await summary.fill("Buffered summary survives the pause.");
  await page.waitForTimeout(1_200);

  await page.reload();
  await page.getByRole("button", { name: "Tailored CV" }).click();
  await expect(
    page.getByRole("textbox", { name: "Professional summary" }),
  ).toHaveValue("Buffered summary survives the pause.");
});

test("CV language change offers headings-only or regeneration", async ({
  page,
}) => {
  const application = makeApplication(
    "cv-language",
    "Language Corp",
    "applied",
  );
  await seed(page, { applications: [application] });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Start from profile" }).click();
  const summary = page.getByRole("textbox", { name: "Professional summary" });
  await page
    .getByRole("button", { name: "Collapse Professional Summary" })
    .click();
  await expect(summary).toBeHidden();
  await page
    .getByRole("button", { name: "Expand Professional Summary" })
    .click();
  await expect(summary).toBeVisible();
  await page.getByRole("combobox", { name: "Language", exact: true }).click();
  await page.getByRole("option", { name: "Svenska" }).click();

  await expect(
    page.getByRole("heading", { name: "Change CV language to Swedish?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change headings only" }).click();
  await expect(
    page.getByText(/Headings are Swedish, but the body was written in English/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark body as translated" }).click();
  await expect(
    page.getByText(/Headings are Swedish, but the body was written in English/),
  ).toHaveCount(0);
});

test("CV preview marks page boundaries on a long CV", async ({ page }) => {
  const application = makeApplication("cv-pages", "Pages Corp", "applied");
  await seed(page, { applications: [application] });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Start from profile" }).click();
  await page.evaluate(async (applicationId) => {
    const { useCvStore } = await import("/src/stores/cvStore.ts");
    const roles = Array.from({ length: 12 }, (_, index) => ({
      id: `pages-role-${index}`,
      company: `Company ${index}`,
      role: `Engineer ${index}`,
      location: "Remote",
      startDate: "Jan 2020",
      endDate: "Dec 2022",
      current: false,
      bullets: Array.from(
        { length: 8 },
        (_, bullet) =>
          `Delivered measurable reporting improvement ${index}-${bullet}.`,
      ),
      included: true,
    }));
    useCvStore.getState().updateCv(applicationId, (current) => ({
      ...current,
      experience: [...current.experience, ...roles],
    }));
  }, application.id);

  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
});

test("CV history restores a saved version and survives reload", async ({
  page,
}) => {
  const application = makeApplication("cv-history", "History Corp", "applied");
  const now = "2026-01-01T00:00:00.000Z";
  const document = {
    schemaVersion: 1,
    language: "en",
    pageSize: "a4",
    generatedAt: now,
    updatedAt: now,
    profileFingerprint: "",
    applicationUpdatedAt: application.updatedAt,
    extraContext: "",
    contact: {
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      location: "",
      linkedinUrl: "",
      portfolioUrl: "",
      githubUrl: "",
    },
    headline: "",
    summary: "Current summary",
    skills: ["Kubernetes"],
    aiSections: ["summary"],
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
  };
  const history = {
    schemaVersion: 1,
    snapshots: [
      {
        id: "history-1",
        savedAt: now,
        label: "Benchmark version",
        document: { ...document, summary: "Older summary" },
      },
    ],
  };
  await seed(page, { applications: [application] });
  await page.addInitScript(
    ({ cvKey, historyKey, cv, historyValue }) => {
      if (localStorage.getItem("e2e-cv-history-seeded")) return;
      localStorage.setItem(cvKey, JSON.stringify(cv));
      localStorage.setItem(historyKey, JSON.stringify(historyValue));
      localStorage.setItem("e2e-cv-history-seeded", "1");
    },
    {
      cvKey: `aas:cv_${application.id}.json`,
      historyKey: `aas:cv_history_${application.id}.json`,
      cv: document,
      historyValue: history,
    },
  );
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await expect(
    page.getByRole("heading", { name: "Grounding review" }),
  ).toBeVisible();
  await expect(page.getByText("AI-assisted")).toBeVisible();
  await expect(
    page.getByText(/is not in your profile skills or extra context/),
  ).toBeVisible();
  const versions = page.getByRole("button", { name: "Versions (1)" });
  await expect(versions).toBeEnabled();
  await versions.click();
  await expect(
    page.getByRole("heading", { name: "CV versions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(
    page.getByRole("textbox", { name: "Professional summary" }),
  ).toHaveValue("Older summary");

  await page.reload();
  await page.getByRole("button", { name: "Tailored CV" }).click();
  await expect(
    page.getByRole("textbox", { name: "Professional summary" }),
  ).toHaveValue("Older summary");
  await expect(
    page.getByRole("button", { name: "Versions (2)" }),
  ).toBeEnabled();
});
