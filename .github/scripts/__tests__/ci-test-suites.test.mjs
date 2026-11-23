import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { qualityJobs, verifyCiGate } from "../ci-gate.mjs";

const read = (file) => readFileSync(file, "utf8");
const pr = parse(read(".github/workflows/pr-ci.yml"));
const main = parse(read(".github/workflows/main-ci.yml"));
const find = (job, name) => job.steps.find((step) => step.name === name);

test("both pipelines run all coverage workspaces without cancelling matrix siblings", () => {
  for (const [workflow, id] of [
    [pr, "unit-tests"],
    [main, "coverage"],
  ]) {
    const job = workflow.jobs[id];
    assert.deepEqual(job.strategy.matrix.app, ["mobile", "web", "api", "schemas", "shared", "mcp"]);
    assert.equal(job.strategy["fail-fast"], false);
    assert(job.steps.some((step) => step.run === 'bun run --filter "$WORKSPACE" test:coverage'));
    assert.equal(workflow.on.push.paths, undefined);
    assert.equal(workflow.on.pull_request?.paths, undefined);
  }
  assert.match(pr.jobs["unit-tests"].if, /mode == 'branch'.*mode == 'pr'/);
  assert.equal(main.jobs.coverage.if, undefined);
  for (const app of ["mobile", "web", "api", "schemas", "shared", "mcp"]) {
    const directory = ["schemas", "shared"].includes(app) ? `packages/${app}` : `apps/${app}`;
    assert.equal(
      JSON.parse(read(`${directory}/package.json`)).scripts["test:coverage"],
      "vitest run --coverage",
    );
  }
  assert.match(read("apps/mobile/vitest.config.ts"), /name: "logic"/);
  assert.match(read("apps/mobile/vitest.config.ts"), /"\.\/vitest\.native\.config\.mts"/);
  assert.match(read("packages/shared/vitest.config.ts"), /vitest\.react-project\.config\.mts/);
  assert.match(read("packages/shared/vitest.config.ts"), /\.\.\/query\/src/);
  assert.match(read("packages/shared/vitest.config.ts"), /\.\.\/store\/src/);
  assert.match(read("apps/api/vitest.config.ts"), /vitest\.integration-project\.config\.mts/);
});

test("operator-paused Reassure definitions retain their full secret-free suites without blocking active CI", () => {
  for (const workflow of [pr, main]) {
    const job = workflow.jobs["render-performance"];
    assert.equal(job.if, `\${{ false }}`);
    assert.deepEqual(job.strategy.matrix.app, ["web", "mobile"]);
    assert.equal(job.strategy["fail-fast"], false);
    assert.deepEqual(job.permissions, { contents: "read" });
    assert.equal(job.environment, undefined);
    assert.doesNotMatch(
      JSON.stringify(job),
      /secrets\.|continue-on-error|testNamePattern|changedSince/,
    );
    assert.equal(job.steps[0].uses, "actions/checkout@v4");
    assert.equal(job.steps[0].with["persist-credentials"], false);
    const measurement = find(job, "🧪 Reassure full render suite").run;
    assert.equal(find(job, "🧪 Reassure full render suite").if, `\${{ !cancelled() }}`);
    assert.match(measurement, /node scripts\/performance\/run-render-pair\.mjs/);
    assert.match(measurement, /--baseline-root "\$BASELINE_ROOT"/);
    assert.match(measurement, /--current-ref "\$CANDIDATE_SHA"/);
    assert.match(measurement, /--runner-id "\$RENDER_RUNNER_ID"/);
    const baseline = find(job, "📥 Checkout approved render baseline");
    assert.equal(baseline.with.repository, `\${{ github.repository }}`);
    assert.equal(baseline.with.ref, `\${{ env.BASELINE_CHECKOUT_REF }}`);
    assert.equal(baseline.with.path, ".perf-baseline");
    assert.equal(baseline.with["persist-credentials"], false);
    assert.equal(
      find(job, "📦 Prepare baseline dependencies before measuring")["working-directory"],
      ".perf-baseline",
    );
    const report = find(job, "📤 Preserve actual render measurements");
    assert.equal(report.if, "always() && !cancelled()");
    assert.match(report.with.path, /\.reassure\/current\.perf/);
    assert.match(report.with.path, /\.reassure-pair/);
    assert.equal(report.with["include-hidden-files"], true);
    assert.equal(report.with["if-no-files-found"], "error");
  }
  assert.equal(
    pr.jobs["render-performance"].env.BASELINE_CHECKOUT_REF,
    `\${{ github.event.pull_request.base.sha || github.event.repository.default_branch }}`,
  );
  assert.equal(
    main.jobs["render-performance"].env.BASELINE_CHECKOUT_REF,
    `\${{ github.event.before }}`,
  );
  assert.deepEqual(pr.jobs["render-performance"].needs, ["context"]);
  assert.equal(pr.jobs["render-performance"].if, `\${{ false }}`);
  assert.equal(main.jobs["render-performance"].needs, undefined);
  assert.equal(main.jobs["render-performance"].if, `\${{ false }}`);
  for (const gate of ["native-tooling"]) {
    for (const id of ["ready", "draft-release", "deploy-preview-api", "deploy-development-api"])
      assert(pr.jobs[id].needs.includes(gate), `${id}: ${gate}`);
    assert(main.jobs.release.needs.includes(gate));
    assert(qualityJobs.includes(gate));
  }
  assert(!qualityJobs.includes("render-performance"));
  for (const workflow of [pr, main]) {
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const needs = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
      assert(!needs.includes("render-performance"), `${id} must not wait on the paused suite`);
    }
    assert.doesNotMatch(JSON.stringify(workflow), /needs\.render-performance\.result/);
  }
  const statuses = Object.fromEntries(["context", ...qualityJobs].map((name) => [name, "success"]));
  for (const paused of [undefined, "skipped", "failure", "cancelled"])
    assert.doesNotThrow(() =>
      verifyCiGate("branch", { ...statuses, "render-performance": paused }),
    );
  for (const gate of ["native-tooling"]) {
    for (const result of [undefined, "skipped", "failure", "cancelled"])
      assert.throws(() => verifyCiGate("branch", { ...statuses, [gate]: result }));
    assert(
      pr.jobs.ready.steps
        .find((step) => step.env?.CI_RESULTS)
        .env.CI_RESULTS.includes(`needs.${gate}.result`),
    );
  }
});

test("native tooling uses the existing pinned CLIs without emulator, device or provider traffic", () => {
  for (const workflow of [pr, main]) {
    const job = workflow.jobs["native-tooling"];
    assert.deepEqual(job.permissions, { contents: "read" });
    assert.equal(job.environment, undefined);
    assert.doesNotMatch(
      JSON.stringify(job),
      /secrets\.|android-emulator|maestro-e2e|perfetto:maestro|test:e2e|continue-on-error/,
    );
    assert.equal(job.steps[0].uses, "actions/checkout@v4");
    assert.equal(job.steps[0].with["persist-credentials"], false);
    assert.equal(job.steps.find((step) => step.id === "java").with["java-version"], "17");
    assert.equal(
      job.steps.find((step) => step.id === "maestro").run,
      "bash scripts/maestro.sh --install",
    );
    assert.equal(
      find(job, "🧪 Parse every Maestro flow without executing E2E").run,
      "bash .github/scripts/check-maestro-syntax.sh",
    );
    assert.match(
      find(job, "🔎 Verify the project-pinned Perfetto CLI").run,
      /perfetto\.sh --install\n.*perfetto\.sh --version/,
    );
    const syntax = find(job, "🔎 Validate tracked Bash and Python syntax");
    assert.match(syntax.run, /git ls-files -z '\*\.sh'/);
    assert.match(syntax.run, /ast\.parse/);
  }
  assert.deepEqual(pr.jobs["native-tooling"].needs, ["context"]);
  assert.match(pr.jobs["native-tooling"].if, /mode == 'branch'.*mode == 'pr'/);
  assert.equal(main.jobs["native-tooling"].needs, undefined);
  assert.equal(main.jobs["native-tooling"].if, undefined);
});

test("tooling contracts remain active after lint failure while Reassure and web/native E2E stay explicitly disabled", () => {
  for (const [job, name] of [
    [pr.jobs.lint, "🔒 Check CI isolation and MapTiler build configuration"],
    [main.jobs.quality, "🔒 CI isolation contract"],
  ]) {
    const step = find(job, name);
    assert.equal(step.if, `\${{ !cancelled() }}`);
    assert.match(step.run, /node --test.*\.github\/scripts\/__tests__\/\*\.test\.mjs/);
  }
  assert.equal(pr.env.BGO_PR_E2E_ENABLED, "false");
  for (const id of ["e2e-maestro", "e2e-playwright"])
    assert.match(pr.jobs[id].if, /e2e-enabled == 'true'/);
  assert.equal(main.jobs["e2e-maestro"], undefined);
  assert.equal(main.jobs["e2e-playwright"], undefined);
  for (const workflow of [pr, main]) {
    assert.doesNotMatch(
      JSON.stringify(workflow.jobs["render-performance"]),
      /perfetto:maestro|test:e2e|maestro-e2e/,
    );
    assert(workflow.jobs["integration-tests"]);
  }
});
