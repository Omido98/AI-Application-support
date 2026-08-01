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
   - CI (`.github/workflows/release.yml`) automatically builds and PUBLISHES a
     release with all three installers: windows-x64 (.exe + .msi),
     windows-arm64 (native .exe), macos-arm64 (.dmg).
6. Open a Pull Request from the branch into main, then STOP.
   - Do NOT merge the PR.
   - Do NOT publish or edit the release.
   - The user tests the release themselves and clicks "Merge pull request" on
     GitHub when they are satisfied.
7. If the user reports bugs after testing: fix on the same branch, bump to a
   NEW version (e.g. v0.2.5), commit, re-tag, and re-push. Never reuse a tag.
8. After the user merges, the branch can be deleted.

Safety notes:
- Pushing to a branch or tag never modifies main. Git keeps every version.
- Old releases stay downloadable on GitHub forever.
- The release publishes automatically on tag push; this is safe because the
  repo is private. If the repo ever becomes public, set `releaseDraft: true`
  back on in the workflow so the user can test before publishing.

## Local development

- `npm install` then `npm run tauri dev` for the dev app.
- This laptop is Windows on ARM: `npm run build:arm64` produces a native
  ARM64 build; `npm run build:x64` produces an x64 build.
