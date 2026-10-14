import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
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

test("PR Maestro is retained but explicitly skipped; other native pipelines remain enabled", () => {
  const native = jobs["e2e-maestro"];
  assert.equal(native.if, "${{ false }}");
  assert(native.steps.length > 0);
  assert(native.steps.some((item) => item.with?.flow === "13-event-draft"));
  assert(native.steps.some((item) => item.with?.phase === "verify"));
  assert.equal(jobs["cleanup-e2e-user"].if, "always()");
  for (const name of ["main-ci.yml", "mobile-e2e.yml"]) {
    const workflow = parse(readFileSync(`.github/workflows/${name}`, "utf8"));
    assert.notEqual(workflow.jobs["e2e-maestro"].if, "${{ false }}", name);
  }
});

test("draft publication tolerates only the intentional Maestro skip, never a failed or missing gate", () => {
  const release = jobs["draft-release"];
  const expression = release.if.replace(
    /needs\.([\w-]+)\.result/g,
    (_, key) => `results["${key}"]`,
  );
  const success = Object.fromEntries(release.needs.map((name) => [name, "success"]));
  const allowed = (results, cancelled = false) =>
    runInNewContext(expression, {
      results,
      always: () => true,
      cancelled: () => cancelled,
    });
  assert.equal(allowed(success), true);
  const skippedMaestro = { ...success, "e2e-maestro": "skipped" };
  assert.equal(allowed(skippedMaestro), true);
  assert.equal(allowed(skippedMaestro, true), false);
  for (const gate of release.needs) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      assert.equal(
        allowed({ ...skippedMaestro, [gate]: result }),
        gate === "e2e-maestro" && result === "skipped",
        `${gate}: ${result}`,
      );
    }
  }
});

test("parallel web and native acceptance use separate mirrored user pairs, BGG fixtures and complete cleanup", () => {
  const provision = jobs.provision;
  const calls = provision.steps.filter(
    (item) => item.uses === "./.github/actions/provision-e2e-user",
  );
  assert.deepEqual(
    calls.map((item) => item.id),
    ["provision", "native"],
  );
  for (const field of [
    "username",
    "email",
    "password",
    "user_id",
    "username_2",
    "email_2",
    "phone_2",
    "password_2",
    "user_id_2",
  ]) {
    assert.equal(provision.outputs[`native_${field}`], `\${{ steps.native.outputs.${field} }}`);
  }
  const native = jobs["e2e-maestro"].env;
  for (const [name, field] of [
    ["E2E_USERNAME", "username"],
    ["E2E_EMAIL", "email"],
    ["E2E_PASSWORD", "password"],
    ["E2E_TARGET_EMAIL", "email_2"],
    ["E2E_TARGET_USERNAME", "username_2"],
    ["E2E_TARGET_PASSWORD", "password_2"],
    ["E2E_TARGET_PHONE", "phone_2"],
  ])
    assert.equal(native[name], `\${{ needs.provision.outputs.native_${field} }}`);
  assert.doesNotMatch(JSON.stringify(native), /needs\.provision\.outputs\.(?!native_)/);
  const browser = jobs["e2e-playwright"].steps.find((item) => item.env?.E2E_EMAIL);
  assert.equal(browser.env.E2E_EMAIL, `\${{ needs.provision.outputs.email }}`);
  assert.equal(browser.env.E2E_EMAIL_2, `\${{ needs.provision.outputs.email_2 }}`);
  const sync = jobs["sync-e2e-users"].steps.find((item) => item.env?.USER_ID);
  assert(sync.run.includes("native_user_id"));
  assert(sync.run.includes("native_user_id_2"));
  assert(sync.run.includes('for actor in "$USER_ID" "$NATIVE_USER_ID"'));
  assert(sync.run.includes("set -euo pipefail"));
  const cleanupUsers = jobs["cleanup-e2e-user"].steps.find((item) => item.env?.USER_ID);
  assert.equal(cleanupUsers.env.NATIVE_USER_ID, `\${{ needs.provision.outputs.native_user_id }}`);
  assert.equal(
    cleanupUsers.env.NATIVE_USER_ID_2,
    `\${{ needs.provision.outputs.native_user_id_2 }}`,
  );
  assert(
    cleanupUsers.run.includes('"$USER_ID" "$USER_ID_2" "$NATIVE_USER_ID" "$NATIVE_USER_ID_2"'),
  );
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
  assert.equal(cleanup.jobs.cleanup.environment, "development");
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

test("PR deployment, auth, build and publication secrets use the development GitHub environment", () => {
  const consumers = Object.entries(jobs).filter(([, job]) =>
    /secrets\.(?:CLERK_SECRET_KEY|EXPO_TOKEN|VERCEL_TOKEN|RELEASE_PAT|TELEGRAM_BOT_TOKEN)\s*}}/.test(
      JSON.stringify(job),
    ),
  );
  assert.equal(consumers.length, 11);
  for (const [name, job] of consumers) assert.equal(job.environment, "development", name);
});

function runWebhookAlias(options = {}) {
  const alias = step("deploy-preview-api", "🔗 Point Clerk webhook alias to preview");
  const script = alias.run.match(/node <<'NODE'\n([\s\S]*?)\nNODE/)[1];
  const env = {
    GIT_BRANCH: "feat/social-api-refactor",
    PREVIEW_URL: "https://api-test.vercel.app",
    VERCEL_ORG_ID: "team-test",
    VERCEL_PROJECT_ID: "project-test",
    VERCEL_TOKEN: "private-test-token",
    WEBHOOK_ALIAS: "clerk-preview-api.board-game-organizer.com",
    ...options.env,
  };
  let binding = {
    name: env.WEBHOOK_ALIAS,
    verified: true,
    gitBranch: env.GIT_BRANCH,
    ...options.binding,
  };
  const calls = [];
  let error;
  try {
    runInNewContext(script, {
      process: { env },
      require: (name) => {
        assert.equal(name, "node:child_process");
        return {
          execFileSync(command, args) {
            assert.equal(command, "vercel");
            calls.push(Array.from(args));
            if (options.fail === args[0]) throw new Error(`Failure with ${env.VERCEL_TOKEN}`);
            if (args.includes("--method=PATCH")) {
              if (options.patchFails) throw new Error(`Branch not found: ${env.VERCEL_TOKEN}`);
              binding = { ...binding, gitBranch: env.GIT_BRANCH, ...options.afterPatch };
              return "";
            }
            if (args[0] === "api") return JSON.stringify(binding);
            assert.deepEqual(Array.from(args).slice(0, 4), [
              "alias",
              "set",
              env.PREVIEW_URL,
              env.WEBHOOK_ALIAS,
            ]);
            return "";
          },
        };
      },
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, error };
}

test("verified webhook binding is reused without a redundant Git-provider PATCH", () => {
  const result = runWebhookAlias({ patchFails: true });
  assert.equal(result.error, undefined);
  assert.deepEqual(
    result.calls.map((args) => args[0]),
    ["api", "alias"],
  );
  assert.ok(result.calls[0][1].includes("/projects/project-test/domains/"));
  assert.ok(result.calls[0][1].endsWith("?teamId=team-test"));
});

test("changed webhook binding is patched, reread and verified before alias assignment", () => {
  const result = runWebhookAlias({ binding: { gitBranch: "old-preview-branch" } });
  assert.equal(result.error, undefined);
  assert.deepEqual(
    result.calls.map((args) => args[0]),
    ["api", "api", "api", "alias"],
  );
  assert.ok(result.calls[1].includes("--method=PATCH"));
  assert.ok(result.calls[1].includes("--raw-field=gitBranch=feat/social-api-refactor"));
});

test("webhook alias rejects production, missing inputs and unverified or unexpected bindings", () => {
  for (const env of [
    { GIT_BRANCH: "" },
    { GIT_BRANCH: "main" },
    { PREVIEW_URL: "" },
    { VERCEL_ORG_ID: "" },
    { VERCEL_PROJECT_ID: "" },
    { VERCEL_TOKEN: "" },
    { WEBHOOK_ALIAS: "production.example.com" },
  ]) {
    const result = runWebhookAlias({ env });
    assert.match(result.error.message, /non-production branch/);
    assert.equal(result.calls.length, 0);
  }
  for (const options of [
    { binding: { name: "another.example.com" } },
    { binding: { verified: false } },
    { binding: { gitBranch: "old" }, afterPatch: { gitBranch: "old" } },
    { binding: { gitBranch: "old" }, afterPatch: { verified: false } },
    { binding: { gitBranch: "old" }, patchFails: true },
    { fail: "api" },
  ]) {
    const result = runWebhookAlias(options);
    assert.ok(result.error);
    assert.ok(!result.calls.some((args) => args[0] === "alias"));
    assert.ok(!result.error.message.includes("private-test-token"));
  }
  const failedAlias = runWebhookAlias({ fail: "alias" });
  assert.match(failedAlias.error.message, /Vercel webhook alias command failed/);
  assert.ok(!failedAlias.error.message.includes("private-test-token"));
});
