import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/main-ci.yml", "utf8"));
const jobs = workflow.jobs;
const prJobs = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8")).jobs;
const step = (job, name) => jobs[job].steps.find((item) => item.name === name);
const netlifyWorkflow = "./.github/workflows/netlify-deploy.yml";
const environmentFor = (file) => (file === "main-ci.yml" ? "production" : "development");
const scopedEnvironmentFor = (file) =>
  ({
    "netlify-deploy.yml": `\${{ inputs.target }}`,
    "scaffold-hosting.yml": `\${{ inputs.environment }}`,
  })[file] ?? environmentFor(file);

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
        assert.equal(job.environment, scopedEnvironmentFor(file), `${file}: ${name}`);
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
      const uploads = (job.steps || []).filter((item) =>
        item.uses?.startsWith("codecov/codecov-action@"),
      );
      if (!uploads.length) {
        assert.notEqual(job.permissions?.["id-token"], "write", `${name}: ${id}`);
        continue;
      }
      consumers++;
      assert.equal(job.permissions["id-token"], "write", `${name}: ${id}`);
      assert.equal(job.permissions.contents, "read");
      for (const upload of uploads) {
        assert.equal(upload.with.use_oidc, true);
        assert.equal(upload.with.disable_search, true, `${name}: ${id}`);
        assert.equal(typeof upload.with.files, "string", `${name}: ${id}`);
        assert(upload.with.files.trim().length > 0, `${name}: ${id}: explicit coverage files`);
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
      if (job.uses === netlifyWorkflow) {
        assert.equal(job.with.target, environmentFor(file));
        assert.deepEqual(job.secrets, {
          NETLIFY_AUTH_TOKEN: "${{ secrets.NETLIFY_AUTH_TOKEN }}",
          ...(job.with.component === "api"
            ? { CLERK_SECRET_KEY: "${{ secrets.CLERK_SECRET_KEY }}" }
            : {}),
        });
        continue;
      }
      assert.equal(job.environment, scopedEnvironmentFor(file), `${file}: ${name}`);
    }
  }
});

test("PR partial reruns retain deployment-owned database identity for fixture and cleanup consumers", () => {
  const action = parse(readFileSync(".github/actions/vercel-deploy/action.yml", "utf8"));
  assert.equal(action.outputs["ci-db-name"].value, "${{ inputs.ci-db-name }}");
  const expression = `\${{ needs.select-preview.outputs.db-name }}`;
  assert.match(
    prJobs["select-preview"].outputs["db-name"],
    /deploy-preview-api.*deploy-netlify-ci-api\.outputs\.ci-db-name/,
  );
  assert.equal(
    prJobs["deploy-preview-api"].outputs["db-name"],
    "${{ steps.deploy.outputs.ci-db-name }}",
  );
  const consumers = Object.values(prJobs)
    .flatMap((j) => j.steps || [])
    .filter((s) => /action:"(?:cleanup|seed|seed-bgg)"/.test(s.run || ""));
  assert.equal(consumers.length, 3);
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
    "mcp",
  ]);
  assert.deepEqual(jobs.build.strategy.matrix.app, ["api", "web"]);
  for (const gate of ["quality", "coverage", "integration-tests", "native-tooling", "build"]) {
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
    /node \.github\/scripts\/main-release-preparation\.mjs/,
  );
  for (const id of [
    "build-apk",
    "deploy-production-api",
    "deploy-production-web",
    "publish-release",
  ])
    assert.equal(jobs[id].steps[0].with.ref, "${{ needs.release.outputs.sha }}");
  for (const id of ["deploy-production-api", "deploy-production-web"]) {
    assert(jobs[id].needs.includes("release"));
    assert(jobs[id].needs.includes("build-apk"));
    assert.match(jobs[id].steps[1].run, /git rev-parse origin\/main/);
  }
  assert.match(
    jobs["deploy-production-web"].if,
    /needs\.deploy-production-api\.outputs\.api-url != ''/,
  );
  assert.deepEqual(jobs["publish-release"].needs, [
    "release",
    "build-apk",
    "select-production-deployment",
  ]);
});

test("Production checks Vercel early and runs separate Netlify fallback jobs", () => {
  const check = jobs["check-vercel"];
  assert.equal(check.needs, undefined);
  assert.equal(check.environment, "production");
  assert.equal(check["continue-on-error"], true);
  assert.equal(check.outputs.status, "${{ steps.check.outputs.status }}");
  assert.equal(check.steps.at(-1).run, "node .github/scripts/vercel-deploy-preflight.mjs");

  for (const id of [
    "deploy-production-api",
    "deploy-production-web",
    "deploy-production-site",
    "deploy-production-mcp-gateway",
  ]) {
    const job = jobs[id];
    assert(job.needs.includes("check-vercel"));
    assert.match(job.if, /needs\.check-vercel\.outputs\.status != 'blocked'/);
    assert.equal(job["continue-on-error"], true);
  }
  for (const component of ["api", "web", "site", "mcp"]) {
    const job = jobs[`deploy-netlify-production-${component}`];
    assert.equal(job.uses, netlifyWorkflow);
    assert.equal(job.with.target, "production");
    assert.equal(job.with.component, component);
    assert.equal(job.with["source-sha"], "${{ github.sha }}");
    assert.match(job.if, /!cancelled\(\)/);
    if (component === "site") {
      assert.deepEqual(job.needs, ["quality", "build-site", "deploy-production-site"]);
      assert.match(job.if, /needs\.deploy-production-site\.outputs\.ready != 'true'/);
      continue;
    }
    assert.match(job.if, /needs\.release\.result == 'success'/);
    assert.match(job.if, /needs\.check-vercel\.outputs\.status == 'blocked'/);
    assert.match(job.if, /needs\.deploy-production-web\.outputs\.ready != 'true'/);
    if (component !== "api") {
      assert.equal(
        job.with["api-url"],
        "${{ needs.deploy-netlify-production-api.outputs.api-url }}",
      );
      assert.equal(
        job.with["api-client-url"],
        "${{ needs.deploy-netlify-production-api.outputs.api-client-url }}",
      );
    }
    assert.equal(
      job.if.includes("needs.deploy-production-mcp-gateway.outputs.failed"),
      component === "api" || component === "mcp",
    );
  }
});

test("Production smoke and publication consume only complete deploys from the current source", () => {
  const select = jobs["select-production-deployment"];
  const smoke = select.steps.find((s) => s.id === "select");
  assert.deepEqual(select.needs, [
    "release",
    "check-vercel",
    "deploy-production-api",
    "deploy-production-web",
    "deploy-netlify-production-api",
    "deploy-netlify-production-web",
  ]);
  assert.match(select.if, /!cancelled\(\).*needs\.release\.result == 'success'/);
  assert.match(
    select.if,
    /published == 'true' \|\| needs\.check-vercel\.outputs\.status == 'blocked'/,
  );
  assert.equal(select.steps[0].with.ref, "${{ needs.release.outputs.sha || github.sha }}");
  assert.equal(select.environment, "production");
  assert.equal(select["continue-on-error"], undefined);
  assert.equal(smoke.run, "node .github/scripts/select-deploy-provider.mjs");
  assert.equal(smoke.env.TARGET, "production");
  assert.equal(smoke.env.VERCEL_PROTECTION_BYPASS, `\${{ secrets.VERCEL_PROTECTION_BYPASS }}`);
  assert.equal(smoke.env.VERCEL_VERIFIED, "${{ needs.deploy-production-web.outputs.ready }}");
  const vercelWeb = jobs["deploy-production-web"];
  assert.equal(vercelWeb.steps.at(-1).run, smoke.run);
  assert.equal(vercelWeb.steps.at(-1).env.VERCEL_API_URL, smoke.env.VERCEL_API_URL);
  assert.equal(vercelWeb.outputs.ready, "${{ steps.smoke.outputs.provider == 'vercel' }}");
  for (const [provider, prefix] of [
    ["VERCEL", "deploy-production-"],
    ["NETLIFY", "deploy-netlify-production-"],
  ]) {
    for (const app of ["api", "web"]) {
      assert.equal(
        smoke.env[`${provider}_${app.toUpperCase()}_URL`],
        `\${{ needs.${prefix}${app}.outputs.${app}-url }}`,
      );
    }
  }
  const site = jobs["select-production-site"];
  assert.deepEqual(site.needs, [
    "quality",
    "build-site",
    "deploy-production-site",
    "deploy-netlify-production-site",
  ]);
  assert.match(site.steps.at(-1).run, /if \[ "\$VERCEL_SITE_READY" = true \]/);
  assert.match(site.steps.at(-1).run, /elif \[\[ "\$NETLIFY_SITE_URL"/);
  const verifyVercelSite = jobs["deploy-production-site"].steps.at(-1).run;
  assert.match(verifyVercelSite, /--get --data-urlencode "x-vercel-protection-bypass=/);
  assert.doesNotMatch(verifyVercelSite, /--header "x-vercel-protection-bypass/);
  assert(!jobs["publish-release"].needs.includes("select-production-site"));
  for (const id of ["publish-release", "notify-telegram"]) {
    assert.match(jobs[id].if, /!cancelled\(\)/);
    assert.doesNotMatch(jobs[id].if, /\bsuccess\(\)/);
    for (const dependency of jobs[id].needs) {
      assert(jobs[id].if.includes(`needs.${dependency}.result == 'success'`));
    }
  }
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
  const ota = steps.find((s) => s.uses === "./.github/actions/mobile-update");
  assert(steps.indexOf(upload) < steps.indexOf(prepare));
  assert(steps.indexOf(prepare) < steps.indexOf(ota));
  assert(steps.indexOf(ota) < steps.indexOf(publish));
  assert.match(prepare.run, /main-release-publication\.mjs stage/);
  assert.match(publish.run, /main-release-publication\.mjs publish/);
  assert.equal(ota.if, "steps.prepare.outputs.already_published != 'true'");
  assert.equal(
    jobs["publish-release"].concurrency.group,
    "production-publication-${{ needs.release.outputs.sha }}",
  );
  assert.equal(jobs["publish-release"].concurrency["cancel-in-progress"], false);
  assert.equal(prepare.env.RELEASE_SHA, "${{ needs.release.outputs.sha }}");
  assert.equal(publish.env.RELEASE_SHA, prepare.env.RELEASE_SHA);
  assert.equal(upload.env.EXPO_TOKEN, "${{ secrets.EXPO_TOKEN }}");
  assert.match(upload.run, /node .*eas-upload\.mjs "\$APK"/);
  assert.equal(jobs["publish-release"].outputs.eas_build_url, "${{ steps.eas.outputs.url }}");
  assert(jobs["notify-telegram"].needs.includes("publish-release"));
  assert(jobs["notify-telegram"].needs.includes("select-production-deployment"));
  assert.match(
    step("notify-telegram", "🔒 Notify only the current production release").run,
    /RELEASE_SHA/,
  );
  assert.equal(prepare.env.EAS_BUILD_URL, "${{ steps.eas.outputs.url }}");
  const notification = step("notify-telegram", "📤 Send Telegram notification").with;
  assert.equal(notification["apk-url"], `\${{ needs.publish-release.outputs.apk_url }}`);
  assert.equal(notification["pr-number"], `\${{ needs.publish-release.outputs.pr_number }}`);
  assert.equal(jobs["publish-release"].permissions["pull-requests"], "read");
  assert.match(
    step("notify-telegram", "📖 Read pinned release changelog").run,
    /git log -1 --format=%b/,
  );
  assert.equal(step("publish-release", "📥 Download internal APK").with.name, "apk-internal-main");
});
test("PR keeps independent Development publication and isolated Internal cleanup", () => {
  const find = (id, name) => prJobs[id].steps.find((s) => s.name === name);
  assert.equal(
    find("build-mobile-internal", "🏗️ Build APK (eas build --local, internal profile)").with[
      "api-url"
    ],
    `\${{ needs.select-preview.outputs.api-client-url }}`,
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
    `\${{ needs.select-development.outputs.api-client-url }}`,
  );
  assert.equal(
    find("draft-release", "📥 Download development APK").with.name,
    `\${{ needs.build-mobile-development.outputs.artifact-name }}`,
  );
});
