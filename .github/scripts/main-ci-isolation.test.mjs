import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(readFileSync(".github/workflows/main-ci.yml", "utf8"));
const jobs = workflow.jobs;
const prJobs = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8")).jobs;
const step = (job, name) => jobs[job].steps.find((item) => item.name === name);
const outputUrl = (job) => `\${{ needs.${job}.outputs.url }}`;

test("Main E2E never targets production data or Clerk", () => {
  for (const name of [
    "deploy-e2e-api",
    "deploy-e2e-web",
    "build-e2e-apk",
    "provision-e2e-users",
    "e2e-maestro",
    "e2e-playwright",
    "cleanup-e2e",
  ]) {
    const config = JSON.stringify(jobs[name]);
    assert.doesNotMatch(config, /CLERK_SECRET_KEY_PRODUCTION|PUBLISHABLE_KEY_PRODUCTION/);
    assert.doesNotMatch(config, /https:\/\/(api\.)?board-game-organizer\.com\b/);
  }
  assert.equal(step("deploy-e2e-api", "🚀 Deploy isolated API Preview").with.production, "false");
  assert.equal(
    step("deploy-e2e-api", "🚀 Deploy isolated API Preview").with["ci-db-name"],
    `bgo_ci_\${{ github.run_id }}_\${{ github.run_attempt }}`,
  );
  assert.equal(step("deploy-e2e-web", "🚀 Deploy isolated Web Preview").with.production, "false");
  assert.equal(
    step("build-e2e-apk", "🏗️ Build E2E APK against isolated Preview").with["api-url"],
    outputUrl("deploy-e2e-api"),
  );
  assert.equal(
    step("e2e-playwright", "🎭 Run Playwright against isolated Web Preview").env
      .PLAYWRIGHT_BASE_URL,
    outputUrl("deploy-e2e-web"),
  );
  assert.equal(
    step("provision-e2e-users", "🔄 Sync users only into isolated Preview API").env.API_URL,
    outputUrl("deploy-e2e-api"),
  );
  assert.equal(
    step("cleanup-e2e", "🗑️ Clear only this run's database collections").env.API_URL,
    outputUrl("deploy-e2e-api"),
  );
  assert.match(jobs["cleanup-e2e"].if, /always\(\)/);
  assert.ok(jobs["publish-release"].needs.includes("cleanup-e2e"));
});

test("every main merge verifies API, mobile, web, schemas and shared before production", () => {
  assert.deepEqual(workflow.on.push.branches, ["main"]);
  assert.equal(workflow.concurrency, undefined);
  assert.deepEqual(jobs.coverage.strategy.matrix.app, [
    "mobile",
    "web",
    "api",
    "schemas",
    "shared",
  ]);
  assert.match(step("integration-tests", "🐳 Run API integration tests").run, /test:integration/);
  for (const name of [
    "build-e2e-apk",
    "deploy-e2e-api",
    "deploy-e2e-web",
    "e2e-maestro",
    "e2e-playwright",
  ]) {
    assert.doesNotMatch(jobs[name].if || "", /published/);
  }
  for (const name of [
    "coverage",
    "integration-tests",
    "e2e-maestro",
    "e2e-playwright",
    "cleanup-e2e",
  ]) {
    assert.ok(jobs.release.needs.includes(name), `${name} must gate release`);
  }
  assert.ok(jobs["deploy-production"].needs.includes("build-apk"));
  assert.ok(jobs["deploy-production"].needs.includes("release"));
  assert.equal(jobs.release.concurrency.group, "main-release");
  assert.match(
    step("release", "🔒 Release only latest validated main commit").run,
    /git rev-parse origin\/main.*GITHUB_SHA/,
  );
  for (const name of ["build-apk", "deploy-production", "publish-release"]) {
    assert.equal(jobs[name].steps[0].with.ref, `\${{ needs.release.outputs.sha }}`);
  }
});

test("PR and main upload schemas and shared coverage from package paths", () => {
  for (const [name, config] of [
    ["main", jobs],
    ["PR", prJobs],
  ]) {
    const job = name === "main" ? config.coverage : config["unit-tests"];
    assert.ok(job.strategy.matrix.app.includes("shared"));
    assert.ok(job.strategy.matrix.app.includes("schemas"));
    const files = job.steps.find((item) => item.uses === "codecov/codecov-action@v5").with.files;
    assert.match(files, /packages\/\{0\}\/coverage\/lcov\.info/);
  }
});

test("published APK still targets production, not isolated Preview", () => {
  assert.equal(
    step("build-apk", "🏗️ Build APK (eas build --local, internal profile)").with["api-url"],
    "https://api.board-game-organizer.com",
  );
  assert.equal(step("publish-release", "📥 Download internal APK").with.name, "apk-internal-main");
});
