import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const jobs = parse(readFileSync(".github/workflows/main-ci.yml", "utf8")).jobs;
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

test("published APK still targets production, not isolated Preview", () => {
  assert.equal(
    step("build-apk", "🏗️ Build APK (eas build --local, internal profile)").with["api-url"],
    "https://api.board-game-organizer.com",
  );
  assert.equal(step("publish-release", "📥 Download internal APK").with.name, "apk-internal-main");
});
