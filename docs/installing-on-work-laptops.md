# Installing on a work laptop

This guide covers installing the app on a managed/work laptop that blocks
"untrusted" software. The app is currently unsigned, so macOS and Windows
may show a security warning on the first run. That warning is expected and
harmless — it just means the app has no paid code-signing certificate, not
that it is unsafe.

## Downloading the app

All installers live on the GitHub Releases page:

<https://github.com/Omido98/AI-Application-support/releases/latest>

- **macOS**: `AI.Application.Support_aarch64.app.tar.gz` (the app itself in an
  archive — no installation needed) or the `.dmg` installer.
- **Windows**: the `.exe` installer (pick the one matching your PC:
  `x64` for Intel/AMD chips, `arm64` for Snapdragon/ARM chips). Avoid the
  `.msi` on a work laptop — it asks for administrator rights.

## macOS

A Mac app is a single folder (`.app`) — there is no install step. Download
the `.app.tar.gz` file (a Mac with an M1 or later chip uses the
`aarch64` one), double-click to extract it with the built-in Archive
Utility, and you can open the app from anywhere (Downloads, Desktop, or
drag it into Applications).

To avoid the "downloaded from the internet" warning entirely, receive the
file with **AirDrop** instead of a browser download — apps received via
AirDrop usually open without any warning.

### "…is damaged and can't be opened. You should eject the disc image."

This is the most common error for this app, and the file is **not** actually
damaged. It appears because the app is unsigned and was downloaded from the
internet: macOS tags it with a "quarantine" flag, Gatekeeper cannot verify
it, and recent macOS versions report that as "damaged". The "eject the disc
image" hint appears because the app was opened from the mounted `.dmg`,
which is read-only so the flag can't be cleared there.

Fix it with a one-time Terminal command:

1. Drag the app out of the disc image (or archive) into **Applications** —
   never run it from inside the mounted `.dmg`.
2. Open **Terminal** (or iTerm) and run:

   ```bash
   xattr -cr "/Applications/AI Application Support.app"
   ```

3. Open the app — it works from then on.

Notes:

- Use the path to wherever you actually put the app (Downloads, Desktop,
  ...) if you didn't use Applications.
- Right-click → Open does **not** fix this particular error — the
  `xattr` command is the fix.
- If Terminal is blocked by your IT policy, receive the file via
  **AirDrop** instead (no quarantine flag is added), or ask IT to allow
  the app.

### Other macOS warnings

Check which chip your Mac has:  (top-left) → **About This Mac**. "Apple
M1" or later means you need the arm64 build; "Intel" means you need an
Intel build.

If macOS shows *"…can't be opened because it's from an unidentified
developer"* or *"Apple cannot check it for malicious software"* instead:

1. Right-click the app (or Ctrl-click) and choose **Open**.
2. Click **Open** in the confirmation dialog.

The app is allowed from then on and will always open normally.

If the app still won't open (e.g. *"the application cannot be opened"* or
the `xattr` command is refused), your laptop may have an IT security policy
(Jamf, CrowdStrike, etc.) that blocks all unsigned software — in that case
only your IT department can allow it.

## Windows

When you run a downloaded `.exe` for the first time, SmartScreen may show
*"Windows protected your PC"*:

1. Click **More info**.
2. Click **Run anyway**.

If the installer starts but Windows blocks the file another way, right-click
the file → **Properties** → check **Unblock** (under General) → OK.

## Is it safe?

You can verify the file you downloaded is genuinely this project's build
(and not a modified copy) by checking its SHA-256 hash against the project
releases:

```powershell
Get-FileHash "path\to\file.exe" -Algorithm SHA256   # Windows
```

```bash
shasum -a 256 "path/to/file.tar.gz"               # macOS
```

Compare the output with the file's hash shown on the release page. Matching
hashes mean the file is exactly what was built from the project's source
code, which you can inspect at
<https://github.com/Omido98/AI-Application-support>.
