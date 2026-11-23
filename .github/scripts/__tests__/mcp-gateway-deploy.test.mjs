import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const load = (path) => parse(readFileSync(`.github/${path}`, "utf8"));
const pr = load("workflows/pr-ci.yml");
const main = load("workflows/main-ci.yml");
const action = load("actions/mcp-gateway-deploy/action.yml");
const [changes, setup, build, deploy] = action.runs.steps;

test("each gateway job is dedicated, scoped, and independent from API, APK and release jobs", () => {
  const development = pr.jobs["deploy-development-mcp-gateway"];
  const production = main.jobs["deploy-production-mcp-gateway"];
  assert.deepEqual(development.needs, ["context", "commitlint", "lint", "typecheck", "unit-tests"]);
  assert.deepEqual(production.needs, ["quality", "coverage"]);
  assert.match(development.if, /mode == 'pr'.*trusted == 'true'/);
  assert.deepEqual(development.permissions, {
    contents: "read",
    "pull-requests": "read",
    actions: "read",
  });
  assert.deepEqual(production.permissions, { contents: "read" });
  for (const [job, target] of [
    [development, "development"],
    [production, "production"],
  ]) {
    const [checkout, publish] = job.steps;
    assert.equal(job.environment, target);
    assert.equal(checkout.uses, "actions/checkout@v4");
    assert.equal(checkout.with.ref, "${{ github.sha }}");
    assert.equal(checkout.with["persist-credentials"], false);
    assert.equal(publish.uses, "./.github/actions/mcp-gateway-deploy");
    assert.equal(publish.with.target, target);
    assert.equal(publish.with["project-id"], "${{ vars.VERCEL_MCP_GATEWAY_PROJECT_ID }}");
  }
  assert.equal(
    development.steps[1].with["development-pr"],
    "${{ vars.BGO_MCP_GATEWAY_PR_NUMBER }}",
  );
  assert.equal(production.steps[1].with["development-pr"], undefined);
  for (const job of [...Object.values(pr.jobs), ...Object.values(main.jobs)]) {
    for (const key of ["deploy-development-mcp-gateway", "deploy-production-mcp-gateway"])
      assert(!(job.needs ?? []).includes(key));
  }
  assert.equal(setup.with.install, "false");
  assert.match(build.run, /bun apps\/mcp\/gateway-build\.mts .*"\$TARGET"/);
  assert.doesNotMatch(JSON.stringify([changes, setup, build]), /vercel-token|VERCEL_TOKEN/);
  assert.doesNotMatch(JSON.stringify(action), /VERCEL_PROTECTION_BYPASS|vercel env/);
});

const source = "e".repeat(40);
const base = "b".repeat(40);
const head = "a".repeat(40);
const owner = "team_Gateway";
const projectId = "prj_Gateway";

test("disabled projects, other PRs and unrelated source changes never reach the deployment", () => {
  const folder = mkdtempSync(join(tmpdir(), "bgo-gateway-selection-"));
  const mode = (overrides = {}) => {
    const output = join(folder, `output-${Object.keys(overrides).join("-")}`);
    const result = spawnSync(
      "bash",
      [
        "-c",
        `
      git() {
        case "$1" in
          rev-parse) echo "$GITHUB_SHA" ;;
          diff)
            [[ " $* " == *' apps/mcp/gateway-build.mts '* ]] || return 128
            [[ " $* " == *' packages/shared/src/common/api.ts '* ]] || return 128
            [[ " $* " != *' apps/api '* ]] || return 128
            return "$GIT_DIFF_STATUS"
            ;;
          *) return 128 ;;
        esac
      }
      ${changes.run}
    `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TARGET: "development",
          PROJECT_ID: projectId,
          DEVELOPMENT_PR: "33",
          PR_NUMBER: "33",
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_REF: "refs/pull/33/merge",
          GITHUB_SHA: source,
          GITHUB_OUTPUT: output,
          BASE_SHA: base,
          GIT_DIFF_STATUS: "1",
          ...overrides,
        },
      },
    );
    const configured = result.status === 0 && !result.stdout.trim();
    if (configured) assert.equal(readFileSync(output, "utf8"), "deploy=true\n");
    return { status: result.status, configured };
  };
  try {
    assert.deepEqual(mode(), { status: 0, configured: true });
    assert.deepEqual(mode({ PROJECT_ID: "" }), { status: 0, configured: false });
    assert.deepEqual(mode({ DEVELOPMENT_PR: "" }), { status: 0, configured: false });
    assert.deepEqual(mode({ PR_NUMBER: "34" }), { status: 0, configured: false });
    assert.deepEqual(mode({ GIT_DIFF_STATUS: "0" }), { status: 0, configured: false });
    assert.deepEqual(mode({ GIT_DIFF_STATUS: "128" }), { status: 1, configured: false });
    assert.deepEqual(
      mode({ TARGET: "production", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" }),
      { status: 0, configured: true },
    );
    assert.deepEqual(mode({ TARGET: "production" }), { status: 1, configured: false });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("promotion checks source twice, verifies the linked Vercel project, and pins the runtime upstream", () => {
  const folder = mkdtempSync(join(tmpdir(), "bgo-gateway-promotion-"));
  const run = (name, overrides = {}) => {
    const stage = join(folder, name);
    mkdirSync(join(stage, ".vercel"), { recursive: true });
    const result = spawnSync(
      "bash",
      [
        "-c",
        `
      git() { echo "$CHECKOUT_HEAD"; }
      node() {
        printf 'verify\n' >> "$STAGE/calls"
        if [[ "$STALE" == $(grep -c '^verify$' "$STAGE/calls") ]]; then return "$STALE_CODE"; fi
      }
      vercel() {
        printf '%s\n' "$1" >> "$STAGE/calls"
        case "$1" in
          api) printf '{"id": "%s", "accountId": "%s", "name": "%s"}' "$PROJECT_ID" "$VERCEL_ORG_ID" "$REMOTE_NAME" ;;
          deploy)
            [[ "$VERCEL_PROJECT_ID" == "$PROJECT_ID" ]] || return 32
            [[ " $* " == *' --prebuilt --prod --skip-domain --yes --json '* ]] || return 32
            [[ " $* " == *" --meta bgoGatewaySourceSha=$GITHUB_SHA "* ]] || return 32
            [[ " $* " == *" --env BGO_MCP_UPSTREAM_URL=$EXPECTED_UPSTREAM "* ]] || return 32
            echo '{"status":"ok","deployment":{"url":"https://gateway-fixture.vercel.app","readyState":"READY"}}'
            ;;
          promote) test "$2" = 'https://gateway-fixture.vercel.app' ;;
        esac
      }
      ${deploy.run}
    `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TARGET: "development",
          GITHUB_SHA: source,
          STAGE: stage,
          PROJECT_ID: projectId,
          VERCEL_ORG_ID: owner,
          VERCEL_TOKEN: "synthetic-token",
          PR_NUMBER: "33",
          PR_HEAD_SHA: head,
          CHECKOUT_HEAD: head,
          REMOTE_NAME: "bgo-mcp-development",
          EXPECTED_UPSTREAM:
            "https://api-development-pr-33-board-game-organizers-projects.vercel.app",
          STALE: "0",
          STALE_CODE: "1",
          ...overrides,
        },
      },
    );
    const calls = readFileSync(join(stage, "calls"), "utf8").trim().split("\n");
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-token/);
    if (calls.includes("deploy")) {
      assert.deepEqual(JSON.parse(readFileSync(join(stage, ".vercel/project.json"), "utf8")), {
        projectId,
        orgId: owner,
        projectName: overrides.REMOTE_NAME ?? "bgo-mcp-development",
      });
    }
    return [result.status, calls];
  };
  try {
    const production = {
      TARGET: "production",
      REMOTE_NAME: "bgo-mcp-production",
      EXPECTED_UPSTREAM: "https://api.board-game-organizer.com",
    };
    const success = [0, ["api", "verify", "deploy", "verify", "promote"]];
    assert.deepEqual(run("development"), success);
    assert.deepEqual(run("production", production), success);
    assert.deepEqual(run("wrong-project", { REMOTE_NAME: "bgo-api" }), [1, ["api"]]);
    assert.deepEqual(run("wrong-head", { CHECKOUT_HEAD: base }), [1, ["api"]]);
    assert.deepEqual(run("stale-pr", { STALE: "2" }), [1, ["api", "verify", "deploy", "verify"]]);
    assert.deepEqual(run("stale-main", { ...production, STALE: "2", STALE_CODE: "3" }), [
      0,
      ["api", "verify", "deploy", "verify"],
    ]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
