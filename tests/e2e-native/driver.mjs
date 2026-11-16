import { spawn } from "node:child_process";
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  appBinary,
  artifactsDir,
  configDir,
  dataDir,
  driverPort,
  isWindows,
  nativeDriverPort,
  xdg,
} from "./paths.mjs";

const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";
const BASE_URL = `http://127.0.0.1:${driverPort}`;

/** Tiny W3C WebDriver client for the endpoints tauri-driver proxies. */
export class WebDriver {
  sessionId = null;

  async request(method, urlPath, body) {
    const response = await fetch(`${BASE_URL}${urlPath}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (!response.ok) {
      throw new Error(
        `WebDriver ${method} ${urlPath} failed (${response.status}): ${text}`,
      );
    }
    const value = parsed?.value;
    if (value && typeof value === "object" && value.error) {
      throw new Error(`WebDriver ${method} ${urlPath}: ${value.message}`);
    }
    return value;
  }

  async startSession() {
    const value = await this.request("POST", "/session", {
      capabilities: {
        alwaysMatch: { "tauri:options": { application: appBinary } },
      },
    });
    this.sessionId = value?.sessionId;
    if (!this.sessionId)
      throw new Error("WebDriver did not return a session id");
    return this.sessionId;
  }

  async deleteSession() {
    if (!this.sessionId) return;
    try {
      await this.request("DELETE", `/session/${this.sessionId}`);
    } catch {
      // The app may already be gone; nothing else to clean up.
    }
    this.sessionId = null;
  }

  url(suffix) {
    return `/session/${this.sessionId}${suffix}`;
  }

  async find(using, value) {
    const element = await this.request("POST", this.url("/element"), {
      using,
      value,
    });
    const id = element?.[ELEMENT_KEY];
    if (!id) throw new Error(`Element not found (${using}: ${value})`);
    return id;
  }

  async findAll(using, value) {
    const elements = await this.request("POST", this.url("/elements"), {
      using,
      value,
    });
    return elements.map((element) => element?.[ELEMENT_KEY]).filter(Boolean);
  }

  async click(elementId) {
    await this.request("POST", this.url(`/element/${elementId}/click`), {});
  }

  async clear(elementId) {
    await this.request("POST", this.url(`/element/${elementId}/clear`), {});
  }

  async sendKeys(elementId, text) {
    await this.request("POST", this.url(`/element/${elementId}/value`), {
      text,
      value: [...text],
    });
  }

  async getAttribute(elementId, name) {
    return this.request(
      "GET",
      this.url(`/element/${elementId}/attribute/${name}`),
    );
  }

  async execute(script, args = []) {
    return this.request("POST", this.url("/execute/sync"), { script, args });
  }

  async waitFor(script, { timeout = 20_000, interval = 200, message } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.execute(script);
        if (last) return last;
      } catch (err) {
        last = err.message;
      }
      await sleep(interval);
    }
    throw new Error(`${message ?? script} timed out (last: ${last})`);
  }

  async waitForElement(using, value, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        return await this.find(using, value);
      } catch {
        await sleep(200);
      }
    }
    throw new Error(`Element not found in time: ${using} ${value}`);
  }

  async clickXPath(xpath) {
    const element = await this.waitForElement("xpath", xpath);
    await this.click(element);
    return element;
  }

  async fill(selector, text) {
    const element = await this.waitForElement("css selector", selector);
    await this.clear(element);
    await this.sendKeys(element, text);
    return element;
  }

  /** Press a key combo through real WebDriver key actions. */
  async pressKeys(keys) {
    await this.request("POST", this.url("/actions"), {
      actions: [
        {
          type: "key",
          id: "keyboard",
          actions: [
            ...keys.map((value) => ({ type: "keyDown", value })),
            ...keys.toReversed().map((value) => ({ type: "keyUp", value })),
          ],
        },
      ],
    });
  }

  async getCssText(selector) {
    return this.execute(
      `return document.querySelector(arguments[0])?.textContent ?? "";`,
      [selector],
    );
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function appSettingsPath() {
  return path.join(dataDir, "settings.json");
}

export function appApplicationsPath() {
  return path.join(dataDir, "applications.json");
}

/** Wipe only the e2e app's isolated data + window state. */
export function resetAppData({ keepSettings = false } = {}) {
  mkdirSync(artifactsDir, { recursive: true });
  // Clear the contents rather than removing the directory itself: a local dev
  // setup may make this path a junction to a workspace folder, and recreating
  // the root would replace that junction with a real directory.
  mkdirSync(dataDir, { recursive: true });
  for (const entry of readdirSync(dataDir)) {
    rmSync(path.join(dataDir, entry), { recursive: true, force: true });
  }
  if (!isWindows) {
    rmSync(configDir, { recursive: true, force: true });
    mkdirSync(configDir, { recursive: true });
  }
  if (keepSettings) {
    writeFileSync(
      appSettingsPath(),
      JSON.stringify(
        {
          theme: "dark",
          accent: "#34d399",
          lastTab: "application",
          onboardingDone: true,
          autoUpdateCheck: false,
          skippedUpdateVersion: "",
          notificationsEnabled: false,
          notificationLog: { day: "", keys: [] },
        },
        null,
        2,
      ),
    );
  }
}

/** Start tauri-driver, which in turn starts the matching native driver. */
export function startTauriDriver() {
  mkdirSync(artifactsDir, { recursive: true });
  const tmpDir = path.join(artifactsDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const webviewDir = path.join(artifactsDir, "webview2");
  mkdirSync(webviewDir, { recursive: true });
  // Local sandboxed runs need a workspace temp and WebView2 profile; normal
  // CI runs should use the platform defaults that tauri-driver expects.
  const localRun = Boolean(process.env.NATIVE_E2E_DATA_DIR);
  const log = createWriteStream(driverLogPath(), { flags: "a" });
  log.write(
    `[native-e2e] starting on ${process.platform}: app=${appBinary} local=${localRun}\n`,
  );
  const child = spawn(
    isWindows ? "tauri-driver.exe" : "tauri-driver",
    ["--port", String(driverPort), "--native-port", String(nativeDriverPort)],
    {
      env: {
        ...process.env,
        ...(localRun
          ? {
              TEMP: tmpDir,
              TMP: tmpDir,
              ...(isWindows ? { WEBVIEW2_USER_DATA_FOLDER: webviewDir } : {}),
            }
          : {}),
        ...(isWindows
          ? {}
          : {
              ...xdg,
              WEBKIT_DISABLE_DMABUF_RENDERER: "1",
              GDK_BACKEND: "x11",
              LIBGL_ALWAYS_SOFTWARE: "1",
            }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("error", (err) => {
    log.write(`[native-e2e] spawn error: ${err.message}\n`);
    console.error("[native-e2e] tauri-driver failed to start:", err);
  });
  child.on("exit", (code, signal) => {
    log.write(
      `[native-e2e] tauri-driver exited code=${code} signal=${signal}\n`,
    );
  });
  return child;
}

export function driverLogPath() {
  return path.join(artifactsDir, "tauri-driver.log");
}

/** Last lines of the driver log, printed on failure so CI logs are enough. */
export function driverLogTail(lines = 60) {
  try {
    return readFileSync(driverLogPath(), "utf8")
      .split("\n")
      .slice(-lines)
      .join("\n");
  } catch {
    return "(no tauri-driver log)";
  }
}

export async function waitForDriver(timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/status`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok || response.status === 404) return;
    } catch {
      // Not listening yet.
    }
    await sleep(300);
  }
  throw new Error("tauri-driver did not start listening on port 4444");
}

export function stopTauriDriver(child) {
  child?.kill();
}
