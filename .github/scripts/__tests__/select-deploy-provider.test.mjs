import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deploymentCandidates, selectDeployment } from "../select-deploy-provider.mjs";

const development = {
  TARGET: "development",
  PR_NUMBER: "35",
  GITHUB_RUN_ID: "123",
  GITHUB_RUN_ATTEMPT: "2",
  VERCEL_API_URL: "https://api-test.vercel.app",
  VERCEL_WEB_URL: "https://web-test.vercel.app",
  VERCEL_PROTECTION_BYPASS: "mock-bypass",
  NETLIFY_API_URL: "https://111111111111111111111111--bgo-api-development.netlify.app",
  NETLIFY_WEB_URL: "https://222222222222222222222222--bgo-web-development.netlify.app",
  NETLIFY_API_CLIENT_URL: "https://pr-35-123-1--bgo-api-development.netlify.app",
  NETLIFY_WEB_CLIENT_URL: "https://pr-35-123-1--bgo-web-development.netlify.app",
};

test("prefers a complete, healthy Vercel pair when both deployments are available", async () => {
  const checked = [];
  const selected = await selectDeployment(deploymentCandidates(development), async (candidate) => {
    checked.push(candidate.provider);
    return true;
  });
  assert.equal(selected.provider, "vercel");
  assert.equal(selected.bypass, development.VERCEL_PROTECTION_BYPASS);
  assert.deepEqual(checked, ["vercel"]);
});

test("uses Netlify without a bypass when Vercel fails the smoke test", async () => {
  const checked = [];
  const selected = await selectDeployment(deploymentCandidates(development), async (candidate) => {
    checked.push(candidate.provider);
    return candidate.provider === "netlify";
  });
  assert.equal(selected.provider, "netlify");
  assert.equal(selected.bypass, undefined);
  assert.deepEqual(checked, ["vercel", "netlify"]);
});

test("complete provider pairs are mandatory and unrelated Netlify hosts are rejected", async () => {
  const candidates = deploymentCandidates({
    ...development,
    VERCEL_WEB_URL: "",
    NETLIFY_WEB_URL: "https://other.netlify.app",
  });
  assert.deepEqual(candidates, []);
  await assert.rejects(
    selectDeployment(candidates, async () => true),
    /No verified/,
  );
});

test("keeps isolated previews distinct from the ordinary staging client aliases", () => {
  assert.deepEqual(
    deploymentCandidates({ ...development, TARGET: "ci" }).map((c) => c.provider),
    ["vercel"],
  );
  const candidates = deploymentCandidates({
    ...development,
    TARGET: "ci",
    NETLIFY_API_CLIENT_URL: "https://ci-pr-35-123-1--bgo-api-development.netlify.app",
    NETLIFY_WEB_CLIENT_URL: "https://ci-pr-35-123-1--bgo-web-development.netlify.app",
  });
  assert.equal(candidates[1].provider, "netlify");
});

test("rejects aliases from another run or from different deployment attempts", () => {
  for (const ref of ["pr-35-456-1", "pr-36-123-1", "pr-35-123-2"]) {
    const candidates = deploymentCandidates({
      ...development,
      NETLIFY_WEB_CLIENT_URL: `https://${ref}--bgo-web-development.netlify.app`,
    });
    assert.deepEqual(
      candidates.map(({ provider }) => provider),
      ["vercel"],
    );
  }
});

test("uses only the verified Production pair and keeps the Vercel bypass off Netlify", async () => {
  const candidates = deploymentCandidates({
    TARGET: "production",
    VERCEL_PROTECTION_BYPASS: development.VERCEL_PROTECTION_BYPASS,
    NETLIFY_API_URL: "https://111111111111111111111111--bgo-api-production.netlify.app",
    NETLIFY_WEB_URL: "https://222222222222222222222222--bgo-web-production.netlify.app",
    NETLIFY_API_CLIENT_URL: "https://bgo-api-production.netlify.app",
    NETLIFY_WEB_CLIENT_URL: "https://bgo-web-production.netlify.app",
  });
  assert.equal(candidates.length, 1);
  const selected = await selectDeployment(candidates, async () => true);
  assert.equal(selected.provider, "netlify");
  assert.equal(selected.bypass, undefined);
  await assert.rejects(
    selectDeployment(candidates, async () => false),
    /No verified/,
  );
});

test("smoke checks exact URLs without following redirects or sending the bypass to Netlify", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    calls.push(url);
    assert.equal(options.redirect, "manual");
    return url.pathname === "/api/health"
      ? Response.json({ ok: true, service: "board-game-organizer-api" })
      : new Response("BGO");
  });

  const candidates = deploymentCandidates(development);
  assert.equal((await selectDeployment(candidates)).provider, "vercel");
  assert.equal((await selectDeployment(candidates.slice(1))).provider, "netlify");
  assert.deepEqual(
    calls.map((url) => [
      url.origin,
      url.pathname,
      url.searchParams.get("x-vercel-protection-bypass"),
    ]),
    [
      [development.VERCEL_API_URL, "/api/health", development.VERCEL_PROTECTION_BYPASS],
      [development.VERCEL_WEB_URL, "/", development.VERCEL_PROTECTION_BYPASS],
      [development.NETLIFY_API_URL, "/api/health", null],
      [development.NETLIFY_WEB_URL, "/", null],
    ],
  );
});

test("the final selector reuses the successful Vercel smoke from the same run", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "bgo-deploy-selection-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, "github-output");
  const result = spawnSync(process.execPath, [".github/scripts/select-deploy-provider.mjs"], {
    env: { ...process.env, ...development, VERCEL_VERIFIED: "true", GITHUB_OUTPUT: output },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(output, "utf8"), /^provider=vercel$/m);
  assert.match(readFileSync(output, "utf8"), /^web-url=https:\/\/web-test\.vercel\.app$/m);
});
