import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  WebDriver,
  appApplicationsPath,
  appSettingsPath,
  driverLogTail,
  resetAppData,
  sleep,
  startTauriDriver,
  stopTauriDriver,
  waitForDriver,
} from "./driver.mjs";
import {
  appBinary,
  artifactsDir,
  dataDir,
  isWindows,
  logDir,
  xdg,
} from "./paths.mjs";

/**
 * Native smoke suite: exercises the real Tauri app + Rust storage layer via
 * tauri-driver. Native OS dialogs are out of scope (WebDriver cannot click
 * them); those paths stay covered by Rust unit tests and manual smoke.
 */

let driverProcess;
let driver;
let applicationsFilePath;
let settingsFilePath;

async function waitForJson(file, predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = JSON.parse(readFileSync(file, "utf8"));
      last = value;
      if (predicate(value)) return value;
    } catch (err) {
      last = err.message;
    }
    await sleep(150);
  }
  throw new Error(
    `Timed out waiting for ${path.basename(file)} (last: ${JSON.stringify(last)})`,
  );
}

function tabIsSelected(name) {
  return [
    "const tab = [...document.querySelectorAll('[role=\"tab\"]')]",
    `.find((node) => node.textContent.trim() === ${JSON.stringify(name)});`,
    "return tab?.getAttribute('aria-selected') === 'true';",
  ].join("\n");
}

before(async () => {
  if (!existsSync(appBinary)) {
    throw new Error(
      `Missing native app binary at ${appBinary} — run npm run build:e2e`,
    );
  }
  resetAppData();
  applicationsFilePath = appApplicationsPath();
  settingsFilePath = appSettingsPath();
  driverProcess = startTauriDriver();
  await waitForDriver();

  driver = new WebDriver();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await driver.startSession();
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      console.error(
        `[native-e2e] session attempt ${attempt + 1} failed: ${err.message}`,
      );
      await sleep(1_000);
    }
  }
  if (lastError) throw lastError;

  await driver.waitFor(
    "return document.readyState === 'complete' && !!document.body;",
    { timeout: 30_000, message: "app never finished loading" },
  );
});

after(async () => {
  try {
    if (existsSync(dataDir)) {
      cpSync(dataDir, path.join(artifactsDir, "app-data"), {
        recursive: true,
        force: true,
      });
    }
    const logs = path.join(dataDir, "logs");
    if (existsSync(logs)) {
      cpSync(logs, path.join(artifactsDir, "app-logs"), {
        recursive: true,
        force: true,
      });
    }
    if (existsSync(logDir)) {
      cpSync(logDir, path.join(artifactsDir, "app-logs"), {
        recursive: true,
        force: true,
      });
    }
    if (existsSync(artifactsDir)) {
      writeFileSync(
        path.join(artifactsDir, "environment.txt"),
        [
          `platform=${process.platform} arch=${process.arch}`,
          `app=${appBinary}`,
          `dataDir=${dataDir}`,
          `PATH=${process.env.PATH ?? ""}`,
        ].join("\n"),
      );
    }
  } catch {
    // Artifacts are best-effort.
  }
  await driver?.deleteSession();
  stopTauriDriver(driverProcess);
  console.log("[native-e2e] tauri-driver log tail:\n" + driverLogTail());
});

const CONTROL = "\uE009";

/**
 * Linux WebKitWebDriver does not always deliver modifier keys to the page.
 * Try the real key action first and fall back to dispatching the same event
 * the app listens for, so the shortcut logic is still exercised.
 */
async function pressShortcut(key, checkScript, message) {
  await driver.pressKeys([CONTROL, key]);
  try {
    await driver.waitFor(checkScript, { timeout: 2_000, message });
    return;
  } catch {
    // Fall through to the event-dispatch fallback.
  }
  await driver.execute(
    `window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(
      key,
    )}, ctrlKey: true, bubbles: true }));`,
  );
  await driver.waitFor(checkScript, { message });
}

async function closeDialogWithEscape() {
  const closed = "return !document.querySelector('[role=\"dialog\"]');";
  await driver.pressKeys(["\uE00C"]);
  try {
    await driver.waitFor(closed, { timeout: 1_500 });
    return;
  } catch {
    // Fall through to the event-dispatch fallback.
  }
  await driver.execute(
    "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));",
  );
  await driver.waitFor(closed, { message: "Escape did not close the dialog" });
}

test(
  "onboarding shows once and persists onboardingDone",
  { timeout: 90_000 },
  async () => {
    await driver.waitFor(
      "return !!document.querySelector('[role=\"dialog\"]');",
      { message: "first-run walkthrough did not appear" },
    );
    const dialogText = await driver.getCssText('[role="dialog"]');
    assert.match(dialogText, /Track each application/);

    await driver.clickXPath("//button[contains(normalize-space(.), 'Skip')]");
    await driver.waitFor("return !!document.querySelector('[role=\"tab\"]');");
    // The close animation can leave the overlay over the page for a moment.
    await driver.waitFor(
      "return !document.querySelector('[role=\"dialog\"]');",
    );

    const settings = await waitForJson(
      settingsFilePath,
      (value) => value.onboardingDone === true,
    );
    assert.equal(settings.onboardingDone, true);
  },
);

test(
  "creates, updates, selects, and persists applications",
  { timeout: 120_000 },
  async () => {
    await driver.waitFor(tabIsSelected("Application"));

    await driver.clickXPath(
      "//button[contains(normalize-space(.), 'Add your first application')]",
    );
    await driver.fill("#app-company", "Acme Corp");
    await driver.fill("#app-job-title", "Platform Engineer");
    await driver.waitFor(
      "return document.querySelector('aside')?.textContent.includes('Acme Corp');",
    );

    const created = await waitForJson(
      applicationsFilePath,
      (value) => value.applications?.[0]?.companyName === "Acme Corp",
    );
    assert.equal(created.applications[0].jobTitle, "Platform Engineer");
    const firstId = created.applications[0].id;

    // Update a field through the real UI and wait for the debounced disk write.
    await driver.fill("#app-company", "Acme Updated");
    const updated = await waitForJson(applicationsFilePath, (value) =>
      value.applications.some(
        (application) => application.companyName === "Acme Updated",
      ),
    );
    assert.equal(updated.applications[0].id, firstId);

    // Create a second application and verify both are on disk.
    await driver.clickXPath("//button[@aria-label='New application']");
    await driver.fill("#app-company", "Beta Ltd");
    const withTwo = await waitForJson(
      applicationsFilePath,
      (value) => value.applications.length === 2,
    );
    assert.deepEqual(
      withTwo.applications.map((application) => application.companyName).sort(),
      ["Acme Updated", "Beta Ltd"],
    );

    // Select the first application from the sidebar and verify the selection.
    await driver.clickXPath(
      "//aside//button[contains(normalize-space(.), 'Acme Updated')]",
    );
    const reselected = await waitForJson(
      applicationsFilePath,
      (value) => value.selectedApplicationId === firstId,
    );
    assert.equal(reselected.selectedApplicationId, firstId);
  },
);

test("tab shortcuts and settings persist", { timeout: 90_000 }, async () => {
  await pressShortcut(
    "1",
    "return document.querySelector('h1')?.textContent.trim() === 'Overview';",
    "Ctrl+1 did not open Overview",
  );

  await pressShortcut(
    "2",
    tabIsSelected("Application"),
    "Ctrl+2 did not open Application",
  );
  assert.equal(await driver.execute(tabIsSelected("Application")), true);

  await pressShortcut(
    "4",
    tabIsSelected("Profile"),
    "Ctrl+4 did not open Profile",
  );
  assert.equal(await driver.execute(tabIsSelected("Profile")), true);

  await pressShortcut(
    ",",
    "return document.querySelector('[role=\"dialog\"]')?.textContent.includes('Settings') ?? false;",
    "Ctrl+, did not open Settings",
  );
  await driver.waitFor("return !!document.querySelector('[role=\"dialog\"]');");

  await driver.clickXPath("//button[normalize-space(.)='Light']");
  await waitForJson(settingsFilePath, (value) => value.theme === "light");
  await waitForJson(settingsFilePath, (value) => value.lastTab === "profile");

  await closeDialogWithEscape();
});

test(
  "CV template and language controls work in the native window",
  { timeout: 120_000 },
  async () => {
    await pressShortcut(
      "2",
      tabIsSelected("Application"),
      "Ctrl+2 did not open Application",
    );
    await driver.clickXPath(
      "//button[contains(normalize-space(.), 'Tailored CV')]",
    );
    await driver.clickXPath(
      "//button[contains(normalize-space(.), 'Start from profile')]",
    );
    await driver.waitFor(
      "return !!document.querySelector('#cv-template-edit');",
      { message: "CV editor did not open" },
    );

    await driver.clickXPath("//*[@id='cv-template-edit']");
    await driver.waitFor(
      "return !!document.querySelector('[role=\"option\"]');",
      { message: "template options did not open" },
    );
    await driver.clickXPath(
      "//*[@role='option' and contains(normalize-space(.), 'Compact')]",
    );
    await driver.clickXPath(
      "//button[contains(normalize-space(.), 'Preview')]",
    );
    await driver.waitFor(
      "return document.querySelector('[aria-label=\"CV preview\"]')?.getAttribute('data-template') === 'compact';",
      { message: "compact template did not reach the preview" },
    );
    await driver.clickXPath("//button[normalize-space(.)='Edit']");

    await driver.clickXPath("//*[@id='cv-language-edit']");
    await driver.waitFor(
      "return !!document.querySelector('[role=\"option\"]');",
      { message: "language options did not open" },
    );
    await driver.clickXPath(
      "//*[@role='option' and contains(normalize-space(.), 'Svenska')]",
    );
    await driver.waitFor(
      "return document.querySelector('[role=\"dialog\"]')?.textContent.includes('Change CV language to Swedish?');",
      { message: "language review dialog did not open" },
    );
    await driver.clickXPath(
      "//button[contains(normalize-space(.), 'Change headings only')]",
    );
    await driver.waitFor(
      "return document.body.textContent.includes('Headings are Swedish');",
      { message: "mixed-language warning did not appear" },
    );
  },
);

test(
  "a second launch focuses the running instance instead of starting another",
  { timeout: 60_000 },
  async () => {
    const child = spawn(appBinary, [], {
      env: {
        ...process.env,
        ...(isWindows
          ? { WEBVIEW2_USER_DATA_FOLDER: path.join(artifactsDir, "webview2") }
          : {
              ...xdg,
              WEBKIT_DISABLE_DMABUF_RENDERER: "1",
              GDK_BACKEND: "x11",
              LIBGL_ALWAYS_SOFTWARE: "1",
            }),
      },
      stdio: "ignore",
      windowsHide: true,
    });

    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(
          new Error(
            "second instance did not exit (single-instance lock failed)",
          ),
        );
      }, 20_000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    assert.equal(exitCode, 0);
    await sleep(500);
    const stillAlive = await driver.execute(
      "return !!document.querySelector('[role=\"tab\"]');",
    );
    assert.equal(stillAlive, true);
  },
);
