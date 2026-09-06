---
name: release-process
description: Use when releasing a new version of this app — bumping versions, tagging, pushing a release branch, drafting a GitHub release, or fixing bugs on a release branch. Also use for running the app locally (npm run tauri dev) or building and installing a local installer.
---

# Release process

The authoritative source is AGENTS.md; this skill is the executable distillation. It is guidance with hard STOP points: never release directly from main, never merge the PR, never publish the release.

## Hard rules

- Never release directly from main. Always work on `release-vX.Y.Z` so stable code on main is untouched until the user merges.
- Bump the version in ALL 5 files: `package.json`, `package-lock.json` (root version entries only), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` (the `ai-application-support` package entry only — never dependency crates like num-conv or unicode-width).
- Never reuse a tag. A bug-fix round on the same branch bumps to a NEW version (e.g. v0.2.5).
- The agent NEVER merges the PR and NEVER publishes the release. Both are the user's explicit actions.

## Release flow

1. Create the branch from main: `git checkout -b release-vX.Y.Z`.
2. Make the code changes.
3. Bump the version in the 5 files listed above.
4. Commit and push the branch: `git push -u origin release-vX.Y.Z`.
5. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z` — CI builds a DRAFT release with all three installers (windows-x64 .exe + .msi, windows-arm64 .exe, macos-arm64 .dmg). Drafts are invisible to the auto-updater, so users never see unreleased builds.
6. Open a Pull Request from the branch into main, then STOP. Do not merge. Do not publish. Tell the user to test the draft installers (Release page → draft → assets) and merge the PR when satisfied.
7. After the user merges, the draft can be published (Releases → draft → Publish release). Only then does the auto-updater offer it. Publishing is the user's action — offer to remind them, never do it yourself.
8. Bugs after testing: fix on the same branch, bump to a NEW version, commit, re-tag, re-push. Never reuse a tag.
9. After the user merges, the branch can be deleted.

## Local run / install

- "run the app (locally)" / "open the app" = `npm run tauri dev` — dev build of current source with hot reload, not installed.
- "install the app locally" = `npm run build:arm64` (this laptop is Windows on ARM; `npm run build:x64` for a Windows x64 build).
- Installer handling (moving the fresh installer into Downloads, cache cleanup) follows the machine conventions in the global AGENTS.md.
- Prefer local installs over pushing release tags until the user wants a bulk release to users.