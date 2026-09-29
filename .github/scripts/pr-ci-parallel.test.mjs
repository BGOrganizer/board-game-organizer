import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const pr = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
const watchdog = parse(readFileSync(".github/workflows/pr-ci-fail-fast.yml", "utf8"));
const cleanup = parse(readFileSync(".github/workflows/pr-ci-cleanup.yml", "utf8"));
const jobs = pr.jobs;
const quality = ["commitlint", "lint", "typecheck", "unit-tests", "integration-tests", "build-api"];
const step = (job, name) => jobs[job].steps.find((item) => item.name === name);

test("quality checks and API/Web builds overlap; neither API Preview precedes quality gates", () => {
  assert.equal(pr.concurrency["cancel-in-progress"], true);
  for (const name of [...quality, "build-web", "detect-mobile-changes"]) {
    assert.equal(jobs[name].needs, undefined, `${name} should run independently`);
  }
  for (const name of ["deploy-preview-api", "deploy-development-api"]) {
    for (const gate of quality)
      assert.ok(jobs[name].needs.includes(gate), `${name} must await ${gate}`);
  }
  assert.ok(jobs["deploy-preview-web"].needs.includes("build-web"));
});

test("APK builds overlap but embed separate isolated and development Preview URLs", () => {
  assert.ok(jobs["build-mobile-internal"].needs.includes("deploy-preview-api"));
  assert.deepEqual(jobs["build-mobile-development"].needs, ["deploy-development-api"]);
  assert.equal(
    step("build-mobile-internal", "🏗️ Build APK (eas build --local, internal profile)").with[
      "api-url"
    ],
    `\${{ needs.deploy-preview-api.outputs.branch-url }}`,
  );
  assert.equal(
    step("build-mobile-development", "🏗️ Build internal APK against development Preview").with[
      "api-url"
    ],
    `\${{ needs.deploy-development-api.outputs.url }}`,
  );
  assert.ok(jobs["e2e-maestro"].needs.includes("build-mobile-internal"));
  assert.ok(!jobs["e2e-maestro"].needs.includes("build-mobile-development"));
  for (const name of ["e2e-maestro", "e2e-playwright"]) {
    assert.ok(jobs[name].needs.includes("deploy-development-api"));
  }
  for (const gate of [
    "e2e-maestro",
    "e2e-playwright",
    "cleanup-e2e-user",
    "cleanup-e2e-db",
    "build-mobile-development",
  ]) {
    assert.ok(jobs["draft-release"].needs.includes(gate));
  }
});

test("PR publishes the verified development APK to EAS and keeps GitHub and Telegram links", () => {
  const steps = jobs["draft-release"].steps;
  const upload = steps.find((item) => item.id === "eas");
  const publish = steps.find((item) => item.uses === "./.github/actions/publish-draft-release");
  const notify = step("draft-release", "🔗 Compose Telegram links");
  assert.ok(
    steps.indexOf(upload) >
      steps.indexOf(step("draft-release", "🔒 Verify APK development API URL")),
  );
  assert.ok(steps.indexOf(publish) > steps.indexOf(upload));
  assert.equal(upload.env.EXPO_TOKEN, `\${{ secrets.EXPO_TOKEN }}`);
  assert.equal(upload.env.APK_PATH, `\${{ steps.meta.outputs.apk-path }}`);
  assert.match(upload.run, /eas upload --platform android --build-path .* --json/);
  assert.equal(publish.with["eas-build-url"], `\${{ steps.eas.outputs.url }}`);
  assert.equal(publish.with["apk-path"], `\${{ steps.meta.outputs.apk-path }}`);
  assert.match(notify.run, /steps\.draft\.outputs\.apk_url/);
  assert.match(notify.run, /steps\.eas\.outputs\.url/);
  const action = parse(readFileSync(".github/actions/publish-draft-release/action.yml", "utf8"));
  assert.equal(action.inputs["eas-build-url"].required, true);
  assert.match(JSON.stringify(action.runs.steps), /__EAS_BUILD__/);
});

test("watchdog cancels any failed PR job; independent cleanup survives cancellation", () => {
  assert.deepEqual(watchdog.on.workflow_run.workflows, [pr.name]);
  assert.deepEqual(watchdog.on.workflow_run.types, ["in_progress"]);
  assert.equal(watchdog.permissions.actions, "write");
  assert.match(watchdog.jobs["cancel-failed-run"].steps[0].run, /\.conclusion == "failure"/);
  assert.match(watchdog.jobs["cancel-failed-run"].steps[0].run, /actions\/runs\/\$RUN_ID\/cancel/);
  assert.deepEqual(cleanup.on.workflow_run.workflows, [pr.name]);
  assert.deepEqual(cleanup.on.workflow_run.types, ["completed"]);
  assert.match(cleanup.jobs.cleanup.if, /conclusion != 'success'/);
  assert.match(cleanup.jobs.cleanup.steps[1].run, /cleanup-pr-e2e\.sh/);
  const steps = jobs["deploy-preview-api"].steps.map((item) => item.name);
  assert.equal(
    step("deploy-preview-api", "📤 Preserve URL for cancellation cleanup").with.name,
    `ci-api-url-\${{ github.run_attempt }}`,
  );
  assert.ok(
    steps.indexOf("📤 Preserve URL for cancellation cleanup") <
      steps.indexOf("🌱 Seed isolated CI database"),
  );
  assert.ok(
    steps.indexOf("📤 Preserve URL for cancellation cleanup") <
      steps.indexOf("🔒 Attest API runtime database before any E2E writes"),
  );
  const script = readFileSync(".github/scripts/cleanup-pr-e2e.sh", "utf8");
  assert.match(script, /E2E_RUN_KEY/);
  assert.match(
    readFileSync(".github/scripts/cleanup-e2e-clerk-users.sh", "utf8"),
    /e2e_target_\$\{RUN_KEY\}_/,
  );
  assert.match(script, /\.projectId == \$project/);
  assert.match(script, /\.databaseName == \$db/);
  assert.match(script, /bgo_ci_\$\{RUN_ID\}_\$\{ATTEMPT\}/);
});
