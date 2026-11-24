import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const read = (path) => readFileSync(path, "utf8");

const workflows = ".github/workflows";
const callable = parse(read(`${workflows}/netlify-deploy.yml`));
const pr = parse(read(`${workflows}/pr-ci.yml`)).jobs;
const main = parse(read(`${workflows}/main-ci.yml`)).jobs;

test("Netlify API, Web, Site and MCP are separate jobs with scoped credentials", () => {
  const job = callable.jobs.deploy;
  const [checkout, deploy] = job.steps;
  assert.equal(job.environment, `\${{ inputs.target }}`);
  assert.equal(job["continue-on-error"], true);
  assert(checkout.uses.startsWith("actions/checkout@"));
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(deploy.uses, "./.github/actions/netlify-deploy");
  assert.match(deploy.if, /vars.BGO_NETLIFY_ENABLED == 'true'/);
  assert.match(deploy.if, /vars.BGO_NETLIFY_MCP_GATEWAY_PR_NUMBER/);
  assert.equal(deploy.with["netlify-token"], `\${{ secrets.NETLIFY_AUTH_TOKEN }}`);
  assert.match(deploy.with["clerk-secret-key"], /inputs.component == 'api'/);

  for (const [jobs, environment] of [
    [pr, "development"],
    [main, "production"],
  ]) {
    for (const component of ["api", "web", "site", "mcp"]) {
      const componentJob = jobs[`deploy-netlify-${environment}-${component}`];
      assert.equal(componentJob.uses, "./.github/workflows/netlify-deploy.yml");
      assert.equal(componentJob.with.target, environment);
      assert.equal(componentJob.with.component, component);
      assert.equal(Boolean(componentJob.secrets.CLERK_SECRET_KEY), component === "api");
      if (component === "web" || component === "mcp") {
        const api = `deploy-netlify-${environment}-api`;
        assert(componentJob.needs.includes(api));
        assert.equal(componentJob.with["api-url"], `\${{ needs.${api}.outputs.api-url }}`);
        assert.equal(
          componentJob.with["api-client-url"],
          `\${{ needs.${api}.outputs.api-client-url }}`,
        );
      }
    }
  }
  for (const component of ["api", "web"]) {
    const isolated = pr[`deploy-netlify-ci-${component}`];
    assert.equal(isolated.with.isolated, true);
    assert(pr["select-preview"].needs.includes(`deploy-netlify-ci-${component}`));
    assert(pr["select-development"].needs.includes(`deploy-netlify-development-${component}`));
  }
  assert(pr["deploy-netlify-development-site"].needs.includes("deploy-netlify-development-web"));
});

test("a blocked team skips Vercel jobs and a verified Vercel pair skips Netlify fallback", () => {
  for (const [jobs, environment] of [
    [pr, "development"],
    [main, "production"],
  ]) {
    const check = jobs["check-vercel"];
    assert.equal(check.environment, environment);
    assert.equal(check.steps.at(-1).run, "node .github/scripts/vercel-deploy-preflight.mjs");
    assert.equal(check.outputs.status, `\${{ steps.check.outputs.status }}`);
    assert.equal(check.steps.at(-1).env.VERCEL_TOKEN, `\${{ secrets.VERCEL_TOKEN }}`);
  }
  for (const id of [
    "deploy-preview-api",
    "deploy-development-api",
    "deploy-development-mcp-gateway",
  ]) {
    assert(pr[id].needs.includes("check-vercel"), id);
    assert.match(pr[id].if, /needs.check-vercel.outputs.status != 'blocked'/);
  }
  assert.match(pr["deploy-netlify-ci-api"].if, /needs.deploy-preview-web.outputs.ready != 'true'/);
  assert.match(
    pr["deploy-netlify-development-api"].if,
    /needs.deploy-development-web.outputs.ready != 'true'/,
  );
  assert.match(
    pr["deploy-netlify-development-api"].if,
    /needs.deploy-development-site.outputs.ready != 'true'/,
  );
  assert.match(
    pr["deploy-netlify-development-api"].if,
    /needs.deploy-development-mcp-gateway.result == 'failure'/,
  );
  for (const id of ["deploy-preview-web", "deploy-development-web"]) {
    const verify = pr[id].steps.find((item) => item.id === "candidate");
    assert.match(verify.run, /node .github\/scripts\/select-deploy-provider\.mjs/);
    assert(!Object.keys(verify.env).some((key) => key.startsWith("NETLIFY_")));
  }
});

test("Netlify previews scope their origin per deployment with no Vercel bypass", () => {
  const script = read(".github/actions/netlify-deploy/deploy.sh");
  assert.match(script, /--context branch-deploy --alias/);
  assert.match(script, /--env "BGO_NETLIFY_WEB_ORIGIN=/);
  assert.doesNotMatch(script, /VERCEL_PROTECTION_BYPASS|\/api\/admin\/ci-db/);
});

test("the prebuilt MCP gateway publishes without a build-only context flag", () => {
  const script = read(".github/actions/netlify-deploy/deploy.sh");
  const command = script.slice(
    script.indexOf("gateway_result="),
    script.indexOf("gateway_deploy="),
  );
  assert.match(command, /netlify deploy --no-build/);
  assert.match(command, /--prod/);
  assert.doesNotMatch(command, /--context/);
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

test("Netlify attests the application database and its effective webhook database", () => {
  const verify = (record, expected = "") =>
    spawnSync(
      "jq",
      ["-e", "--arg", "expected", expected, "-f", ".github/actions/netlify-deploy/database.jq"],
      {
        input: JSON.stringify(record),
        encoding: "utf8",
      },
    ).status;

  assert.equal(verify({ databaseName: "staging", webhookDbReady: false }), 0);
  assert.equal(verify({ databaseName: "staging", webhookDatabaseName: "staging" }), 0);
  assert.equal(verify({ databaseName: "bgo_ci_123_1" }), 1);
  assert.equal(verify({ databaseName: "staging", webhookDatabaseName: "unexpected" }), 1);
  assert.equal(verify({}), 1);
  assert.equal(verify({ databaseName: "bgo_ci_123_1" }, "bgo_ci_123_1"), 0);
  assert.equal(verify({ databaseName: "staging" }, "bgo_ci_123_1"), 1);
  assert.equal(verify({ databaseName: "bgo_ci_123_2" }, "bgo_ci_123_1"), 1);
  assert.equal(
    verify({ databaseName: "bgo_ci_123_1", webhookDatabaseName: "bgo_ci_123_2" }, "bgo_ci_123_1"),
    1,
  );
});
