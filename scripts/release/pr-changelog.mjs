#!/usr/bin/env node
// Render only commits introduced by the PR, using Production's notes generator.
// Usage: node scripts/release/pr-changelog.mjs <base-ref> <head-ref>
import { execFileSync } from "node:child_process";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { NOTES_CONFIG } from "../../release.config.mjs";

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error("usage: pr-changelog.mjs <base-ref> <head-ref>");
  process.exit(1);
}
// biome-ignore lint/suspicious/noUndeclaredEnvVars: GitHub supplies the CI repository identity.
const repository = process.env.GITHUB_REPOSITORY ?? "BGOrganizer/board-game-organizer";
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error("A valid GitHub repository is required");
  process.exit(1);
}

const fields = execFileSync(
  "git",
  ["log", "--format=%H%x00%B%x00", "--end-of-options", `${base}..${head}`],
  { encoding: "utf8" },
).split("\0");
const commits = [];
if (fields.length % 2 !== 1 || fields.at(-1).trim()) throw new Error("Invalid Git history");
for (let index = 0; index < fields.length - 1; index += 2) {
  const hash = fields[index].trim();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(hash)) throw new Error("Invalid Git commit hash");
  commits.push({ hash, message: fields[index + 1] });
}

const notes = await generateNotes(
  { ...NOTES_CONFIG, writerOpts: { ...NOTES_CONFIG.writerOpts, headerPartial: "" } },
  {
    cwd: process.cwd(),
    env: {},
    logger: { log() {} },
    options: { repositoryUrl: `https://github.com/${repository}.git` },
    commits,
    lastRelease: { gitHead: base },
    nextRelease: { gitHead: head, version: "Unreleased" },
  },
);
console.log(notes.trim() || "_No changes detected._");
