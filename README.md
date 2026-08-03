# AI Application Support

A desktop app for tracking job applications, with an AI chat assistant that
helps you craft tailored cover letters and application answers.

Built with **Tauri 2**, **React 19**, **TypeScript**, **Vite**, **Zustand**,
**Tailwind CSS 4** and **shadcn/ui** components.

## Features

- **Application tracking** — manage multiple job applications with company,
  job description, requirements, company research, notes, and a status
  (Wishlist / Applied / Interview / Offer / Rejected). Search and filter by
  status, open the application URL in your browser, and delete with
  confirmation.
- **AI chat assistant** — one chat thread per application. The agent knows the
  full job context and your complete profile (education, work experience,
  skills, languages, previous cover letters), and can research companies on
  the web via built-in `web_search` / `fetch_page` tools.
  - Chat replies can be copied or saved straight into your profile as cover
    letters.
  - Choose between the built-in standard prompt or your own custom prompt.
- **Profile** — education, work experience, certifications, skills, languages,
  previous cover letters, and a public profile (e.g. LinkedIn) URL that the
  AI can reference.
- **Settings** — light/dark theme and a custom accent colour.
- **Backup & restore** — export all your data (applications, chat threads,
  profile, settings, API config) to a single JSON file and import it back.
- **Auto-updates** — the app checks for new releases on GitHub and offers to
  download and install them.

## AI providers

The chat assistant works with any of these providers (OpenAI-compatible):

| Provider | Notes |
| --- | --- |
| **OpenCode Zen** | Default. Free and paid models, pricing shown in the model picker. |
| **Anthropic** | Claude models via the Messages API. |
| **OpenAI** | OpenAI-compatible chat completions. |
| **Custom** | Any OpenAI-compatible endpoint (LM Studio, Ollama, ...). |

Your API key is stored in your **operating system's keychain** (Windows
Credential Manager / macOS Keychain / libsecret) and is never written to disk
when the keychain is available. If no keychain is available, the key falls
back to the config file. Keys are never sent anywhere except to the provider
you configure.

## Data & storage

All data lives in your system's app-data directory as plain JSON files:

- `applications.json` — applications + selection state
- `chat_<applicationId>.json` — one chat thread per application
- `profile.json` — your profile sections and saved cover letters
- `config.json` — provider, base URL, model, prompt settings (no API key
  when the keychain works)
- `settings.json` — theme and accent
- `zen-prices.json` — cached model prices from the Zen docs

Changes are auto-saved (debounced) and flushed when you close the app.

## Development

Requirements: Node.js 20+, Rust (stable), and the platform prerequisites for
[Tauri 2](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Useful commands:

- `npm test` — run the Vitest unit tests
- `npx tsc --noEmit` — TypeScript typecheck
- `npm run build` — frontend production build
- `npm run build:arm64` / `npm run build:x64` — Windows ARM64 / x64 Tauri bundles
- `npm run build:mac-arm64` — macOS ARM64 bundle

## Installing

Installers and the macOS `.app.tar.gz` (no-install app bundle) are
available on the [GitHub Releases
page](https://github.com/Omido98/AI-Application-support/releases/latest).
If you are installing on a managed/work laptop, see
[docs/installing-on-work-laptops.md](docs/installing-on-work-laptops.md).

## Release process

Releases are built by CI (`.github/workflows/release.yml`) when a `v*` tag is
pushed. Never release directly from `main` — the release flow is:

1. Create a branch from main: `git checkout -b release-vX.Y.Z`
2. Bump the version in **all 5 files**: `package.json`,
   `package-lock.json` (root entries only), `src-tauri/tauri.conf.json`,
   `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` (the
   `ai-application-support` package entry only).
3. Commit, push the branch, then tag and push:
   `git tag vX.Y.Z && git push origin vX.Y.Z`
4. Open a pull request into `main` and stop — CI uploads the installers to a
   **draft release** that is invisible to users.
5. Test the draft installers, merge the pull request, then publish the draft
   release on GitHub. Only published releases are offered by the auto-updater,
   so updates always come from code that is on `main`.

CI builds and publishes Windows x64 (.exe + .msi), Windows ARM64 (.exe) and
macOS ARM64 (.dmg) installers. The auto-updater requires the
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
repository secrets to be set before tagging (generate a key pair with
`npm run tauri signer generate`).

## Tech notes

- All network requests (model lists, chat completions, web search, page
  fetch) run through the Rust backend, so the webview never hits CORS
  restrictions and the frontend CSP stays locked down.
- Settings and theme are applied after load to avoid a light/dark flash on
  startup.
