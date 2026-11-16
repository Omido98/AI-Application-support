import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-mode end-to-end tests. These run the Vite dev server (localStorage
 * persistence) rather than a packaged Tauri window; Tauri-specific file
 * dialogs and keychain paths are covered by Rust unit tests instead.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // Behaviour tests; accessibility and perf run in their own projects.
      testIgnore: /(a11y|perf)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "a11y",
      testMatch: /a11y\.spec\.ts/,
      timeout: 60_000,
      use: {
        ...devices["Desktop Chrome"],
        // Collapse entry animations so axe never samples a half-open dialog.
        reducedMotion: "reduce",
      },
    },
    {
      name: "perf",
      testMatch: /perf\.spec\.ts/,
      timeout: 90_000,
      retries: 0,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
