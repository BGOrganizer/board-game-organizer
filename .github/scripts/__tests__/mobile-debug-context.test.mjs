import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.match(verify, /manifest debuggable/);
  assert.match(verify, /com\.bgo\.boardgameorganizer\.dev/);
  assert.ok(!steps.some((step) => /publish|telegram|mobile-update/i.test(step.uses ?? "")));
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Literal GitHub Actions expression.
  assert.equal(steps.at(-1).with.name, "apk-debug-${{ github.sha }}");
  assert.equal(steps.at(-1).with["retention-days"], 7);
  const eas = JSON.parse(readFileSync("apps/mobile/eas.json", "utf8"));
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.android.gradleCommand, ":app:assembleDebug");
  assert.ok(!eas.build.internal.developmentClient);
  assert.equal(eas.build.internal.android.buildType, "apk");
});
