# Releasing and code signing

The release rules live in [`AGENTS.md`](../AGENTS.md): always release from a
branch cut from `main`, never from `main` itself, and never publish from the
agent. This page covers the tooling around that process.

## Version bumps

```bash
npm run version:bump -- 1.4.0
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
  filter persistence.

## Signing

Updater artifacts are already signed with `TAURI_SIGNING_PRIVATE_KEY` in the
release workflow; that is separate from operating-system code signing.

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

Windows Authenticode signing needs a code-signing certificate (OV/EV, or Azure
Trusted Signing). The certificate is not stored in this repository, so the
repository currently produces unsigned Windows installers, which can trigger
SmartScreen warnings until a certificate is configured.

To enable it:

1. Add the base64-encoded `.pfx` as `WINDOWS_CERTIFICATE` and its password as
   `WINDOWS_CERTIFICATE_PASSWORD` repository secrets.
2. In the Windows release job, decode the `.pfx`, import it into
   `Cert:\CurrentUser\My`, and read its thumbprint.
3. Set `bundle.windows.certificateThumbprint` (and a SHA-256
   `digestAlgorithm` plus a `timestampUrl`) in a generated Tauri config passed
   with `--config`, or add the thumbprint to `src-tauri/tauri.conf.json` for a
   single-machine build.

Do not commit a certificate or its password. The agent never publishes a
release; see AGENTS.md for the draft-release workflow.

## Data storage

Application data is still plain JSON under the app-data directory. Full-text
search is an in-memory scan over the loaded applications, which is fast at
personal-tracker scale. SQLite/FTS is intentionally deferred until search or
status history outgrows that model; moving to it would also require a data
migration and changes to the backup format.
