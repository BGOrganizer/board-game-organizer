#!/usr/bin/env node
// Syncs the single product version across all apps (called by semantic-release
// via @semantic-release/exec, prepare step).
//
// Usage: node scripts/release/bump-versions.mjs <semver>
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`usage: bump-versions.mjs <semver> (got: "${version}")`);
  process.exit(1);
}

const files = ["apps/api/package.json", "apps/web/package.json", "apps/mobile/package.json"];

for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.version = version;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  bumped ${file} → ${version}`);
}

// apps/mobile/app.config.js (expo.version) — the version baked into the APK.
const configPath = "apps/mobile/app.config.js";
const config = readFileSync(configPath, "utf8").replace(
  /version: "[^"]+"/,
  `version: "${version}"`,
);
writeFileSync(configPath, config);
console.log(`  bumped ${configPath} → ${version}`);
