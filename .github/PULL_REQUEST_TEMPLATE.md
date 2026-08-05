## What's in vX.Y.Z

One bullet per change, grouped by type. Include only the groups that have
entries (this becomes the release description).

### Features

- User-facing additions or changes

### Bug fixes

- Issues resolved; name the user-visible symptom when helpful

### Performance

- Faster startup, lower memory, fewer requests, etc.

## Key changes

- Code-level details worth knowing for review (optional)

## Verification

- `npm run test` — N/N pass
- `npm run build` (tsc + vite) — clean
- Add `cargo check` or manual test notes when relevant

## Version

- Bumped in all 5 files (package.json, package-lock.json, tauri.conf.json,
  Cargo.toml, Cargo.lock — root `"version"` entries only)
- Tag vX.Y.Z pushed; CI built draft installers (win x64, win arm64, mac arm64)