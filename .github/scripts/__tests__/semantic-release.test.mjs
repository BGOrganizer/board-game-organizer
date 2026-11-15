import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { generateNotes } from "@semantic-release/release-notes-generator";
import config from "../../../release.config.mjs";

const plugin = (name) =>
  config.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)[1];
const context = (messages) => ({
  cwd: process.cwd(),
  env: {},
  logger: { log() {} },
  options: { repositoryUrl: "https://github.com/BGOrganizer/board-game-organizer.git" },
  lastRelease: { version: "1.3.2", gitTag: "v1.3.2" },
  nextRelease: { version: "1.4.0", gitTag: "v1.4.0" },
  commits: messages.map((message, index) => ({
    message,
    hash: String(index + 1).padStart(40, "0"),
  })),
});

test("the installed release generator renders the configured changelog without provider calls", async () => {
  const notes = await generateNotes(
    plugin("@semantic-release/release-notes-generator"),
    context([
      "feat(events): explain simultaneous roles",
      "fix(mobile): preserve compact icon geometry",
      "refactor(release+mobile): keep publication consistent",
      "ci: verify production provenance",
    ]),
  );
  for (const text of [
    "1.4.0",
    "✨ Features",
    "🐛 Bug Fixes",
    "♻️ Refactoring",
    "🔧 CI/CD",
    "explain simultaneous roles",
    "preserve compact icon geometry",
    "keep publication consistent",
    "verify production provenance",
    "compare/v1.3.2...v1.4.0",
  ])
    assert(notes.includes(text), `Missing release notes content: ${text}`);
});

test("the real analyzer preserves conventional release levels and broader scopes", async () => {
  const options = plugin("@semantic-release/commit-analyzer");
  for (const [message, expected] of [
    ["feat(release+mobile): publish verified updates", "minor"],
    ["fix: repair release notes", "patch"],
    ["feat!: change the public contract", "major"],
    ["fix(release+mobile)!: change a required contract", "major"],
    ["docs: explain the replacement\n\nBREAKING CHANGE: Use the new contract.", "major"],
    ["refactor: simplify release internals", null],
  ])
    assert.equal(await analyzeCommits(options, context([message])), expected, message);
});

test("all supported change types use ordered English sections and linked commit references", async () => {
  const sections = [
    ["feat", "✨ Features"],
    ["fix", "🐛 Bug Fixes"],
    ["perf", "⚡ Performance"],
    ["refactor", "♻️ Refactoring"],
    ["style", "🎨 Style"],
    ["docs", "📚 Documentation"],
    ["test", "🧪 Tests"],
    ["ci", "🔧 CI/CD"],
    ["build", "📦 Build"],
    ["chore", "🧹 Chores"],
    ["revert", "⏪ Reverts"],
  ];
  const input = context(
    sections.toReversed().map(([type]) => `${type}(release): explain ${type} change`),
  );
  const notes = await generateNotes(plugin("@semantic-release/release-notes-generator"), input);
  let previous = -1;
  for (const [, section] of sections) {
    const position = notes.indexOf(`### ${section}`);
    assert(position > previous, `Missing or unordered release section: ${section}`);
    previous = position;
  }
  for (const { hash } of input.commits)
    assert(notes.includes(`https://github.com/BGOrganizer/board-game-organizer/commit/${hash}`));
});
