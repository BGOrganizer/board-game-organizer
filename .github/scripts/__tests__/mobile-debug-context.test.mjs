import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";
import { mobileDebugContext } from "../mobile-debug-context.mjs";

const context = {
  repository: "BGOrganizer/board-game-organizer",
  branch: "fix/native-tabs",
  sha: "a".repeat(40),
  clerkKey: "pk_test_fixture",
};
const pull = {
  number: 27,
  state: "open",
  base: { ref: "main" },
  head: { ref: context.branch, sha: context.sha, repo: { full_name: context.repository } },
};

test("uses the canonical Development API for exactly the current PR", () => {
  assert.deepEqual(mobileDebugContext(context, [pull]), {
    number: 27,
    apiUrl: "https://api-development-pr-27-board-game-organizers-projects.vercel.app",
  });
});

test("rejects Production, untrusted repositories and malformed build inputs", () => {
  for (const patch of [
    { repository: "fork/repository" },
    { branch: "" },
    { branch: "main" },
    { sha: undefined },
    { sha: "invalid" },
    { clerkKey: undefined },
    { clerkKey: "pk_live_fixture" },
  ])
    assert.throws(() => mobileDebugContext({ ...context, ...patch }, [pull]));
  for (const input of [undefined, null, {}])
    assert.throws(() => mobileDebugContext(context, input));
});

test("refuses closed, stale, foreign and ambiguous PRs", () => {
  for (const candidate of [
    null,
    { ...pull, state: "closed" },
    { ...pull, base: undefined },
    { ...pull, base: { ref: "other" } },
    { ...pull, head: undefined },
    { ...pull, head: { ...pull.head, ref: "other" } },
    { ...pull, head: { ...pull.head, repo: undefined } },
    { ...pull, head: { ...pull.head, repo: { full_name: "fork/repository" } } },
    { ...pull, head: { ...pull.head, sha: "b".repeat(40) } },
  ])
    assert.throws(() => mobileDebugContext(context, [candidate]));
  assert.throws(() => mobileDebugContext(context, []));
  assert.throws(() => mobileDebugContext(context, [pull, pull]));
  assert.throws(() => mobileDebugContext(context, [{ ...pull, number: 0 }]));
});

test("diagnostic workflow checks debug mode and only uploads a separate artifact", () => {
  const workflow = parse(readFileSync(".github/workflows/mobile-debug.yml", "utf8"));
  const steps = workflow.jobs.build.steps;
  assert.equal(steps[0].uses, "actions/checkout@v4");
  assert.equal(steps[0].with["persist-credentials"], false);
  assert.deepEqual(workflow.permissions, { contents: "read", "pull-requests": "read" });
  assert.equal(workflow.jobs.build.environment, "development");
  const build = steps.find((step) => step.uses === "./.github/actions/mobile-build");
  assert.equal(build.with.profile, "development");
  assert.equal(build.with["app-environment"], "development");
  assert.equal(build.with["install-dependencies"], "false");
  const verify = steps.find((step) => step.name === "Verify diagnostic APK").run;
  assert.match(verify, /dump badging/);
  assert.match(verify, /application-debuggable/);
  assert.match(verify, /com\.bgo\.boardgameorganizer\.dev/);
  assert.ok(!steps.some((step) => /publish|telegram|mobile-update/i.test(step.uses ?? "")));
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
  assert.equal(steps.at(-1).with.name, "apk-debug-${{ github.sha }}");
  assert.equal(steps.at(-1).with["retention-days"], 7);
  const eas = JSON.parse(readFileSync("apps/mobile/eas.json", "utf8"));
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.android.gradleCommand, ":app:assembleDebugOptimized");
  assert.ok(!eas.build.internal.developmentClient);
  assert.equal(eas.build.internal.android.buildType, "apk");
});

test("APK gate accepts debug Development only and fails closed before metadata", () => {
  const workflow = parse(readFileSync(".github/workflows/mobile-debug.yml", "utf8"));
  const script = workflow.jobs.build.steps.find(
    (step) => step.name === "Verify diagnostic APK",
  ).run;
  const root = mkdtempSync(join(tmpdir(), "bgo-debug-gate-"));
  try {
    const output = join(root, "apps/mobile/build-output");
    const tools = join(root, "sdk/build-tools/36.0.0");
    mkdirSync(tools, { recursive: true });
    const analyzer = join(tools, "aapt2");
    writeFileSync(
      analyzer,
      `#!/usr/bin/env node
if (process.env.FIXTURE_TOOL_FAIL === "1") process.exit(1);
if (process.argv[2] !== "dump") process.exit(2);
if (process.argv[3] === "packagename") console.log(process.env.FIXTURE_PACKAGE);
else if (process.argv[3] === "badging") console.log(process.env.FIXTURE_BADGING);
else process.exit(2);
`,
    );
    chmodSync(analyzer, 0o700);
    for (const scenario of [
      {
        count: 1,
        packageName: "com.bgo.boardgameorganizer.dev",
        badging: "application-debuggable",
        valid: true,
      },
      { count: 1, packageName: "com.bgo.boardgameorganizer", badging: "application-debuggable" },
      {
        count: 1,
        packageName: "com.bgo.boardgameorganizer.dev",
        badging: "application: label='BGO'",
      },
      {
        count: 1,
        packageName: "com.bgo.boardgameorganizer.dev",
        badging: "application-debuggable-fake",
      },
      {
        count: 1,
        packageName: "com.bgo.boardgameorganizer.dev",
        badging: "application-debuggable",
        fail: true,
      },
      { count: 0 },
      { count: 2 },
    ]) {
      rmSync(output, { recursive: true, force: true });
      mkdirSync(output, { recursive: true });
      for (let i = 0; i < scenario.count; i++) writeFileSync(join(output, `${i}.apk`), "fixture");
      const execute = () =>
        execFileSync("bash", ["-euo", "pipefail", "-c", script], {
          cwd: root,
          env: {
            ...process.env,
            ANDROID_HOME: join(root, "sdk"),
            RUNNER_TEMP: root,
            GITHUB_SHA: context.sha,
            DEBUG_API_URL: "https://development.example.test",
            FIXTURE_PACKAGE: scenario.packageName ?? "",
            FIXTURE_BADGING: scenario.badging ?? "",
            FIXTURE_TOOL_FAIL: scenario.fail ? "1" : "0",
          },
          stdio: "pipe",
        });
      if (scenario.valid) {
        execute();
        assert.equal(readFileSync(join(output, "build-mode.txt"), "utf8"), "debug-optimized\n");
        assert.equal(readFileSync(join(output, "source-head.txt"), "utf8"), `${context.sha}\n`);
      } else {
        assert.throws(execute);
        assert.throws(() => readFileSync(join(output, "build-mode.txt")));
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
