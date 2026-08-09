# AI Application Support

Tauri 2 + React app for tracking job applications with an AI chat assistant.

## Releasing a new version

IMPORTANT: Never release directly from main. Always use a branch so the stable
code on main is never touched until the user explicitly merges.

1. Create a branch from main: `git checkout -b release-vX.Y.Z`
2. Make the code changes.
3. Bump the version in ALL 5 files:
   - `package.json`
   - `package-lock.json` (the root `"version"` entries only, not dependencies)
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock` (only the `ai-application-support` package entry;
     never dependency crates like num-conv or unicode-width)
4. Commit and push the branch: `git push -u origin release-vX.Y.Z`
5. Tag and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
   - CI (`.github/workflows/release.yml`) automatically builds and uploads a
     DRAFT release with all three installers: windows-x64 (.exe + .msi),
     windows-arm64 (native .exe), macos-arm64 (.dmg). Drafts are invisible to
     the auto-updater, so users never see unreleased builds.
6. Open a Pull Request from the branch into main, then STOP.
   - Do NOT merge the PR.
   - Do NOT publish the release yet.
   - The user tests the draft installers (Release page -> draft -> assets),
     then clicks "Merge pull request" on GitHub when they are satisfied.
   - The agent NEVER publishes a release. Publishing happens only after the
     PR is merged to main, and only on the user's explicit request (or the
     user publishes it themselves).
7. After the PR is merged into main, publish the draft release (Releases ->
   draft -> "Publish release"). Only then does the auto-updater offer it to
   users. This guarantees updates only ever ship code that is on main.
8. If the user reports bugs after testing: fix on the same branch, bump to a
   NEW version (e.g. v0.2.5), commit, re-tag, and re-push. Never reuse a tag.
9. After the user merges, the branch can be deleted.

Safety notes:
- Pushing to a branch or tag never modifies main. Git keeps every version.
- Old releases can be deleted by the user at any time (the repo is a
  single-commit clean slate starting at v1.0.0).
- Releases are always drafts until the user explicitly publishes them, so a
  tag push can never ship a release to users by itself.

## Local development

- `npm install` then `npm run tauri dev` for the dev app.
- This laptop is Windows on ARM: `npm run build:arm64` produces a native
  ARM64 build; `npm run build:x64` produces an x64 build.

## Run / install locally (no GitHub needed)

- "run the app (locally)" / "open the app" = `npm run tauri dev`
  — dev build of current source with hot reload, not installed.
- "install the app locally" = `npm run build:arm64` (native ARM64, this
  laptop; `npm run build:x64` for a Windows x64 build). Then MOVE the fresh
  installer out of `src-tauri\target\aarch64-pc-windows-msvc\release\bundle\`
  into the user's Downloads folder (GitHub-style filename,
  `AI.Application.Support_<version>_arm64-setup.exe`), so the installer
  exists ONLY in Downloads. The next build regenerates a fresh one in the
  bundle folder, which is moved the same way again. If a `.msi` is produced
  alongside the `.exe`, move it too.
- Nothing is ever cleaned up automatically: the user deletes old installers
  from Downloads when done, and `src-tauri\target\` is a git-ignored build
  cache (~15 GB) that can be deleted freely anytime — it is rebuilt on the
  next run/build.
- Prefer these over pushing release tags until the user wants a bulk
  release to users.
