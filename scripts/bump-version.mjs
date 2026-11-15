#!/usr/bin/env node
/**
 * Bump the version in all five release files (AGENTS.md release rules):
 * package.json, package-lock.json root entries, tauri.conf.json, Cargo.toml
 * and the ai-application-support Cargo.lock entry.
 *
 * Usage: npm run version:bump -- 1.4.0
 * This only edits files; it does not commit, tag, or push.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(target)) {
  console.error("Usage: npm run version:bump -- <semver> (e.g. 1.4.0)");
  process.exit(1);
}

const root = process.cwd();
const file = (name) => path.join(root, name);
const readJson = (name) => JSON.parse(readFileSync(file(name), "utf8"));
const writeJson = (name, value) =>
  writeFileSync(file(name), `${JSON.stringify(value, null, 2)}\n`);

const pkg = readJson("package.json");
pkg.version = target;
writeJson("package.json", pkg);

const lock = readJson("package-lock.json");
lock.version = target;
if (lock.packages?.[""]) lock.packages[""].version = target;
writeJson("package-lock.json", lock);

const tauri = readJson("src-tauri/tauri.conf.json");
tauri.version = target;
writeJson("src-tauri/tauri.conf.json", tauri);

const cargoTomlPath = file("src-tauri/Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf8");
const currentTomlVersion = /\[package\][\s\S]*?\r?\nversion = "([^"]+)"/.exec(
  cargoToml,
)?.[1];
if (currentTomlVersion !== target) {
  const nextToml = cargoToml.replace(
    /(\[package\][\s\S]*?\r?\nversion = ")[^"]+(")/,
    `$1${target}$2`,
  );
  if (nextToml === cargoToml) {
    console.error(
      "Could not find the [package] version in src-tauri/Cargo.toml.",
    );
    process.exit(1);
  }
  writeFileSync(cargoTomlPath, nextToml);
}

const cargoLockPath = file("src-tauri/Cargo.lock");
const cargoLock = readFileSync(cargoLockPath, "utf8");
const lockPattern =
  /(\[\[package\]\]\r?\nname = "ai-application-support"\r?\nversion = ")([^"]+)(")/;
const currentLockVersion = lockPattern.exec(cargoLock)?.[2];
if (currentLockVersion !== target) {
  const nextLock = cargoLock.replace(lockPattern, `$1${target}$3`);
  if (nextLock === cargoLock) {
    console.error(
      "Could not find the ai-application-support entry in src-tauri/Cargo.lock.",
    );
    process.exit(1);
  }
  writeFileSync(cargoLockPath, nextLock);
}

console.log(`Updated all release files to ${target}.`);
console.log(
  "Next: create a release branch, commit, push, tag, and open a PR (see AGENTS.md).",
);
