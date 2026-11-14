import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const pr = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
const main = parse(readFileSync(".github/workflows/main-ci.yml", "utf8"));
const update = parse(readFileSync(".github/actions/mobile-update/action.yml", "utf8"));
const expression = (value) => `\${{ ${value} }}`;
const find = (job, name) => job.steps.find((step) => step.name === name);
const position = (job, name) => job.steps.findIndex((step) => step.name === name);

test("only trusted Development publication and pinned Production release publish Android OTA", () => {
  const dev = pr.jobs["draft-release"];
  const prod = main.jobs["publish-release"];
  for (const [job, variant, source, build] of [
    [dev, "development", expression("github.sha"), pr.jobs["build-mobile-development"]],
    [prod, "production", expression("needs.release.outputs.sha"), main.jobs["build-apk"]],
  ]) {
    const step = job.steps.find((step) => step.uses === "./.github/actions/mobile-update");
    assert.equal(job.environment, variant);
    assert.equal(step.with["app-environment"], variant);
    assert.equal(step.with["source-sha"], source);
    const binary = build.steps.find((step) => step.uses === "./.github/actions/mobile-build");
    for (const key of [
      "update-channel",
      "expo-token",
      "api-url",
      "clerk-publishable-key",
      "maptiler-api-key",
      "sentry-dsn",
      "google-services-json",
      "protection-bypass",
    ])
      assert.equal(step.with[key], binary.with[key], `${variant}: ${key}`);
    const upload = job.steps.find((step) => step.run?.includes("scripts/eas-upload.mjs"));
    assert.match(upload.run, /eas-cli@27\.7\.2/);
    assert(job.steps.indexOf(upload) < job.steps.indexOf(step));
    assert.equal(step["continue-on-error"], undefined);
  }
  assert.match(dev.if, /trusted == 'true'/);
  assert.deepEqual(prod.needs, ["release", "build-apk", "deploy-production"]);
  assert(
    main.jobs["deploy-production"].steps.some(
      (step) => step.name === "🔎 Read-only production smoke",
    ),
  );
  assert(
    !pr.jobs["build-mobile-internal"].steps.some(
      (step) => step.uses === "./.github/actions/mobile-update",
    ),
  );
  assert(
    position(dev, "🔗 Activate Development API after smoke and current PR checks") <
      position(dev, "📡 Publish verified Development OTA"),
  );
  assert(
    position(dev, "📡 Publish verified Development OTA") <
      position(dev, "📦 Publish/update public PR prerelease"),
  );
  assert(
    position(prod, "📡 Publish verified Production OTA") <
      position(prod, "📦 Stage release notes from the pinned bump commit"),
  );
});

test("Development producers consume a stable non-CI URL, assigning it only after publication gates", () => {
  const api = pr.jobs["deploy-development-api"];
  assert.equal(api.outputs.url, expression("steps.deploy.outputs.deployment-url"));
  assert.equal(api.outputs["branch-url"], expression("steps.client-url.outputs.url"));
  assert.equal(
    find(api, "🔗 Resolve stable Development client API URL").run,
    "node .github/scripts/development-api-alias.mjs --url",
  );
  assert(!api.steps.some((step) => step.run?.includes("alias set")));
  const web = pr.jobs["deploy-development-web"];
  assert.equal(find(web, "🔗 Restore PR branch metadata").run, 'git switch -C "$GITHUB_HEAD_REF"');
  assert.match(
    find(web, "🚀 Deploy Web against Development API").with["extra-env"],
    /needs\.deploy-development-api\.outputs\.branch-url/,
  );
  const publication = pr.jobs["draft-release"];
  const alias = find(publication, "🔗 Activate Development API after smoke and current PR checks");
  assert.equal(alias.env.VERCEL_ORG_ID, expression("secrets.VERCEL_ORG_ID"));
  assert.equal(
    alias.env.DEVELOPMENT_API_URL,
    expression("needs.deploy-development-api.outputs.url"),
  );
  assert.equal(
    alias.env.DEVELOPMENT_WEB_URL,
    expression("needs.deploy-development-web.outputs.url"),
  );
  assert.match(alias.run.trim(), /node \.github\/scripts\/development-api-alias\.mjs$/);
  for (const gate of [
    "lint",
    "typecheck",
    "unit-tests",
    "integration-tests",
    "build-api",
    "build-web",
    "deploy-development-api",
    "deploy-development-web",
    "build-mobile-development",
  ])
    assert(publication.needs.includes(gate), gate);
  assert.equal(
    pr.jobs["build-mobile-internal"].steps.find(
      (step) => step.uses === "./.github/actions/mobile-build",
    ).with["api-url"],
    expression("needs.deploy-preview-api.outputs.branch-url"),
  );
});

test("all PRs share a serialized Development OTA lane while CI and Production remain isolated", () => {
  const publication = pr.jobs["draft-release"];
  assert.deepEqual(publication.concurrency, {
    group: "development-publication",
    "cancel-in-progress": false,
  });
  const build = pr.jobs["build-mobile-development"].steps.find(
    (step) => step.uses === "./.github/actions/mobile-build",
  );
  const ota = publication.steps.find((step) => step.uses === "./.github/actions/mobile-update");
  assert.equal(build.with["update-channel"], "development");
  assert.equal(ota.with["update-channel"], "development");
  const isolated = pr.jobs["build-mobile-internal"].steps.find(
    (step) => step.uses === "./.github/actions/mobile-build",
  );
  assert.equal(
    isolated.with["update-channel"],
    `ci-pr-${expression("github.event.pull_request.number")}`,
  );
  const production = main.jobs["publish-release"].steps.find(
    (step) => step.uses === "./.github/actions/mobile-update",
  );
  assert.equal(production.with["update-channel"], "production");
});

test("Development checkout and APK provenance identify the actual merge SHA separately from the PR head guard", () => {
  for (const name of [
    "deploy-development-api",
    "deploy-development-web",
    "build-mobile-development",
    "draft-release",
  ])
    assert.equal(
      pr.jobs[name].steps.find((step) => step.uses === "actions/checkout@v4").with.ref,
      expression("github.sha"),
    );
  assert.match(
    find(pr.jobs["build-mobile-development"], "🏷️ Record development API URL in APK artifact").run,
    /git rev-parse HEAD > apps\/mobile\/build-output\/source-head\.txt/,
  );
  assert.equal(
    find(pr.jobs["draft-release"], "🔒 Verify APK development API URL").env.EXPECTED_HEAD_SHA,
    expression("github.sha"),
  );
  assert.equal(
    find(pr.jobs["draft-release"], "🔒 Refuse stale Development publication").env.PR_HEAD_SHA,
    expression("github.event.pull_request.head.sha"),
  );
});

test("OTA composite passes scoped build inputs without Infisical access or secret CLI arguments", () => {
  const step = update.runs.steps[0];
  assert.equal(step.run, "node .github/scripts/publish-mobile-update.mjs");
  assert.equal(step.env.MOBILE_BUILD_PROFILE, "internal");
  assert.equal(step.env.EXPO_NO_DOTENV, "1");
  assert.equal(step.env.SENTRY_DISABLE_AUTO_UPLOAD, "true");
  assert.equal(step.env.EXPO_TOKEN, expression("inputs.expo-token"));
  assert.equal(step.env.GOOGLE_SERVICES_JSON_CONTENT, expression("inputs.google-services-json"));
  assert.doesNotMatch(JSON.stringify(update), /infisical|continue-on-error|--no-bytecode/);
});
