# AI Application Support

A desktop app for tracking job applications, with an AI chat assistant that
helps you craft tailored cover letters and application answers.

Built with **Tauri 2**, **React 19**, **TypeScript**, **Vite**, **Zustand**,
**Tailwind CSS 4** and **shadcn/ui** components.

## Features

- **Pipeline overview** — an Overview tab with totals, response/interview/offer
  rates, status distribution, upcoming deadlines/follow-ups, six-month
  activity, recent status changes, median time to first response and source
  effectiveness. Click any item to jump to its application; export future
  deadlines and follow-ups as an `.ics` calendar file.
- **Application tracking** — manage multiple job applications with company,
  job description, requirements, company research, notes, and a status
  (Wishlist / Applied / Interview / Offer / Rejected). Track applied,
  deadline and follow-up dates, location, work mode, salary, source, contact
  details, priority and tags; status changes are recorded as history.
  Deadlines and follow-ups due within a week (or overdue) are flagged in the
  list. Search covers postings, notes and tags, sort by status, recency,
  company or deadline, export everything to CSV, export a per-application
  status timeline, and undo a deletion for eight seconds. A fit matrix matches
  requirement lines against your profile evidence and highlights gaps.
- **First-run walkthrough** — a three-step introduction to tracking,
  chatting and the profile, shown once.
- **AI chat assistant** — one chat thread per application. The agent knows the
  full job context (including the new dates/contact/location details) and your
  complete profile (education, work experience, skills, languages, previous
  cover letters), and can research companies on the web via built-in
  `web_search` / `fetch_page` tools.
  - Chat replies can be copied or saved straight into your profile as cover
    letters.
  - Web research shows live tool activity and saves the consulted links as
    citation chips on the reply; token usage and estimated Zen cost are shown
    per message.
  - Improve/deslop results arrive as versioned suggestion cards with a word
    diff and Accept / Discard; draft reviews have their own card and verdict.
  - Any draft can be exported as a PDF or DOCX from its action menu.
  - Long conversations respect a configurable context budget. Older messages
    are omitted from requests, and can be summarized into a compact hidden
    context note when needed.
  - Choose between the built-in standard prompt or your own custom prompt.
- **Tailored CV builder** — generate an editable, ATS-friendly Word CV from
  your profile and one application's job description. Edit every section,
  reorder entries and sections, add extra context, check exact keyword matches,
  and export a single-column `.docx` in English or Swedish. See
  [docs/cv-builder.md](docs/cv-builder.md).
- **Profile** — education, work experience, certifications, skills, languages,
  previous cover letters, phone and portfolio/GitHub links, per-role
  achievements, and a public profile (e.g. LinkedIn) URL that the AI can
  reference. Sections can be reordered, year pickers cover the relevant range
  automatically, date ranges are validated, and cover letters saved from chat
  link back to their application. **Import CV** reads a PDF, DOCX or TXT
  locally, structures it with your AI provider, and offers merge or replace
  after a preview.
- **Deadline reminders** — opt-in desktop notifications for overdue,
  due-today and due-tomorrow deadlines and follow-ups, deduplicated per item
  per day. See [docs/deadline-notifications.md](docs/deadline-notifications.md)
  for per-OS behaviour and troubleshooting.
- **Exports & analytics** — per-application timeline CSV, calendar `.ics`
  export, time-to-first-response and source-effectiveness analytics. See
  [docs/exports-and-analytics.md](docs/exports-and-analytics.md).
- **Settings** — light, dark or follow-system theme, accent colour, AI
  provider/model/context window, backup and restore, update checks, a
  **Copy diagnostics** report with versions, data-file sizes and the recent
  log, an **Open data folder** shortcut, and a **Reset all data** action that
  clears everything on the next start.
- **Backup & restore** — export all your data (applications, chat threads, CV
  drafts, profile, settings, API config) to a single JSON file and import it
  back. API keys are never included in a backup.
- **Update checks** — a silent check runs a few seconds after startup and
  offers newer releases in a dialog. Settings can check manually and turn the
  startup check off.

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
- `cv_<applicationId>.json` — saved tailored CV draft per application
- `profile.json` — your profile sections and saved cover letters
- `config.json` — provider, base URL, model, prompt settings (no API key
  when the keychain works)
- `settings.json` — theme and accent
- `drafts.json` — unsent chat messages, keyed by application
- `zen-prices.json` — cached model prices from the Zen docs
- `cv_<applicationId>.json` — saved tailored CV draft per application

Changes are auto-saved (debounced) and flushed when you close the app. Writes
are atomic and keep a `.bak` copy of the previous version; if a file is
damaged, the app restores it from the backup and shows a warning instead of
silently starting empty. Exported backups never include your API key.

Only one copy of the app can run at a time; launching it again brings the
existing window forward instead of letting two instances overwrite the same
files.

Logs stay on your machine in the app log directory
(`ai-application-support.log`, rotated at 2 MB). They are only read when you
click **Copy diagnostics** in Settings, which also includes app/OS versions and
data-file names and sizes — never API keys or chat contents.

## Development

Requirements: Node.js 20+, Rust (stable), and the platform prerequisites for
[Tauri 2](https://v2.tauri.app/start/prerequisites/).

```bash
npm install
npm run tauri dev
```

Useful commands:

- `npm test` — run the Vitest unit tests
- `npm run eval` — run the offline prompt/response eval harness
- `npm run eval:live` — opt-in live provider eval (see [docs/live-eval.md](docs/live-eval.md))
- `npm run bench:data` — JSON data-scale diagnostic (see [docs/data-storage.md](docs/data-storage.md))
- `npm run lint` — ESLint
- `npm run format:check` / `npm run format` — Prettier check / rewrite
- `npm run test:e2e` — Playwright browser-mode end-to-end tests
- `npm run build:e2e` / `npm run test:e2e:native` — native tauri-driver smoke tests
  (see [docs/native-e2e.md](docs/native-e2e.md))
- `npm run test:a11y` — axe WCAG 2.1/2.2 AA checks (see [docs/quality.md](docs/quality.md))
- `npm run test:perf` — render and streaming-update performance checks
- `npm run version:check` / `npm run version:bump -- X.Y.Z` — release version
  consistency check and five-file bump (see [docs/releasing.md](docs/releasing.md))
- `npx tsc --noEmit` — TypeScript typecheck
- `npm run build` — frontend production build
- `npm run build:arm64` / `npm run build:x64` — Windows ARM64 / x64 Tauri bundles
- `npm run build:mac-arm64` — macOS ARM64 bundle

## Installing

Installers and the macOS `.app.tar.gz` (no-install app bundle) are
available on the [GitHub Releases
page](https://github.com/Omido98/AI-Application-support/releases/latest).
Windows and macOS installers are intentionally unsigned (there is no
Authenticode certificate or Apple Developer ID/notarization), so SmartScreen
or Gatekeeper may warn on first launch — choose **More info → Run anyway** on
Windows. The `.sig` files on a release are **Tauri updater signatures**, not
operating-system code signatures; the built-in updater needs them to verify
downloads.
If you are installing on a managed/work laptop, see
[docs/installing-on-work-laptops.md](docs/installing-on-work-laptops.md).

## Release process

Releases are built by CI (`.github/workflows/release.yml`) when a `v*` tag is
pushed. Never release directly from `main` — the release flow is:

1. Create a branch from main: `git checkout -b release-vX.Y.Z`
2. Bump the version in **all 5 files** with
   `npm run version:bump -- X.Y.Z`, then run `npm run version:check`
   (see [docs/releasing.md](docs/releasing.md)).
3. Commit, push the branch, then tag and push:
   `git tag vX.Y.Z && git push origin vX.Y.Z`
4. Open a pull request into `main` and stop — CI uploads the installers to a
   **draft release** that is invisible to users.
5. Test the draft installers, merge the pull request, then publish the draft
   release on GitHub. Only published releases are offered by the auto-updater,
   so updates always come from code that is on `main`.

CI builds and publishes Windows x64 (.exe + .msi), Windows ARM64 (.exe),
macOS ARM64 (.dmg) and Linux x64 (AppImage) installers. Windows installers are
intentionally unsigned. The auto-updater requires the
`TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
repository secrets to be set before tagging (generate a key pair with
`npm run tauri signer generate`). Every updater artifact is published with its
`.sig` signature plus a `latest.json` manifest; those are what the updater
verifies, and removing them would break signed auto-updates.

## Tech notes

- All network requests (model lists, chat completions, web search, page
  fetch) run through the Rust backend, so the webview never hits CORS
  restrictions and the frontend CSP stays locked down.
- The `fetch_page` tool only reaches public `http`/`https` hosts on ports
  80/443. Loopback, private, link-local and cloud-metadata addresses are
  rejected, including on every redirect hop, and the resolved address is
  pinned for the connection to prevent DNS rebinding.
- Settings and theme are applied after load to avoid a light/dark flash on
  startup.
- Window size/position and the last active section are restored on the next
  launch. Keyboard shortcuts: Ctrl/Cmd+1/2/3/4 switch sections, Ctrl/Cmd+,
  opens Settings.
- PDF and DOCX exports are rendered locally in the webview; CV files are
  parsed locally and only the extracted text is sent to the configured AI
  provider when you start the import analysis.
- Data stays in plain JSON with an in-memory search. SQLite/FTS is deferred
  until the tracker outgrows personal-scale search; the measurements, thresholds
  and migration plan are in
  [docs/data-storage.md](docs/data-storage.md).
