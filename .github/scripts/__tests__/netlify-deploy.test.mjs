import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const read = (path) => readFileSync(path, "utf8");

test("Netlify deploys separately from Vercel, release publication and test fixtures", () => {
  for (const [file, environment] of [
    ["pr-ci", "development"],
    ["main-ci", "production"],
  ]) {
    const { jobs } = parse(read(`.github/workflows/${file}.yml`));
    const id = `deploy-netlify-${environment}`;
    const job = jobs[id];
    assert.equal(job.environment, environment);
    assert(!job.needs.some((dependency) => /^(deploy-|build-apk)/.test(dependency)));
    assert(Object.values(jobs).every((candidate) => !candidate.needs?.includes(id)));
    assert(job.steps[0].uses.startsWith("actions/checkout@"));
    const deploy = job.steps[1];
    assert.equal(deploy.uses, "./.github/actions/netlify-deploy");
    assert.equal(deploy.if, "vars.BGO_NETLIFY_ENABLED == 'true'");
    assert.equal(deploy.with["netlify-token"], `\${{ secrets.NETLIFY_AUTH_TOKEN }}`);
    if (environment === "development") {
      assert.match(job.if, /mode == 'pr'.*trusted == 'true'/);
      assert.equal(job.steps[0].with["persist-credentials"], false);
      assert.equal(deploy.with["gateway-pr"], `\${{ vars.BGO_NETLIFY_MCP_GATEWAY_PR_NUMBER }}`);
    }
  }
});

test("Netlify previews scope their origin per deployment with no Vercel bypass", () => {
  const script = read(".github/actions/netlify-deploy/deploy.sh");
  assert.match(script, /--context branch-deploy --alias/);
  assert.match(script, /--env "BGO_NETLIFY_WEB_ORIGIN=/);
  assert.doesNotMatch(script, /VERCEL_PROTECTION_BYPASS|\/api\/admin\/ci-db/);
});

test("Netlify verifies the branch alias and returns the immutable deploy URL", () => {
  const id = "6b05554dbff23da685a43266";
  const site = "test-site-id";
  const name = "bgo-api-development";
  const alias = "pr-35-123-1";
  const deployment = {
    id,
    site_id: site,
    name,
    state: "ready",
    context: "branch-deploy",
    branch: alias,
    deploy_ssl_url: `https://${alias}--${name}.netlify.app`,
  };
  const verify = (record, context = "branch-deploy") =>
    spawnSync(
      "jq",
      [
        "-er",
        "--arg",
        "id",
        id,
        "--arg",
        "site",
        site,
        "--arg",
        "name",
        name,
        "--arg",
        "context",
        context,
        "--arg",
        "alias",
        alias,
        "-f",
        ".github/actions/netlify-deploy/permalink.jq",
      ],
      { input: JSON.stringify(record), encoding: "utf8" },
    );

  const success = verify(deployment);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stdout.trim(), `https://${id}--${name}.netlify.app`);
  assert.equal(verify({ ...deployment, context: "production" }, "production").status, 0);
  assert.equal(verify({ ...deployment, site_id: "other" }).status, 4);
  assert.equal(verify({ ...deployment, context: "deploy-preview" }).status, 4);
  assert.equal(verify({ ...deployment, branch: "old-run" }).status, 4);
  assert.equal(verify({ ...deployment, deploy_ssl_url: "https://another.netlify.app" }).status, 4);
});
