import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { prepare as prepareChangelog } from "@semantic-release/changelog";
import { generateNotes } from "@semantic-release/release-notes-generator";
import releaseConfig from "../../../release.config.mjs";
import { inspectMainRelease } from "../main-release-preparation.mjs";

const helper = resolve(".github/scripts/main-release-preparation.mjs"),
  bump = resolve("scripts/release/bump-versions.mjs");
const paths = [
  "apps/api/package.json",
  "apps/mobile/package.json",
  "apps/web/package.json",
  "apps/mcp/package.json",
];
function fixture(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "bgo-main-prepare-")),
    remote = join(dir, "remote.git"),
    cwd = join(dir, "checkout");
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  execFileSync("git", ["init", "--bare", "--initial-branch=main", remote], { stdio: "pipe" });
  git("init", "--initial-branch=main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  git("config", "commit.gpgsign", "false");
  const write = (path, content) => {
    mkdirSync(join(cwd, path, ".."), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  for (const path of paths)
    write(
      path,
      `${JSON.stringify({ name: path, version: options.inconsistentSource && path === paths[2] ? "1.3.1" : (options.sourceVersion ?? "1.3.2"), private: true })}\n`,
    );
  write(
    "apps/mobile/app.config.js",
    `module.exports = { expo: { version: "${options.sourceVersion ?? "1.3.2"}", name: "BGO" } };\n`,
  );
  write("CHANGELOG.md", "# 1.3.2\n\nExisting notes\n");
  git("add", ".");
  git("commit", "-m", "feat: validated merge");
  const sourceSha = git("rev-parse", "HEAD");
  git("remote", "add", "origin", remote);
  git("push", "-u", "origin", "main");
  const inspect = () => inspectMainRelease({ sourceSha, cwd });
  const prepare = () => {
    const version = options.version ?? "1.4.0",
      notes = options.notes ?? `# ${version}\n\nNew verified functionality`;
    execFileSync(process.execPath, [bump, version], { cwd, stdio: "pipe" });
    if (!options.actualChangelog)
      write(
        "CHANGELOG.md",
        `${notes}\n\n${readFileSync(join(cwd, "CHANGELOG.md"), "utf8").trim()}\n`,
      );
    options.change?.({ cwd, write });
    git("add", ".");
    git("commit", "-m", options.subject ?? `chore(release): ${version} [skip ci]`, "-m", notes);
    const sha = git("rev-parse", "HEAD");
    git("push", "origin", "main");
    if (!options.noTag) {
      git(
        "tag",
        ...(options.annotated ? ["-a", "-m", "Release"] : []),
        `v${version}`,
        options.wrongTag ? sourceSha : sha,
      );
      git("push", "origin", `v${version}`);
    }
    git("checkout", "--detach", sourceSha);
    return sha;
  };
  return {
    cwd,
    git,
    sourceSha,
    inspect,
    prepare,
    write,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("fresh validated Main needs preparation, and a no-release semantic run remains unpublished", () => {
  const f = fixture();
  try {
    assert.deepEqual(f.inspect(), {
      mode: "prepare",
      published: false,
      sha: f.sourceSha,
      version: "",
    });
    assert.deepEqual(f.inspect(), {
      mode: "prepare",
      published: false,
      sha: f.sourceSha,
      version: "",
    });
  } finally {
    f.cleanup();
  }
});
for (const annotated of [false, true])
  test(`retries reuse only the exact prepared child and remote tag, annotated=${annotated}`, () => {
    const f = fixture({ annotated });
    try {
      const sha = f.prepare(),
        expected = { mode: "resume", published: true, sha, version: "1.4.0" };
      assert.deepEqual(f.inspect(), expected);
      assert.deepEqual(f.inspect(), expected);
      assert.equal(f.git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0], sha);
      assert.equal(f.git("rev-list", "--count", "origin/main"), "2");
    } finally {
      f.cleanup();
    }
  });
test("newer ordinary Main commits supersede this release without claiming a version", () => {
  const f = fixture();
  try {
    f.write("new-source.txt", "New merge");
    f.git("add", ".");
    f.git("commit", "-m", "feat: newer merge");
    f.git("push", "origin", "main");
    assert.deepEqual(f.inspect(), { mode: "superseded", published: false, sha: "", version: "" });
  } finally {
    f.cleanup();
  }
});

test("Site deploy allows only the merged source or its version-only child before the tag is ready", () => {
  const siteGuard = resolve(".github/scripts/check-site-main.mjs");
  const current = fixture({ noTag: true });
  const changed = fixture({
    noTag: true,
    change: ({ write }) => write("apps/site/index.ts", "new"),
  });
  const run = ({ cwd, sourceSha }, ref = "refs/heads/main") =>
    spawnSync(process.execPath, [siteGuard, ref, sourceSha], {
      cwd,
      encoding: "utf8",
    });
  try {
    assert.equal(run(current).status, 0);
    assert.equal(run(current, "refs/heads/release").status, 1);
    current.prepare();
    assert.throws(current.inspect, /tag is missing/);
    const canDeploy = run(current);
    assert.equal(canDeploy.status, 0, canDeploy.stderr);

    current.git("checkout", "main");
    current.git("commit", "--allow-empty", "-m", "feat: newer merge");
    current.git("push", "origin", "main");
    assert.equal(run(current).status, 1, "checkout must match the run SHA");
    current.git("checkout", "--detach", current.sourceSha);
    assert.equal(run(current).status, 3, "newer main makes this source stale");

    changed.prepare();
    const unsafe = run(changed);
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stderr, /unrelated files/);
  } finally {
    current.cleanup();
    changed.cleanup();
  }
});
for (const [name, options, message] of [
  [
    "unexpected source change",
    { change: ({ write }) => write("extra.txt", "unrelated") },
    /unrelated files/,
  ],
  [
    "manifest dependencies",
    {
      change: ({ cwd, write }) => {
        const path = paths[0],
          value = JSON.parse(readFileSync(join(cwd, path), "utf8"));
        value.private = false;
        write(path, JSON.stringify(value));
      },
    },
    /manifest beyond/,
  ],
  [
    "native configuration",
    {
      change: ({ cwd, write }) =>
        write(
          "apps/mobile/app.config.js",
          readFileSync(join(cwd, "apps/mobile/app.config.js"), "utf8").replace('"BGO"', '"Other"'),
        ),
    },
    /native configuration/,
  ],
  [
    "rewritten changelog",
    { change: ({ write }) => write("CHANGELOG.md", "Unrelated replacement") },
    /changelog/,
  ],
  ["missing remote tag", { noTag: true }, /tag is missing/],
  ["foreign remote tag", { wrongTag: true }, /tag is missing/],
  ["non-release subject", { subject: "chore(release): 1.4.0 unofficial" }, /subject/],
  ["downgrade", { version: "1.3.1" }, /must increase/],
  ["nonstable source", { sourceVersion: "1.3.2-beta.1" }, /source version/],
  ["inconsistent source", { inconsistentSource: true }, /Inconsistent source versions/],
])
  test(`rejects prepared ${name}`, () => {
    const f = fixture(options);
    try {
      f.prepare();
      assert.throws(f.inspect, message);
    } finally {
      f.cleanup();
    }
  });
test("source identity and actual checkout are validated before preparation", () => {
  assert.throws(() => inspectMainRelease({ sourceSha: "HEAD; echo bad" }), /validated Main/i);
  assert.throws(() => inspectMainRelease({}), /validated Main/i);
  const f = fixture();
  try {
    f.git("checkout", "-b", "unrelated");
    f.git("commit", "--allow-empty", "-m", "feat: not the verified checkout");
    assert.throws(f.inspect, /Wrong Main checkout/);
  } finally {
    f.cleanup();
  }
});
test("CLI emits bounded outputs and refuses invalid input without exposing environment data", () => {
  const f = fixture();
  try {
    const file = join(f.cwd, "outputs");
    const run = (source) =>
      spawnSync(process.execPath, [helper], {
        cwd: f.cwd,
        env: { ...process.env, GITHUB_SHA: source, GITHUB_OUTPUT: file },
        encoding: "utf8",
      });
    assert.equal(run(f.sourceSha).status, 0);
    assert.match(readFileSync(file, "utf8"), /mode=prepare\npublished=false/);
    const invalid = run("invalid");
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /refused/);
  } finally {
    f.cleanup();
  }
});

test("accepts the actual installed notes and changelog producer with the real version bump", async () => {
  const options = releaseConfig.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === "@semantic-release/release-notes-generator",
  )[1];
  const notes = await generateNotes(options, {
    cwd: process.cwd(),
    env: process.env,
    logger: { log() {} },
    options: { repositoryUrl: "https://github.com/BGOrganizer/board-game-organizer.git" },
    commits: [{ hash: "a".repeat(40), message: "feat(events): release preflight" }],
    lastRelease: { version: "1.3.2", gitTag: "v1.3.2" },
    nextRelease: { version: "1.4.0", gitTag: "v1.4.0" },
  });
  const f = fixture({ notes, actualChangelog: true });
  try {
    await prepareChangelog({}, { cwd: f.cwd, nextRelease: { notes }, logger: { log() {} } });
    const sha = f.prepare();
    assert.deepEqual(f.inspect(), { mode: "resume", published: true, sha, version: "1.4.0" });
  } finally {
    f.cleanup();
  }
});
