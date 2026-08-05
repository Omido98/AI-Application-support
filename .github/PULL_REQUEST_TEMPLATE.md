## What's new in vX.Y.Z

- User-facing changes, one bullet each (this becomes the release description)

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