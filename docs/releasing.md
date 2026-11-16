# Releasing and code signing

The release rules live in [`AGENTS.md`](../AGENTS.md): always release from a
branch cut from `main`, never from `main` itself, and never publish from the
agent. This page covers the tooling around that process.

## Version bumps

```bash
npm run version:bump -- X.Y.Z
npm run version:check
```

`version:bump` updates all five files required by AGENTS.md:

- `package.json`
- `package-lock.json` (root `version` and `packages[""].version` only)
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml` (`[package]` section)
- `src-tauri/Cargo.lock` (only the `ai-application-support` package entry)

`version:check` fails if any of those disagree; CI runs it on every pull
request. The bump script edits files only — it does not commit, tag, or push.

## CI gates

The `PR verification` workflow runs:

- frontend: ESLint, Prettier check, version consistency, TypeScript, Vitest,
  the offline eval harness, and the production build;
- Rust on Ubuntu, Windows, and macOS: `cargo fmt --check`, Clippy with
  `-D warnings`, and `cargo test --lib` (Linux installs the Tauri/WebKit
  system libraries first);
- Playwright browser-mode e2e tests for onboarding, creating and filtering
  applications, theme switching, keyboard shortcuts, the Overview tab, and
  filter persistence;
- axe accessibility checks (WCAG 2.1/2.2 AA, serious/critical gate) and
  lightweight performance checks (the latter non-blocking while stabilising);
- native tauri-driver smoke tests on Windows and Linux (real Tauri window, IPC
  and JSON writes); macOS UI stays covered by browser Playwright.

## Signing

Updater artifacts are signed with `TAURI_SIGNING_PRIVATE_KEY` in the release
workflow; that is separate from operating-system code signing. Each updater
artifact gets a `.sig` file and the release gets a `latest.json` manifest, both
required for signed auto-updates.

### macOS

The release workflow exports signing/notarization credentials when the following
repository secrets exist (all are optional; without them the build is
unsigned):

- `APPLE_CERTIFICATE` — base64-encoded Developer ID Application `.p12`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY` — e.g. `Developer ID Application: Name (TEAMID)`
- `APPLE_ID` — Apple ID used for notarization
- `APPLE_PASSWORD` — app-specific password for that Apple ID
- `APPLE_TEAM_ID`

Tauri signs the `.app` and submits it for notarization/staple during bundling.

### Windows

Windows installers are **unsigned by design**. No Authenticode certificate is
purchased or configured, and the release workflow has no Windows signing step.
SmartScreen can therefore warn on first launch (_"Windows protected your PC"_);
choose **More info → Run anyway**. This is expected and is not a sign of a
damaged download.

The `.sig` files attached to a release are **Tauri updater signatures**, not
Windows Authenticode signatures. The auto-updater uses them to verify a
downloaded update, so they (and `latest.json`) must stay.

## Data storage

Application data is still plain JSON under the app-data directory. Full-text
search is an in-memory scan over the loaded applications, which is fast at
personal-tracker scale. The measured decision, thresholds and SQLite/FTS5
migration plan live in [data-storage.md](data-storage.md). Re-run
`npm run bench:data` before changing the storage model.
