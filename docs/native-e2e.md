# Native end-to-end tests

Browser-mode Playwright covers layout and UI flows against Vite. The native
suite covers what that cannot: the real Tauri window, IPC, and the Rust storage
layer (real `applications.json` / `settings.json` writes).

It uses [`tauri-driver`](https://v2.tauri.app/develop/tests/webdriver/) and the
platform WebDriver (msedgedriver / WebKitWebDriver). macOS is not supported by
tauri-driver; macOS UI stays covered by browser Playwright plus Rust tests.

## What it covers

`tests/e2e-native/app.e2e.test.mjs`:

1. First-run walkthrough appears once and writes `onboardingDone: true`.
2. Create → update → create a second → select an application through the UI,
   verifying the JSON on disk each time.
3. Tab shortcuts (`Ctrl+1/2/4`, `Ctrl+,`), theme selection and `lastTab`
   persistence.
4. Tab shortcuts (`Ctrl+1/2/4`, `Ctrl+,`), theme selection and `lastTab`
   persistence.
5. CV template selection, a restored saved version and the headings-only
   language flow in the real Tauri window.
6. A second launch exits and focuses the running instance (single-instance
   lock).

Native file dialogs, updater dialogs and keychain prompts are not automatable
through WebDriver; they remain covered by Rust unit tests and manual smoke.
PDF save opens a native save dialog, and history restore has no provider-free
native setup; the browser export path, PDF renderer tests, browser history flow
and axe history scan cover those code paths.

## Building and running

```bash
npm run build:e2e        # tauri build --debug --no-bundle, isolated identifier
npm run test:e2e:native  # node --test tests/e2e-native/app.e2e.test.mjs
```

`src-tauri/tauri.e2e.conf.json` overrides the bundle identifier to
`com.ai-application-support.app.e2e`, so the test app reads and writes a
separate data directory and never touches a real installation. WebView2's
profile and driver temp files go under `tests/e2e-native/artifacts/`.

Prerequisites:

- `cargo install tauri-driver --locked` (CI caches `~/.cargo/bin/tauri-driver`).
- Windows: `msedgedriver.exe` matching the installed **WebView2 Runtime** on
  `PATH`.
- Linux: `webkit2gtk-driver`, `xvfb`, and a D-Bus session; run under
  `xvfb-run -a -s "-screen 0 1280x1024x24" dbus-run-session --`.

### Local sandbox note

If the OS app-data directory is not writable (some sandboxed dev sessions),
point `NATIVE_E2E_DATA_DIR` at a workspace folder and make the app's real
identifier directory a junction to it. This is a local-only workaround; CI and
normal machines do not need it.

## CI

`.github/workflows/pr-verify.yml` has a `native-e2e` job on `windows-latest`
and `ubuntu-24.04`, gated on the frontend job. It builds the debug app, runs
the suite, and uploads `tests/e2e-native/artifacts/` on failure (driver log,
copied app data, isolated XDG homes). The job is bounded to 45 minutes.

Common failures: driver/runtime version mismatch (download the matching
msedgedriver), a stale app instance holding the single-instance lock, Linux
without a D-Bus session, or a WebKit renderer that needs
`WEBKIT_DISABLE_DMABUF_RENDERER=1` (the harness sets it).

On Windows, GitHub-hosted runners execute elevated (High integrity), where
WebView2 ignores its profile environment overrides and msedgedriver hangs
waiting for `DevToolsActivePort`. The CI job installs gsudo and runs the suite
at **Medium integrity** (`gsudo --direct --integrity Medium npm run
test:e2e:native`), which is the documented workaround for this runner setup.
