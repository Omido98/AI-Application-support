#!/usr/bin/env node
/**
 * Verify that the release version is identical in all five files required by
 * AGENTS.md. Run in CI and before tagging.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (file) =>
  JSON.parse(readFileSync(path.join(root, file), "utf8"));
const readText = (file) => readFileSync(path.join(root, file), "utf8");

const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");

const cargoVersion = /\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(
  cargoToml,
)?.[1];
const lockAppVersion =
  /\[\[package\]\]\nname = "ai-application-support"\nversion = "([^"]+)"/.exec(
    cargoLock,
  )?.[1];

const entries = [
  ["package.json", pkg.version],
  ["package-lock.json (root version)", lock.version],
  ["package-lock.json (packages[''].version)", lock.packages?.[""]?.version],
  ["src-tauri/tauri.conf.json", tauri.version],
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/Cargo.lock (ai-application-support)", lockAppVersion],
];

const missing = entries.filter(([, version]) => !version);
if (missing.length > 0) {
  console.error(
    `Could not read the version from: ${missing.map(([file]) => file).join(", ")}`,
  );
  process.exit(1);
}

const versions = new Set(entries.map(([, version]) => version));
if (versions.size !== 1) {
  console.error("Version mismatch across release files:");
  for (const [file, version] of entries) {
    console.error(`  ${file}: ${version}`);
  }
  process.exit(1);
}

console.log(
  `Version ${entries[0][1]} is consistent across ${entries.length} release file entries.`,
);
