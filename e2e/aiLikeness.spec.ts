import { expect, test } from "@playwright/test";
import { makeApplication, seed } from "./support/seed";

test("AI-likeness check is a transient modal and leaves the thread untouched", async ({
  page,
}) => {
  const application = makeApplication("ai-check", "Acme Corp", "applied");
  await seed(page, {
    applications: [application],
    withChat: true,
    lastTab: "chat",
  });
  await page.goto("/");

  await expect(page.getByText("Here is a draft:")).toBeVisible();
  await page.getByRole("button", { name: "Draft actions" }).click();
  await page.getByRole("menuitem", { name: "Check AI-likeness" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("AI-likeness check", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/No separate detector service/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Run check" })).toBeEnabled();

  const before = await page.evaluate(() =>
    localStorage.getItem("aas:chat_ai-check.json"),
  );
  // The dialog has both an X and a footer Close button; either is fine.
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();

  const after = await page.evaluate(() =>
    localStorage.getItem("aas:chat_ai-check.json"),
  );
  expect(after).toBe(before);
});
