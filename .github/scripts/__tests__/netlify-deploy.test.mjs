import assert from "node:assert/strict";
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
  assert.match(script, /--context deploy-preview --alias/);
  assert.match(script, /--env "BGO_NETLIFY_WEB_ORIGIN=/);
  assert.doesNotMatch(script, /VERCEL_PROTECTION_BYPASS|\/api\/admin\/ci-db/);
});
