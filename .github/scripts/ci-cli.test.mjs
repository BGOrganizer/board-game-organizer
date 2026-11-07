import assert from "node:assert/strict";
import cp from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import timers from "node:timers/promises";
import { pathToFileURL } from "node:url";

const repo = "BGOrganizer/board-game-organizer",
  sha = "a".repeat(40),
  base = "b".repeat(40);
let serial = 0;
async function cli(
  t,
  name,
  env = {},
  request = async () => {
    throw Error("Unexpected unit request");
  },
  extra = {},
) {
  const folder = fs.mkdtempSync(join(tmpdir(), "bgo-ci-cli-"));
  const event = join(folder, "event.json"),
    output = join(folder, "output.txt"),
    apk = join(folder, "unit.apk");
  fs.writeFileSync(event, JSON.stringify({ ref: "refs/heads/feat/topic", before: base }));
  fs.writeFileSync(output, "");
  fs.writeFileSync(apk, "unit");
  const values = {
    GITHUB_REPOSITORY: repo,
    GITHUB_EVENT_NAME: "push",
    GITHUB_EVENT_PATH: event,
    GITHUB_OUTPUT: output,
    GITHUB_SHA: sha,
    GITHUB_REF_NAME: "feat/topic",
    GH_TOKEN: "unit-token",
    RUN_ID: "100",
    PR_NUMBER: "22",
    PR_HEAD_SHA: sha,
    PR_BASE_SHA: base,
    PR_TITLE: "CLI test",
    APP_VERSION: "1.3.2",
    APK_NAME: "bgo-development.apk",
    APK_PATH: apk,
    GITHUB_RUN_ID: "100",
    GITHUB_RUN_ATTEMPT: "1",
    DEVELOPMENT_WEB_URL: "https://web-dev.vercel.app",
    DEVELOPMENT_API_URL: "https://api-dev.vercel.app",
    EAS_BUILD_URL: "",
    ...env,
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const argv = process.argv[1],
    exit = process.exitCode;
  const errors = [],
    logs = [];
  const fetchMock = t.mock.method(globalThis, "fetch", request);
  const errorMock = t.mock.method(console, "error", (...a) => errors.push(a.join(" ")));
  const logMock = t.mock.method(console, "log", (...a) => logs.push(a.join(" ")));
  const timeoutMock = t.mock.method(timers, "setTimeout", async () => {});
  const execMock = t.mock.method(cp, "execFileSync", () => "Unit changelog");
  const write = fs.writeFileSync;
  const writeMock = t.mock.method(fs, "writeFileSync", (path, ...args) =>
    path === "/tmp/pr-changelog.md" ? undefined : write(path, ...args),
  );
  syncBuiltinESMExports();
  try {
    for (const [key, value] of Object.entries(values))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    process.argv[1] = resolve(`.github/scripts/${name}.mjs`);
    process.exitCode = undefined;
    await import(`${pathToFileURL(process.argv[1]).href}?cli=${serial++}`);
    return {
      code: process.exitCode ?? 0,
      output: fs.readFileSync(output, "utf8"),
      errors,
      logs,
      ...extra,
    };
  } finally {
    fetchMock.mock.restore();
    errorMock.mock.restore();
    logMock.mock.restore();
    timeoutMock.mock.restore();
    execMock.mock.restore();
    writeMock.mock.restore();
    syncBuiltinESMExports();
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    process.argv[1] = argv;
    process.exitCode = exit;
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
const pr = {
  state: "open",
  base: { ref: "main" },
  head: { sha, ref: "feat/topic", repo: { full_name: repo } },
};
const run = {
  id: 100,
  run_attempt: 1,
  run_number: 5,
  status: "in_progress",
  event: "pull_request",
  path: ".github/workflows/pr-ci.yml",
  head_sha: sha,
  head_branch: "feat/topic",
  head_repository: { full_name: repo },
  pull_requests: [{ number: 22 }],
};
test("routing CLI writes bounded outputs and fails closed on missing token, bad responses or malformed lookup", async (t) => {
  const good = await cli(t, "ci-context", {}, async (url, options) => {
    assert(url.includes("head=BGOrganizer%3Afeat%2Ftopic"));
    assert.equal(options.headers.Authorization, "Bearer unit-token");
    return Response.json([]);
  });
  assert.equal(good.code, 0);
  assert.match(good.output, /mode<<ci_[\s\S]*branch/);
  assert.equal((await cli(t, "ci-context", { GH_TOKEN: undefined })).code, 1);
  assert.equal(
    (await cli(t, "ci-context", {}, async () => new Response("private", { status: 503 }))).code,
    1,
  );
  assert.equal((await cli(t, "ci-context", {}, async () => Response.json({}))).code, 1);
});
test("current-PR CLI distinguishes verified and revoked revisions", async (t) => {
  assert.equal(
    (
      await cli(t, "ci-current-pr", {}, async (url) =>
        Response.json(
          url.endsWith("/pulls/22")
            ? pr
            : url.endsWith("/actions/runs/100")
              ? run
              : { workflow_runs: [run] },
        ),
      )
    ).code,
    0,
  );
  const revoked = await cli(t, "ci-current-pr", {}, async () =>
    Response.json({ ...pr, state: "closed" }),
  );
  assert.equal(revoked.code, 1);
  assert(!revoked.errors.join().includes("unit-token"));
});
test("gate CLI reports success only for its actual required status set", async (t) => {
  const names = ["context", "commitlint", "lint", "typecheck", "unit-tests", "integration-tests"];
  const env = {
    CI_MODE: "branch",
    CI_RESULTS: JSON.stringify(Object.fromEntries(names.map((n) => [n, "success"]))),
  };
  assert.equal((await cli(t, "ci-gate", env)).code, 0);
  assert.equal((await cli(t, "ci-gate", { ...env, CI_RESULTS: "{}" })).code, 1);
});
test("watchdog CLI exits completed runs, polls lane failures and cancels only shared failures", async (t) => {
  assert.equal((await cli(t, "ci-fail-fast", { RUN_ID: "bad" })).code, 1);
  assert.equal((await cli(t, "ci-fail-fast", { GITHUB_REPOSITORY: "bad" })).code, 1);
  assert.equal((await cli(t, "ci-fail-fast", { GH_TOKEN: undefined })).code, 1);
  assert.equal(
    (await cli(t, "ci-fail-fast", {}, async () => Response.json({ status: "completed" }))).code,
    0,
  );
  assert.equal(
    (await cli(t, "ci-fail-fast", {}, async () => new Response("private", { status: 500 }))).code,
    1,
  );
  let polls = 0;
  const polled = await cli(t, "ci-fail-fast", {}, async (url) => {
    if (url.includes("/jobs"))
      return Response.json({ jobs: [{ name: "🎬 Maestro E2E (mobile)", conclusion: "failure" }] });
    return Response.json({ status: polls++ ? "completed" : "in_progress" });
  });
  assert.equal(polled.code, 0);
  for (const cancelStatus of [202, 204, 409]) {
    let reads = 0,
      cancels = 0;
    const result = await cli(t, "ci-fail-fast", {}, async (url) => {
      if (url.endsWith("/cancel")) {
        cancels++;
        return new Response(null, { status: cancelStatus });
      }
      if (url.includes("/jobs"))
        return Response.json({ jobs: [{ name: "🧹 Biome lint & format", conclusion: "failure" }] });
      return Response.json({
        status: reads++ && cancelStatus === 409 ? "completed" : "in_progress",
      });
    });
    assert.equal(result.code, 0);
    assert.equal(cancels, 1);
  }
  const failed = await cli(t, "ci-fail-fast", {}, async (url) =>
    url.endsWith("/cancel")
      ? new Response(null, { status: 500 })
      : url.includes("/jobs")
        ? Response.json({ jobs: [{ name: "🏗️ Build API", conclusion: "failure" }] })
        : Response.json({ status: "in_progress" }),
  );
  assert.equal(failed.code, 1);
});
test("publication CLI generates changelog and safe output receipts without exposing credentials", async (t) => {
  assert.equal((await cli(t, "publish-pr-draft", { PR_BASE_SHA: "bad" })).code, 1);
  const digest = `sha256:${createHash("sha256").update("unit").digest("hex")}`;
  const result = await cli(t, "publish-pr-draft", {}, async (url, options) => {
    if (url.endsWith("/pulls/22")) return Response.json(pr);
    if (url.endsWith("/actions/runs/100")) return Response.json(run);
    if (url.includes("/actions/workflows/pr-ci.yml/runs?"))
      return Response.json({ workflow_runs: [run] });
    if (url.includes("/releases?")) return Response.json([]);
    if (url.endsWith("/releases"))
      return Response.json({
        id: 1,
        html_url: `https://github.com/${repo}/releases/tag/draft`,
        draft: true,
      });
    if (url.includes("/assets?") && options.method === "GET") return Response.json([]);
    if (url.startsWith("https://uploads.github.com"))
      return Response.json({
        id: 2,
        size: 4,
        digest,
        browser_download_url: `https://github.com/${repo}/releases/download/draft/apk.apk`,
      });
    if (options.method === "PATCH") return Response.json({ id: 1 });
    throw Error("Unexpected publication request");
  });
  assert.equal(result.code, 0);
  assert.match(result.output, /release_id=1/);
  assert(!result.output.includes("unit-token"));
});
