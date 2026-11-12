import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("release notes preserve groups and empty output while treating refs as arguments", () => {
  const dir = mkdtempSync(join(tmpdir(), "bgo-changelog-"));
  const script = resolve("scripts/release/pr-changelog.mjs");
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
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
  try {
    git("init", "-q");
    const base = commit("chore: initial");
    commit("feat(events): example feature");
    const head = commit("fix: example fix");
    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: "utf8" });
    const result = run(base, head);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /- example feature/);
    assert.match(result.stdout, /- example fix/);
    assert.doesNotMatch(result.stdout, /initial/);
    assert.match(run(head, head).stdout, /_nessuna modifica rilevata_/);
    for (const ref of ["HEAD; touch injected", "$(touch injected)", "--output=injected"]) {
      assert.notEqual(run(ref, head).status, 0);
      assert.equal(existsSync(join(dir, "injected")), false);
    }
    assert.notEqual(run().status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
