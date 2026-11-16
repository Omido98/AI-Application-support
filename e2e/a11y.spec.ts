import { expect, test } from "@playwright/test";
import { openApp, makeApplication } from "./support/seed";
import { scan } from "./support/axe";

const application = makeApplication("acme", "Acme Corp", "interview", {
  deadline: "2026-12-31",
});

test.describe("WCAG 2.2 AA", () => {
  test("Overview tab", async ({ page }, testInfo) => {
    await openApp(page, {
      applications: [application],
      lastTab: "overview",
    });
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await scan(page, testInfo, { label: "tab-overview" });
  });

  test("Application tab", async ({ page }, testInfo) => {
    await openApp(page, {
      applications: [application],
      lastTab: "application",
    });
    await expect(page.getByLabel("Search applications")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Acme Corp" }),
    ).toBeVisible();

    await scan(page, testInfo, { label: "tab-application" });
  });

  test("Tailored CV sub-view", async ({ page }, testInfo) => {
    await openApp(page, { applications: [application] });
    await page.getByRole("button", { name: "Tailored CV" }).click();
    await page.getByRole("button", { name: "Start from profile" }).click();
    await expect(
      page.getByRole("heading", { name: "Tailored CV" }),
    ).toBeVisible();

    await scan(page, testInfo, { label: "cv-sub-view" });

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByLabel("CV preview")).toBeVisible();
    await scan(page, testInfo, { label: "cv-preview" });
  });

  test("Cover Letter Developer tab", async ({ page }, testInfo) => {
    await openApp(page, {
      applications: [application],
      lastTab: "chat",
      withChat: true,
    });
    await expect(page.getByPlaceholder(/Type your message/)).toBeVisible();
    await expect(
      page.getByText(/Draft a cover letter for Acme Corp/),
    ).toBeVisible();

    await scan(page, testInfo, { label: "tab-chat" });
  });

  test("Profile tab", async ({ page }, testInfo) => {
    await openApp(page, {
      applications: [application],
      lastTab: "profile",
    });
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    await scan(page, testInfo, { label: "tab-profile" });
  });

  test("Settings dialog traps focus and scans clean", async ({
    page,
  }, testInfo) => {
    await openApp(page, { applications: [application] });
    await page.getByRole("button", { name: "Settings" }).click();

    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("opacity", "1");

    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () =>
            !!document.activeElement?.closest('[data-slot="dialog-content"]'),
        ),
        "focus escaped the Settings dialog",
      ).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Settings" })).toBeFocused();

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(dialog).toBeVisible();
    await scan(page, testInfo, {
      label: "settings-dialog",
      include: '[data-slot="dialog-content"]',
    });
  });

  test("Onboarding dialog, first and last step", async ({ page }, testInfo) => {
    await openApp(page, { applications: [], onboardingDone: false });

    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("opacity", "1");
    await scan(page, testInfo, {
      label: "onboarding-step-1",
      include: '[data-slot="dialog-content"]',
    });

    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("button", { name: "Get started" }),
    ).toBeVisible();
    await scan(page, testInfo, {
      label: "onboarding-step-3",
      include: '[data-slot="dialog-content"]',
    });
  });

  test("Light theme application tab", async ({ page }, testInfo) => {
    await openApp(page, {
      applications: [application],
      lastTab: "application",
      theme: "light",
    });
    await expect(page.getByLabel("Search applications")).toBeVisible();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await scan(page, testInfo, { label: "light-tab-application" });
  });

  test("Light theme Settings dialog", async ({ page }, testInfo) => {
    await openApp(page, {
      applications: [application],
      lastTab: "profile",
      theme: "light",
    });
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toHaveCSS("opacity", "1");

    await scan(page, testInfo, {
      label: "light-settings-dialog",
      include: '[data-slot="dialog-content"]',
    });
  });

  test("Dark theme with a deep teal accent", async ({ page }, testInfo) => {
    await openApp(page, {
      applications: [application],
      lastTab: "profile",
      accent: "#0f6e5c",
    });
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    await scan(page, testInfo, { label: "profile-deep-teal-accent" });
  });

  test("reduced motion collapses dialog animation", async ({ page }) => {
    await openApp(page, { applications: [application] });
    await page.getByRole("button", { name: "Settings" }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();

    const durations = await dialog.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animation: style.animationDuration,
        transition: style.transitionDuration,
      };
    });
    expect(parseFloat(durations.animation)).toBeLessThanOrEqual(0.01);
    expect(parseFloat(durations.transition)).toBeLessThanOrEqual(0.01);
  });

  test("shell keeps four tabs and no nested interactive controls", async ({
    page,
  }) => {
    await openApp(page, { applications: [application] });
    await expect(page.getByRole("tab")).toHaveCount(4);
    await expect(page.locator("button button, a button, button a")).toHaveCount(
      0,
    );
  });
});
