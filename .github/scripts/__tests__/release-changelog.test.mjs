import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { NOTES_CONFIG } from "../../../release.config.mjs";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "bgo-changelog-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = resolve("scripts/release/pr-changelog.mjs");
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch=main");
  const commit = (message) => {
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-qm",
      message,
    );
    return git("rev-parse", "HEAD");
  };
  const run = (args, repository) => {
    const env = { ...process.env };
    if (repository === undefined) delete env.GITHUB_REPOSITORY;
    else env.GITHUB_REPOSITORY = repository;
    return spawnSync(process.execPath, [script, ...args], { cwd: dir, env, encoding: "utf8" });
  };
  return { dir, git, commit, run };
}

test("PR notes preserve scopes, full commit links, ordered English groups and empty output", (t) => {
  const { commit, run } = fixture(t);
  const base = commit("chore: initial");
  const feature = commit("feat(events): example feature");
  const head = commit("fix(mobile): example fix");
  const result = run([base, head]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /### ✨ Features/);
  assert.match(result.stdout, /### 🐛 Bug Fixes/);
  assert(result.stdout.indexOf("### ✨ Features") < result.stdout.indexOf("### 🐛 Bug Fixes"));
  assert(
    result.stdout.includes(
      `* **events:** example feature ([${feature.slice(0, 7)}](https://github.com/BGOrganizer/board-game-organizer/commit/${feature}))`,
    ),
  );
  assert(
    result.stdout.includes(
      `* **mobile:** example fix ([${head.slice(0, 7)}](https://github.com/BGOrganizer/board-game-organizer/commit/${head}))`,
    ),
  );
  assert.doesNotMatch(result.stdout, /initial|Nuove funzionalità|Bug fix/);
  assert.equal(run([head, head]).stdout.trim(), "_No changes detected._");
});

test("PR notes exclude newer main-only commits and preserve full breaking-change messages", (t) => {
  const { git, commit, run } = fixture(t);
  commit("chore: initial");
  git("checkout", "-qb", "feature");
  const own = commit(
    "feat(release+mobile)!: new public behavior\n\nBREAKING CHANGE: Clients must use the new contract.",
  );
  git("checkout", "-q", "main");
  const base = commit("fix(api): unrelated main-only fix");
  const result = run([base, own]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /### ⚠ BREAKING CHANGES/);
  assert.match(result.stdout, /Clients must use the new contract\./);
  assert.match(result.stdout, /\*\*release\+mobile:\*\* new public behavior/);
  assert(result.stdout.includes(`/commit/${own}`));
  assert.doesNotMatch(result.stdout, /main-only fix|initial/);
});

test("PR change groups equal the actual Production generator for the same complete commits", async (t) => {
  const { commit, run } = fixture(t);
  const base = commit("chore: initial");
  const commits = [
    "ci: verify publication",
    "docs(api.v2-client+server): explain the API\n\nBREAKING CHANGE: Use the supported API endpoint.",
    "perf(tables): reduce work",
    "feat(events): improve planning",
    "fix(mobile): preserve positions",
    "Merge pull request #1 from fixture/branch",
  ].map((message) => ({ message, hash: commit(message) }));
  const head = commits.at(-1).hash;
  const repository = "Fixture-Organization/example.repo";
  const result = run([base, head], repository);
  assert.equal(result.status, 0, result.stderr);
  const expected = await generateNotes(
    { ...NOTES_CONFIG, writerOpts: { ...NOTES_CONFIG.writerOpts, headerPartial: "" } },
    {
      cwd: process.cwd(),
      env: {},
      logger: { log() {} },
      options: { repositoryUrl: `https://github.com/${repository}.git` },
      commits,
      lastRelease: { gitHead: base },
      nextRelease: { gitHead: head, version: "1.4.0" },
    },
  );
  assert.equal(result.stdout.trim(), expected.trim());
  assert.match(result.stdout, /### 📚 Documentation/);
  assert.match(result.stdout, /\*\*api\.v2-client\+server:\*\*/);
  assert(result.stdout.includes(`https://github.com/${repository}/commit/${commits[0].hash}`));
  assert.doesNotMatch(result.stdout, /Merge pull request/);
});

test("refs and hostile commit text remain data and invalid repository identities are rejected", (t) => {
  const { dir, commit, run } = fixture(t);
  const base = commit("chore: initial");
  const message = "fix(release+mobile): retain $(touch injected) and `touch injected` literally";
  const head = commit(message);
  const result = run([base, head]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\$\(touch injected\)/);
  assert.match(result.stdout, /`touch injected`/);
  for (const ref of ["HEAD; touch injected", "$(touch injected)", "--output=injected"]) {
    assert.notEqual(run([ref, head]).status, 0);
    assert.equal(existsSync(join(dir, "injected")), false);
  }
  for (const repository of [
    "owner/repo/extra",
    "owner/repo\nINJECTED=yes",
    "https://example.test/repo",
    "",
  ]) {
    const invalid = run([base, head], repository);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /valid GitHub repository/);
  }
  assert.notEqual(run([]).status, 0);
  assert.equal(existsSync(join(dir, "injected")), false);
});
