import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { allTestJobsCompleted, mandatoryTestJobs, sharedQualityFailed } from "../ci-fail-fast.mjs";

test("watchdog cancels shared failures only, preserving the opposite lane", () => {
  for (const name of [
    "Route branch / PR",
    "Check commits",
    "Lint and CI contracts",
    "Typecheck",
    "Integration tests (API)",
    "Native tooling and flow syntax",
    "Build API",
    "Build Web",
    "Build Site",
    "🔀 Resolve CI context",
    "💬 commitlint (Conventional Commits)",
    "🧹 Biome lint & format",
    "🧪 TypeScript typecheck",
    "🐳 API integration tests (testcontainers)",
    "🏗️ Build API",
    "🏗️ Build Web",
    ...["mobile", "web", "api", "schemas", "shared", "mcp"].flatMap((app) => [
      `Unit tests (${app})`,
      `🧪 Unit tests (${app})`,
      `🧪 Unit tests (${app}) + coverage`,
    ]),
  ]) {
    for (const conclusion of ["failure", "timed_out", "startup_failure"])
      assert.equal(sharedQualityFailed([{ name, conclusion }]), true);
    for (const conclusion of ["success", "skipped", null])
      assert.equal(sharedQualityFailed([{ name, conclusion }]), false);
  }
  for (const name of [
    "📱 Mobile APK (internal) — build or reuse",
    "🎬 Maestro E2E (mobile)",
    "🎭 Playwright E2E (web)",
    "🔌 Development API Preview",
    "📦 Draft prerelease (APK + changelog) → Telegram",
    "🗑️ Cleanup E2E test user",
    "React render performance (web)",
    "React render performance (mobile)",
    "Unknown job",
  ])
    assert.equal(sharedQualityFailed([{ name, conclusion: "failure" }]), false);
});

test("watchdog recognizes the current workflow labels and keeps lane failures isolated", () => {
  const { jobs } = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
  for (const [id, job] of Object.entries(jobs)) {
    if (id === "ready") continue;
    const names =
      id === "unit-tests" || id === "render-performance"
        ? job.strategy.matrix.app.map((app) => job.name.replace(`\${{ matrix.app }}`, app))
        : [job.name];
    const common = [
      "context",
      "commitlint",
      "lint",
      "typecheck",
      "unit-tests",
      "integration-tests",
      "native-tooling",
      "build-api",
      "build-web",
      "build-site",
    ].includes(id);
    for (const name of names)
      assert.equal(sharedQualityFailed([{ name, conclusion: "failure" }]), common, id);
  }
  assert.equal(jobs["detect-mobile-changes"], undefined);
  assert(!jobs["build-mobile-internal"].needs.includes("detect-mobile-changes"));
});

test("watchdog waits for required unit, integration and tooling jobs", () => {
  const { jobs } = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
  const ids = ["lint", "unit-tests", "integration-tests", "native-tooling"];
  const names = ids.flatMap((id) =>
    jobs[id].strategy?.matrix?.app
      ? jobs[id].strategy.matrix.app.map((app) => jobs[id].name.replace(`\${{ matrix.app }}`, app))
      : [jobs[id].name],
  );
  assert.deepEqual([...mandatoryTestJobs].sort(), names.sort());
  const complete = mandatoryTestJobs.map((name) => ({
    name,
    status: "completed",
    conclusion: "success",
  }));
  assert.equal(allTestJobsCompleted(complete), true);
  assert.equal(
    allTestJobsCompleted([...complete, { name: "Build Site", status: "in_progress" }]),
    false,
  );
  assert.equal(
    allTestJobsCompleted([...complete, { name: "Build Site", status: "completed" }]),
    true,
  );
  assert.equal(allTestJobsCompleted([]), false);
  for (const name of mandatoryTestJobs) {
    assert.equal(allTestJobsCompleted(complete.filter((job) => job.name !== name)), false, name);
    for (const status of [undefined, "queued", "in_progress", "waiting"]) {
      const pending = complete.map((job) => (job.name === name ? { ...job, status } : job));
      assert.equal(allTestJobsCompleted(pending), false, `${name}: ${status}`);
      assert.equal(
        allTestJobsCompleted([...pending, { name: "Unrelated", status: "completed" }]),
        false,
      );
    }
    assert.equal(
      allTestJobsCompleted(
        complete.map((job) => (job.name === name ? { ...job, conclusion: "failure" } : job)),
      ),
      true,
      name,
    );
  }
});
