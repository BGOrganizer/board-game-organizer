import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { sharedQualityFailed } from "../ci-fail-fast.mjs";

test("watchdog cancels shared failures only, preserving the opposite lane", () => {
  for (const name of [
    "Route branch / PR",
    "Check commits",
    "Lint and CI contracts",
    "Typecheck",
    "Integration tests (API)",
    "Build API",
    "Build Web",
    "🔀 Resolve CI context",
    "💬 commitlint (Conventional Commits)",
    "🧹 Biome lint & format",
    "🧪 TypeScript typecheck",
    "🐳 API integration tests (testcontainers)",
    "🏗️ Build API",
    "🏗️ Build Web",
    ...["mobile", "web", "api", "schemas", "shared"].flatMap((app) => [
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
    "Unknown job",
  ])
    assert.equal(sharedQualityFailed([{ name, conclusion: "failure" }]), false);
});

test("watchdog recognizes the current workflow labels and keeps lane failures isolated", () => {
  const { jobs } = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
  for (const [id, job] of Object.entries(jobs)) {
    if (id === "ready") continue;
    const names =
      id === "unit-tests"
        ? job.strategy.matrix.app.map((app) => job.name.replace("${{ matrix.app }}", app))
        : [job.name];
    const common = [
      "context",
      "commitlint",
      "lint",
      "typecheck",
      "unit-tests",
      "integration-tests",
      "build-api",
      "build-web",
    ].includes(id);
    for (const name of names)
      assert.equal(sharedQualityFailed([{ name, conclusion: "failure" }]), common, id);
  }
  assert.equal(jobs["detect-mobile-changes"], undefined);
  assert(!jobs["build-mobile-internal"].needs.includes("detect-mobile-changes"));
});
