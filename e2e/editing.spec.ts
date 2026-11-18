import { expect, test, type Page } from "@playwright/test";
import {
  dateFromNow,
  defaultProfile,
  makeApplication,
  seed,
  PROFILE_KEY,
} from "./support/seed";
import type { ProfileData } from "@/types";
import { createCvDocumentFromProfile } from "@/utils/cvSchema";

const profileWithWork: ProfileData = {
  ...defaultProfile,
  workExperience: [
    {
      id: "work-1",
      company: "Fjordline",
      role: "Frontend Engineer",
      startMonth: "July",
      startYear: "2022",
      isCurrent: true,
      jobDescription: "Build accessible interfaces.",
      achievements: [],
      projects: [],
    },
  ],
};

async function openProfileWorkEntry(page: Page) {
  await page.getByRole("tab", { name: "Profile" }).click();
  await page.getByText("Frontend Engineer").first().click();
}

test("profile achievements keep spaces and new lines while typing", async ({
  page,
}) => {
  await seed(page, {
    applications: [makeApplication("profile-typing", "Acme", "applied")],
    profile: profileWithWork,
    lastTab: "profile",
  });
  await page.goto("/");

  await openProfileWorkEntry(page);
  const field = page.getByRole("textbox", {
    name: "Key achievements (one per line)",
  });
  await expect(field).toBeVisible();

  await field.click();
  await field.pressSequentially("Reduced");
  await field.pressSequentially(" ");
  // The old editor trimmed the trailing space at the 300 ms commit; the fixed
  // editor must keep the raw draft while focused.
  await page.waitForTimeout(400);
  await field.pressSequentially("costs by 30%.");
  await expect(field).toHaveValue("Reduced costs by 30%.");

  await field.press("Enter");
  await page.waitForTimeout(400);
  await field.pressSequentially("Second bullet");
  await expect(field).toHaveValue("Reduced costs by 30%.\nSecond bullet");

  await field.blur();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        PROFILE_KEY,
      );
      const data = raw ? JSON.parse(raw) : null;
      return data?.workExperience?.[0]?.achievements;
    })
    .toEqual(["Reduced costs by 30%.", "Second bullet"]);
});

test("CV bullets keep spaces and new lines across autosave and reload", async ({
  page,
}) => {
  const application = makeApplication("cv-typing", "CV Corp", "applied");
  await seed(page, {
    applications: [application],
    profile: profileWithWork,
    lastTab: "application",
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Start from profile" }).click();

  const bullets = page.getByRole("textbox", {
    name: "Bullets for Frontend Engineer",
  });
  await expect(bullets).toBeVisible();
  await bullets.fill("");

  await bullets.pressSequentially("Led");
  await bullets.pressSequentially(" ");
  await page.waitForTimeout(400);
  await bullets.pressSequentially("migration.");
  await expect(bullets).toHaveValue("Led migration.");

  await bullets.press("Enter");
  await page.waitForTimeout(400);
  await bullets.pressSequentially("Second bullet");
  await expect(bullets).toHaveValue("Led migration.\nSecond bullet");

  // A short buffered input commits on blur and must persist too.
  const company = page.getByRole("textbox", {
    name: "Company for Frontend Engineer",
  });
  await company.click();
  await company.press("End");
  await company.pressSequentially(" AB");
  await bullets.click();

  await bullets.blur();
  await page.waitForTimeout(800);
  await page.reload();

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await expect(
    page.getByRole("textbox", { name: "Bullets for Frontend Engineer" }),
  ).toHaveValue("Led migration.\nSecond bullet");
  await expect(
    page.getByRole("textbox", { name: "Company for Frontend Engineer" }),
  ).toHaveValue("Fjordline AB");
});

test("CV buffered fields adopt an external document update when not focused", async ({
  page,
}) => {
  const application = makeApplication(
    "cv-external",
    "External Corp",
    "applied",
  );
  await seed(page, {
    applications: [application],
    profile: profileWithWork,
    lastTab: "application",
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Start from profile" }).click();
  const bullets = page.getByRole("textbox", {
    name: "Bullets for Frontend Engineer",
  });
  await expect(bullets).toBeVisible();

  await page.evaluate(async (applicationId) => {
    const { useCvStore } = await import("/src/stores/cvStore.ts");
    const current = useCvStore.getState().documents[applicationId];
    if (!current) return;
    useCvStore.getState().setCv(applicationId, {
      ...current,
      experience: current.experience.map((item) => ({
        ...item,
        bullets: ["External update"],
      })),
    });
  }, application.id);

  await expect(bullets).toHaveValue("External update");
});

test("switching applications does not leak CV local state", async ({
  page,
}) => {
  const alpha = makeApplication("cv-alpha", "Alpha Corp", "applied");
  const beta = makeApplication("cv-beta", "Beta Corp", "applied");
  const alphaCv = createCvDocumentFromProfile(profileWithWork, alpha, {
    language: "sv",
    pageSize: "a4",
    extraContext: "Only for Alpha",
  });
  await seed(page, {
    applications: [alpha, beta],
    profile: profileWithWork,
    lastTab: "application",
    cvDocuments: { [alpha.id]: alphaCv },
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  await expect(
    page.getByRole("textbox", { name: "Extra context" }),
  ).toHaveValue("Only for Alpha");

  // Beta has no saved CV, so it shows the start screen. It must not inherit
  // Alpha's extra context or language.
  await page.locator("aside").getByText("Beta Corp").click();
  await expect(
    page.getByRole("heading", { name: "Tailor a CV for this application" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Extra context for this CV" }),
  ).toHaveValue("");
  // Alpha's CV is Swedish; Beta's start screen must infer its own language.
  await expect(
    page.getByRole("combobox", { name: "CV language" }),
  ).toContainText("en");

  // Returning to Alpha restores its own document state.
  await page.locator("aside").getByText("Alpha Corp").click();
  await expect(
    page.getByRole("textbox", { name: "Extra context" }),
  ).toHaveValue("Only for Alpha");
});

test("removing a CV entry is recoverable from Versions", async ({ page }) => {
  const application = makeApplication("cv-remove", "Remove Corp", "applied");
  const cv = createCvDocumentFromProfile(profileWithWork, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
  await seed(page, {
    applications: [application],
    profile: profileWithWork,
    lastTab: "application",
    cvDocuments: { [application.id]: cv },
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Tailored CV" }).click();
  const remove = page.getByRole("button", {
    name: "Remove Frontend Engineer at Fjordline",
  });
  await expect(remove).toBeVisible();
  await remove.click();

  await expect(remove).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Versions (1)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Versions (1)" }).click();
  await expect(
    page.getByText("Before removing Frontend Engineer at Fjordline"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();

  await expect(
    page.getByRole("button", {
      name: "Remove Frontend Engineer at Fjordline",
    }),
  ).toBeVisible();
});

test("deleting the only application keeps Undo available", async ({ page }) => {
  const application = makeApplication("only-app", "Only Corp", "applied");
  await seed(page, {
    applications: [application],
    profile: profileWithWork,
    lastTab: "application",
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Delete application" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // The empty state must still render the undo toast.
  await expect(page.getByText("Track your job applications")).toBeVisible();
  await expect(page.getByText("Deleted Only Corp")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.getByText("Deleted Only Corp")).toHaveCount(0);
  await expect(page.getByText("Only Corp").first()).toBeVisible();
});

test("tracker long fields commit and survive an app switch", async ({
  page,
}) => {
  const first = makeApplication("notes-a", "Notes A", "applied");
  const second = makeApplication("notes-b", "Notes B", "applied");
  await seed(page, {
    applications: [first, second],
    lastTab: "application",
  });
  await page.goto("/");

  const notes = page.locator("#app-notes");
  await notes.click();
  await notes.pressSequentially("Follow up with the hiring manager.", {
    delay: 0,
  });
  await page.locator("aside").getByText("Notes B").click();
  await page.locator("aside").getByText("Notes A").click();

  await expect(page.locator("#app-notes")).toHaveValue(
    "Follow up with the hiring manager.",
  );
});

test("restored application tags replace the local tags draft", async ({
  page,
}) => {
  const application = makeApplication("tags-app", "Tags Corp", "applied", {
    tags: ["old-tag"],
  });
  await seed(page, { applications: [application], lastTab: "application" });
  await page.goto("/");
  await expect(page.locator("#app-tags")).toHaveValue("old-tag");

  await page.evaluate(async (applicationId) => {
    const { restoreBackupBundle } = await import("/src/utils/backup.ts");
    const { useApplicationStore } =
      await import("/src/stores/applicationStore.ts");
    const current = useApplicationStore
      .getState()
      .applications.find((item) => item.id === applicationId);
    if (!current) throw new Error("missing seeded application");
    await restoreBackupBundle({
      format: "ai-application-support-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      files: {
        "applications.json": {
          applications: [{ ...current, tags: ["new-tag", "restored"] }],
          selectedApplicationId: applicationId,
        },
      },
    });
    await useApplicationStore.getState().loadApplications();
  }, application.id);

  await expect(page.locator("#app-tags")).toHaveValue("new-tag, restored");
});

test("archived applications do not show overdue deadline chips", async ({
  page,
}) => {
  const active = makeApplication("active-due", "Active Corp", "applied", {
    deadline: dateFromNow(-3),
  });
  const closed = makeApplication("closed-due", "Closed Corp", "rejected", {
    deadline: dateFromNow(-3),
  });
  await seed(page, { applications: [active, closed], lastTab: "application" });
  await page.goto("/");

  await expect(
    page.locator("aside").getByText(/Deadline 3d overdue/),
  ).toBeVisible();

  await page.getByRole("button", { name: /Archive/ }).click();
  await expect(page.locator("aside").getByText("Closed Corp")).toBeVisible();
  await expect(page.locator("aside").getByText(/overdue/)).toHaveCount(0);
});

test("leaving the tab during the undo window finalizes chat and CV deletion", async ({
  page,
}) => {
  const application = makeApplication("cleanup-app", "Cleanup Corp", "applied");
  const cv = createCvDocumentFromProfile(profileWithWork, application, {
    language: "en",
    pageSize: "a4",
    extraContext: "",
  });
  await seed(page, {
    applications: [application],
    profile: profileWithWork,
    lastTab: "application",
    withChat: true,
    cvDocuments: { [application.id]: cv },
    cvHistory: {
      [application.id]: { schemaVersion: 1, snapshots: [] },
    },
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Delete application" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Deleted Cleanup Corp")).toBeVisible();

  // Unmounting ApplicationTab ends the undo window and must run the full
  // finalize path, including the CV files.
  await page.getByRole("tab", { name: "Overview" }).click();

  await expect
    .poll(async () => {
      return page.evaluate(
        (applicationId) => ({
          chat: localStorage.getItem(`aas:chat_${applicationId}.json`),
          cv: localStorage.getItem(`aas:cv_${applicationId}.json`),
          history: localStorage.getItem(`aas:cv_history_${applicationId}.json`),
        }),
        application.id,
      );
    })
    .toEqual({ chat: null, cv: null, history: null });
});
