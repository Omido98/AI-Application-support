import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Paths for the native (tauri-driver) e2e suite. The debug build uses
 * `src-tauri/tauri.e2e.conf.json`, which overrides the identifier so the test
 * app reads and writes an isolated data directory and can never touch a real
 * installation's data.
 */

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

export const isWindows = process.platform === "win32";
export const identifier = "com.ai-application-support.app.e2e";

export const appBinary =
  process.env.NATIVE_APP_BINARY ||
  path.join(
    root,
    "src-tauri",
    "target",
    "debug",
    isWindows ? "ai-application-support.exe" : "ai-application-support",
  );

export const artifactsDir = path.join(
  root,
  "tests",
  "e2e-native",
  ".artifacts",
);

/** Linux XDG roots: fully isolated under the artifacts directory. */
export const xdg = {
  XDG_DATA_HOME: path.join(artifactsDir, "xdg-data"),
  XDG_CONFIG_HOME: path.join(artifactsDir, "xdg-config"),
  XDG_CACHE_HOME: path.join(artifactsDir, "xdg-cache"),
};

const appDataRoot = isWindows
  ? (process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"))
  : (xdg.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"));

const appConfigRoot = isWindows
  ? (process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"))
  : (xdg.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"));

/**
 * Local dev escape hatch: point at a workspace directory when the OS app-data
 * directory is not writable (e.g. a sandboxed CI-like session). On Windows the
 * app still resolves its normal path, so pair this with a directory junction;
 * CI does not need it.
 */
const dataOverride = process.env.NATIVE_E2E_DATA_DIR || null;

export const dataDir = dataOverride || path.join(appDataRoot, identifier);
export const configDir = dataOverride || path.join(appConfigRoot, identifier);
export const logDir = isWindows
  ? path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
      identifier,
      "logs",
    )
  : path.join(dataDir, "logs");

export const driverPort = 4444;
export const nativeDriverPort = 4445;
