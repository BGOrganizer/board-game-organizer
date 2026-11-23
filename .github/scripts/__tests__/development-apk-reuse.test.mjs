import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  findDevelopmentApk,
  requireEquivalentDevelopmentApk,
  verifyDevelopmentApk,
} from "../development-apk-reuse.mjs";
import { mobileBuildInputs } from "../mobile-build-inputs.mjs";

const repository = "BGOrganizer/board-game-organizer";
const producerHead = "a".repeat(40);
const source = "b".repeat(40);
const current = "c".repeat(40);
const gh = {
  GITHUB_REPOSITORY: repository,
  GITHUB_HEAD_REF: "feat/preview",
  PR_NUMBER: "33",
  GH_TOKEN: "fixture",
};
const run = {
  id: 4,
  run_attempt: 2,
  status: "completed",
  event: "pull_request",
  path: ".github/workflows/pr-ci.yml",
  head_branch: gh.GITHUB_HEAD_REF,
  head_repository: { full_name: repository },
  pull_requests: [{ number: 33, head: { sha: current } }],
  head_sha: producerHead,
};
const artifact = {
  name: "apk-development",
  expired: false,
  workflow_run: { id: run.id, head_sha: producerHead },
};
const build = {
  name: "Build APK (Development)",
  conclusion: "success",
  steps: [{ name: "🏗️ Build internal APK against development Preview", conclusion: "success" }],
};

function database(runs = [run], artifacts = [artifact], jobs = [build]) {
  return (url, options) => {
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(options.redirect, "error");
    if (url.pathname.endsWith("/runs")) {
      assert.equal(url.searchParams.get("branch"), gh.GITHUB_HEAD_REF);
      assert.equal(url.searchParams.get("status"), "completed");
      return Response.json({ workflow_runs: runs });
    }
    if (url.pathname.endsWith("/4/artifacts")) {
      assert.equal(url.searchParams.get("name"), "apk-development");
      return Response.json({ artifacts });
    }
    assert(url.pathname.endsWith("/4/attempts/2/jobs"));
    return Response.json({ jobs });
  };
}

test("selects the original successful build from this trusted PR using its historical head", async () => {
  assert.deepEqual(await findDevelopmentApk(gh, database()), { runId: 4, headSha: producerHead });
  assert.equal(
    await findDevelopmentApk(
      gh,
      database([
        { ...run, event: "push" },
        { ...run, status: "in_progress" },
        { ...run, path: ".github/workflows/main-ci.yml" },
        { ...run, head_branch: "other" },
        { ...run, head_repository: { full_name: "someone/fork" } },
        { ...run, head_sha: "wrong" },
        { ...run, pull_requests: [{ number: 32 }] },
        { ...run, id: 0 },
        { ...run, run_attempt: 0 },
      ]),
    ),
    undefined,
  );
  for (const wrong of [
    [],
    [artifact, artifact],
    [{ ...artifact, expired: true }],
    [{ ...artifact, name: "apk-development-reused" }],
    [{ ...artifact, workflow_run: { id: 3, head_sha: producerHead } }],
    [{ ...artifact, workflow_run: { id: 4, head_sha: current } }],
  ])
    assert.equal(await findDevelopmentApk(gh, database([run], wrong)), undefined);
  assert.equal(
    await findDevelopmentApk(
      gh,
      database(
        [run],
        [artifact],
        [
          { ...build, conclusion: "failure" },
          { ...build, steps: [{ ...build.steps[0], conclusion: "skipped" }] },
        ],
      ),
    ),
    undefined,
  );
  await assert.rejects(
    findDevelopmentApk({ ...gh, PR_NUMBER: "false" }, database()),
    /PR identity/,
  );
  await assert.rejects(
    findDevelopmentApk(gh, () => new Response(null, { status: 403 })),
    /cannot read/i,
  );
});

test("requires a nonempty checksummed APK, exact configuration and the original merge source", async (t) => {
  const folder = mkdtempSync(join(tmpdir(), "bgo-apk-reuse-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const env = {
    APP_VARIANT: "development",
    EXPO_UPDATE_CHANNEL: "development",
    MOBILE_BUILD_PROFILE: "internal",
    APK_PRODUCER_HEAD: producerHead,
    GITHUB_SHA: current,
    EXPO_PUBLIC_API_URL: "https://api-development-pr-33.example.test",
    GOOGLE_SERVICES_JSON_CONTENT: "fixture",
  };
  const files = {
    "app.apk": "apk",
    "api-url.txt": env.EXPO_PUBLIC_API_URL,
    "source-head.txt": source,
    "update-channel.txt": env.EXPO_UPDATE_CHANNEL,
    "build-inputs.sha256": mobileBuildInputs(env),
    "apk.sha256": `${createHash("sha256").update("apk").digest("hex")}  app.apk\n`,
  };
  for (const [name, data] of Object.entries(files)) writeFileSync(join(folder, name), data);
  const compare = (...args) => assert.deepEqual(args, [source, current, folder, producerHead]);
  assert.equal(await verifyDevelopmentApk(folder, env, folder, compare), source);
  await assert.rejects(
    verifyDevelopmentApk(
      folder,
      { ...env, GOOGLE_SERVICES_JSON_CONTENT: "rotated" },
      folder,
      compare,
    ),
    /configuration/,
  );
  for (const [name, wrong, message] of [
    ["api-url.txt", "https://other.example.test", /configuration/],
    ["update-channel.txt", "ci-pr-33", /configuration/],
    ["apk.sha256", `${"0".repeat(64)}  missing.apk`, /configuration/],
    ["app.apk", "damaged", /checksum mismatch/],
    ["app.apk", "", /empty/],
  ]) {
    writeFileSync(join(folder, name), wrong);
    await assert.rejects(verifyDevelopmentApk(folder, env, folder, compare), message);
    writeFileSync(join(folder, name), files[name]);
  }
  await assert.rejects(
    verifyDevelopmentApk(folder, env, folder, () => {
      throw new Error("Wrong merge source");
    }),
    /wrong merge source/i,
  );
});

test("compares the producer merge tree, including main-side changes and the actual Development build recipe", (t) => {
  const repo = mkdtempSync(join(tmpdir(), "bgo-apk-merge-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", ...args], {
      cwd: repo,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
  git("init", "-b", "main");
  const recipe = `jobs:
  build-mobile-development:
    runs-on: ubuntu-latest
    steps:
      - uses: ./.github/actions/mobile-build
        with:
          profile: internal
`;
  function commit(path, value) {
    const file = join(repo, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, value);
    git("add", "--", path);
    git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
    return git("rev-parse", "HEAD");
  }
  commit(".github/workflows/pr-ci.yml", recipe);
  git("checkout", "-b", "feature");
  const head = commit("apps/web/index.ts", "1");
  git("checkout", "main");
  git("-c", "commit.gpgsign=false", "merge", "--no-ff", "--no-edit", "feature");
  const merge = git("rev-parse", "HEAD");
  const webOnly = commit("apps/api/index.ts", "2");
  requireEquivalentDevelopmentApk(merge, webOnly, repo, head);
  assert.throws(
    () => requireEquivalentDevelopmentApk(merge, webOnly, repo, current),
    /producer merge/,
  );
  assert.throws(() => requireEquivalentDevelopmentApk(head, webOnly, repo, head), /producer merge/);
  const orchestration = commit(
    ".github/workflows/pr-ci.yml",
    recipe.replace("- uses:", "- if: steps.reuse.outputs.source-sha == ''\n        uses:"),
  );
  requireEquivalentDevelopmentApk(merge, orchestration, repo, head);
  const buildChanged = commit(
    ".github/workflows/pr-ci.yml",
    recipe.replace("internal", "different"),
  );
  assert.throws(
    () => requireEquivalentDevelopmentApk(merge, buildChanged, repo, head),
    /inputs changed/,
  );
  commit(".github/workflows/pr-ci.yml", recipe);
  const mobile = commit("apps/mobile/app.config.js", "3");
  assert.throws(() => requireEquivalentDevelopmentApk(merge, mobile, repo, head), /inputs changed/);
});
