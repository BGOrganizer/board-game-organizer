#!/usr/bin/env node
// Renders a markdown changelog from conventional commits between two refs.
// Used by the PR pipeline to build the draft-release changelog.
//
// Usage: node scripts/release/pr-changelog.mjs <base-ref> <head-ref>
import { execSync } from "node:child_process";

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error("usage: pr-changelog.mjs <base-ref> <head-ref>");
  process.exit(1);
}

const commits = execSync(`git log --pretty=format:%s ${base}...${head}`, { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const groups = {
  feat: "✨ Nuove funzionalità",
  fix: "🐛 Bug fix",
  perf: "⚡ Performance",
  refactor: "♻️ Refactoring",
  style: "🎨 Stile",
  docs: "📚 Documentazione",
  test: "🧪 Test",
  ci: "🔧 CI/CD",
  build: "📦 Build",
  chore: "🧹 Manutenzione",
  revert: "⏪ Revert",
};

const byType = new Map();
for (const commit of commits) {
  const match = commit.match(/^([a-z]+)(\([^)]+\))?!?:\s*(.+)/);
  const type = match && groups[match[1]] ? match[1] : "chore";
  if (!byType.has(type)) byType.set(type, []);
  byType.get(type).push(match ? match[3] : commit);
}

let md = "";
for (const [type, items] of byType) {
  md += `### ${groups[type]}\n\n`;
  for (const item of items) md += `- ${item}\n`;
  md += "\n";
}

console.log(md.trim() || "_nessuna modifica rilevata_");
