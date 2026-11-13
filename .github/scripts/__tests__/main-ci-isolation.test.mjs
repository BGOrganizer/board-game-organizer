import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/main-ci.yml", "utf8"));
const jobs = workflow.jobs;
const prJobs = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8")).jobs;
const step = (job, name) => jobs[job].steps.find((item) => item.name === name);

test("production APK configuration rejects missing or cross-environment API URLs", () => {
  const source = step("build-apk", "🔒 Require the Production Clerk public key").run.match(
    /<<'NODE'\n([\s\S]*?)\nNODE/,
  )[1];
  for (const apiUrl of [
    "https://api.board-game-organizer.com",
    "https://preview.example.invalid",
    "",
  ]) {
    const result = spawnSync(process.execPath, ["--input-type=module"], {
      input: source,
      encoding: "utf8",
      env: { ...process.env, CLERK_PUBLISHABLE_KEY: "pk_live_fixture", API_URL: apiUrl },
    });
    assert.equal(
      result.status,
      apiUrl === "https://api.board-game-organizer.com" ? 0 : 1,
      result.stderr,
    );
  }
});

test("environment-specific variables use common names and scoped consumers", () => {
  const shared = new Set(["EXPO_PUBLIC_MAPTILER_API_KEY", "EXPO_PUBLIC_SENTRY_DSN"]);
  for (const file of readdirSync(".github/workflows").filter((file) => file.endsWith(".yml"))) {
    const current = parse(readFileSync(`.github/workflows/${file}`, "utf8"));
    for (const [name, job] of Object.entries(current.jobs)) {
      const variables = [...JSON.stringify(job).matchAll(/\bvars\.([A-Z][A-Z0-9_]*)/g)].map(
        (match) => match[1],
      );
      for (const variable of variables) {
        assert(!variable.endsWith("_PRODUCTION"), `${file}: ${name}: ${variable}`);
        if (shared.has(variable)) continue;
        assert.equal(
          job.environment,
          file === "main-ci.yml" ? "production" : "development",
          `${file}: ${name}`,
        );
      }
    }
  }
});

test("Codecov authenticates with job-scoped OIDC without static tokens on PR and main", () => {
  for (const [name, current] of [
    ["pr", prJobs],
    ["main", jobs],
  ]) {
    let consumers = 0;
    for (const [id, job] of Object.entries(current)) {
      const uploads = job.steps.filter((item) => item.uses?.startsWith("codecov/codecov-action@"));
      if (!uploads.length) {
        assert.notEqual(job.permissions?.["id-token"], "write", `${name}: ${id}`);
        continue;
      }
      consumers++;
      assert.equal(job.permissions["id-token"], "write", `${name}: ${id}`);
      assert.equal(job.permissions.contents, "read");
      for (const upload of uploads) {
        assert.equal(upload.with.use_oidc, true);
        assert.equal(upload.with.token, undefined);
        assert.equal(upload.with.fail_ci_if_error, true);
        assert.equal(upload["continue-on-error"], undefined);
      }
    }
    assert.equal(consumers, 2);
  }
});

test("every workflow job consuming custom secrets selects its GitHub environment", () => {
  for (const file of readdirSync(".github/workflows").filter((file) => file.endsWith(".yml"))) {
    const current = parse(readFileSync(`.github/workflows/${file}`, "utf8"));
    for (const [name, job] of Object.entries(current.jobs)) {
      if (!/\bsecrets[.[]/.test(JSON.stringify(job))) continue;
      assert.equal(
        job.environment,
        file === "main-ci.yml" ? "production" : "development",
        `${file}: ${name}`,
      );
    }
  }
});

test("PR partial reruns retain deployment-owned database identity for fixture and cleanup consumers", () => {
  const action = parse(readFileSync(".github/actions/vercel-deploy/action.yml", "utf8"));
  assert.equal(action.outputs["ci-db-name"].value, "${{ inputs.ci-db-name }}");
  const expression = "${{ needs.deploy-preview-api.outputs.db-name }}";
  assert.equal(
    prJobs["deploy-preview-api"].outputs["db-name"],
    "${{ steps.deploy.outputs.ci-db-name }}",
  );
  const consumers = Object.values(prJobs)
    .flatMap((j) => j.steps)
    .filter((s) => /action:"(?:cleanup|seed-bgg)"/.test(s.run || ""));
  assert.equal(consumers.length, 2);
  for (const consumer of consumers) {
    assert.equal(consumer.env.DB_NAME, expression);
    assert.doesNotMatch(consumer.run, /github\.run_attempt/);
    assert.match(consumer.run, /databaseName:\$name/);
    assert.equal(consumer.env.DB_NAME.replace(expression, "bgo_ci_123_1"), "bgo_ci_123_1");
  }
  assert.match(
    prJobs["cleanup-e2e-db"].steps.find((s) => s.env?.DB_NAME).run,
    /test -n "\$DB_NAME"/,
  );
});
test("Main has no E2E infrastructure or application database/user mutation stages", () => {
  for (const id of [
    "build-e2e-apk",
    "deploy-e2e-api",
    "deploy-e2e-web",
    "provision-e2e-users",
    "e2e-maestro",
    "e2e-playwright",
    "cleanup-e2e",
  ])
    assert.equal(jobs[id], undefined);
  const source = JSON.stringify(jobs);
  assert.doesNotMatch(
    source,
    /provision-e2e-user|maestro-e2e|android-emulator|api\/admin\/ci-db|seed-bgg|test:e2e/,
  );
  assert.equal(existsSync(".github/workflows/mobile-e2e.yml"), false);
  // Suites/actions and the explicitly disabled PR hooks remain, not fabricated acceptance.
  assert(prJobs["e2e-maestro"] && prJobs["e2e-playwright"]);
  assert(existsSync(".github/actions/maestro-e2e/action.yml"));
});
test("every main merge runs all non-E2E gates once in parallel before preparing a release", () => {
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.equal(workflow.concurrency, undefined);
  assert.deepEqual(jobs.coverage.strategy.matrix.app, [
    "mobile",
    "web",
    "api",
    "schemas",
    "shared",
  ]);
  assert.deepEqual(jobs.build.strategy.matrix.app, ["api", "web"]);
  for (const gate of ["quality", "coverage", "integration-tests", "build"]) {
    assert.equal(jobs[gate].needs, undefined);
    assert(jobs.release.needs.includes(gate));
  }
  assert.equal(jobs.release.concurrency.group, "main-release");
  assert.match(step("quality", "🔒 CI isolation contract").run, /node --test/);
  assert.match(
    step("integration-tests", "🐳 Run API integration tests").run,
    /test:integration --coverage/,
  );
  assert.equal(
    step("coverage", "🧪 Vitest with coverage").run,
    'bun run --filter "$WORKSPACE" test:coverage',
  );
  assert.match(
    step("release", "🔒 Release only latest validated main commit").run,
    /git rev-parse origin\/main.*GITHUB_SHA/,
  );
  for (const id of ["build-apk", "deploy-production", "publish-release"])
    assert.equal(jobs[id].steps[0].with.ref, "${{ needs.release.outputs.sha }}");
  assert(jobs["deploy-production"].needs.includes("release"));
  assert(jobs["deploy-production"].needs.includes("build-apk"));
  assert.deepEqual(jobs["publish-release"].needs, ["release", "build-apk", "deploy-production"]);
});
test("unit and integration Codecov uploads fail closed and retain coverage reports", () => {
  for (const id of ["coverage", "integration-tests"]) {
    const signing = jobs[id].steps.find(
      (s) => s.run === "bash .github/scripts/prepare-codecov-key.sh",
    );
    const upload = jobs[id].steps.find((s) => s.uses?.startsWith("codecov/codecov-action@"));
    assert(signing);
    assert.equal(signing["continue-on-error"], undefined);
    assert.equal(upload.if, undefined);
    assert.equal(upload.with.fail_ci_if_error, true);
    assert.equal(upload["continue-on-error"], undefined);
    assert(
      jobs[id].steps.some((s) => s.uses === "actions/upload-artifact@v4" && s.if === "always()"),
    );
  }
  assert.equal(
    jobs["integration-tests"].steps.find((s) => s.uses?.startsWith("codecov/codecov-action@")).with
      .flags,
    "integration",
  );
  for (const [label, config] of [
    ["main", jobs.coverage],
    ["PR", prJobs["unit-tests"]],
  ]) {
    assert(config.strategy.matrix.app.includes("schemas"), label);
    assert(config.strategy.matrix.app.includes("shared"), label);
    assert.match(
      config.steps.find((s) => s.uses?.startsWith("codecov/codecov-action@")).with.files,
      /packages\/\{0\}\/coverage\/lcov\.info/,
    );
  }
});
test("published APK is production-targeted, checksummed and pinned to the release SHA", () => {
  const build = step("build-apk", "🏗️ Build APK (eas build --local, internal profile)");
  assert.equal(build.with.profile, "internal");
  assert.equal(build.with["api-url"], "${{ vars.EXPO_PUBLIC_API_URL }}");
  assert.equal(
    build.with["clerk-publishable-key"],
    "${{ vars.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY }}",
  );
  assert.equal(jobs["build-apk"]["timeout-minutes"], 180);
  assert.equal(jobs["build-apk"].environment, "production");
  const keyGate = step("build-apk", "🔒 Require the Production Clerk public key");
  assert.equal(keyGate.env.CLERK_PUBLISHABLE_KEY, build.with["clerk-publishable-key"]);
  assert.equal(keyGate.env.API_URL, build.with["api-url"]);
  assert.match(keyGate.run, /process.env.API_URL !== 'https:\/\/api.board-game-organizer.com'/);
  assert.match(keyGate.run, /requireClerkTarget\('production'/);
  const artifact = jobs["build-apk"].steps.find((s) => s.uses === "actions/upload-artifact@v4");
  assert.equal(artifact.with.path, "apps/mobile/build-output/");
  assert.equal(artifact.with["if-no-files-found"], "error");
  const steps = jobs["publish-release"].steps;
  const verify = step("publish-release", "🔒 Verify production APK provenance and current release");
  assert.match(verify.run, /source-head\.txt/);
  assert.match(verify.run, /api-url\.txt/);
  assert.match(verify.run, /sha256sum --check apk\.sha256/);
  assert(steps.indexOf(verify) < steps.findIndex((s) => s.id === "eas"));
});
test("main publishes and notifies only after production deploy/smoke with the existing narrow EAS exception", () => {
  const steps = jobs["publish-release"].steps;
  const upload = steps.find((s) => s.id === "eas"),
    publish = steps.find((s) => s.id === "publish");
  assert(steps.indexOf(publish) > steps.indexOf(upload));
  const prepare = steps.find((s) => s.id === "prepare");
  const attach = step("publish-release", "📎 Attach APK with clean name");
  const body = step("publish-release", "🔗 Append production links to the release body");
  assert(steps.indexOf(prepare) < steps.indexOf(attach));
  assert(steps.indexOf(attach) < steps.indexOf(body));
  assert(steps.indexOf(body) < steps.indexOf(publish));
  assert.match(prepare.run, /draft:true/);
  assert.match(attach.run, /\.digest == \$digest/);
  assert.match(publish.run, /'\{"draft":false\}'/);
  assert.match(publish.run, /RELEASE_SHA/);
  assert.equal(upload.env.EXPO_TOKEN, "${{ secrets.EXPO_TOKEN }}");
  assert.match(upload.run, /node .*eas-upload\.mjs "\$APK"/);
  assert.equal(jobs["publish-release"].outputs.eas_build_url, "${{ steps.eas.outputs.url }}");
  assert.match(step("deploy-production", "🔎 Read-only production smoke").run, /curl -fsSL/);
  assert(jobs["notify-telegram"].needs.includes("publish-release"));
  assert(jobs["notify-telegram"].needs.includes("deploy-production"));
  assert.match(
    step("notify-telegram", "🔒 Notify only the current production release").run,
    /RELEASE_SHA/,
  );
  const links = step("publish-release", "🔗 Append production links to the release body");
  assert.equal(links.env.EAS_BUILD_URL, "${{ steps.eas.outputs.url }}");
  assert.match(links.run, /Build EAS:.*EAS_BUILD_URL/);
  assert.match(
    step("notify-telegram", "🔗 Compose Telegram links").run,
    /if \[ -n "\$EAS_BUILD_URL" \]/,
  );
  assert.equal(step("publish-release", "📥 Download internal APK").with.name, "apk-internal-main");
});
test("PR keeps independent Development publication and isolated Internal cleanup", () => {
  const find = (id, name) => prJobs[id].steps.find((s) => s.name === name);
  assert.equal(
    find("build-mobile-internal", "🏗️ Build APK (eas build --local, internal profile)").with[
      "api-url"
    ],
    "${{ needs.deploy-preview-api.outputs.branch-url }}",
  );
  assert(prJobs["deploy-development-api"].needs.includes("unit-tests"));
  assert(prJobs["deploy-development-api"].needs.includes("integration-tests"));
  for (const gate of ["e2e-maestro", "e2e-playwright", "cleanup-e2e-db"]) {
    assert(!prJobs["draft-release"].needs.includes(gate));
    assert(prJobs.ready.needs.includes(gate));
  }
  assert.equal(
    find("deploy-development-api", "🚀 Deploy API Preview with development database").with[
      "ci-db-name"
    ],
    undefined,
  );
  assert.match(
    find("deploy-development-api", "🔒 Attest non-CI development database").run,
    /webhookDbReady.*bgo_ci_/,
  );
  assert.equal(
    find("build-mobile-development", "🏗️ Build internal APK against development Preview").with[
      "api-url"
    ],
    "${{ needs.deploy-development-api.outputs.branch-url }}",
  );
  assert.equal(find("draft-release", "📥 Download development APK").with.name, "apk-development");
});
