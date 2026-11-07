import assert from "node:assert/strict";
import test from "node:test";
import { sharedQualityFailed } from "./ci-fail-fast.mjs";

test("watchdog cancels shared failures only, preserving the opposite lane", () => {
  for (const name of [
    "🔀 Resolve CI context",
    "💬 commitlint (Conventional Commits)",
    "🧹 Biome lint & format",
    "🧪 TypeScript typecheck",
    "🐳 API integration tests (testcontainers)",
    "🏗️ Build API",
    "🏗️ Build Web",
    ...["mobile", "web", "api", "schemas", "shared"].flatMap((app) => [
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
