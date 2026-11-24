import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { scaffoldHostingProjects } from "../scaffold-hosting-projects.mjs";

const netlify = {
  BGO_HOSTING_PROVIDER: "netlify",
  BGO_HOSTING_ENVIRONMENT: "development",
  NETLIFY_TEAM_SLUG: "new-team",
  NETLIFY_AUTH_TOKEN: "mock-netlify-secret",
};
const vercel = {
  BGO_HOSTING_PROVIDER: "vercel",
  BGO_HOSTING_ENVIRONMENT: "production",
  VERCEL_ORG_ID: "team_Example",
  VERCEL_TOKEN: "mock-vercel-secret",
  VERCEL_PROTECTION_BYPASS: "mock-ci-bypass",
};
const siteId = "1f9157f2-261e-4b5e-9ae2-99fb83029ed1";

test("Netlify creates unlinked projects in the configured team and verifies each ownership receipt", async () => {
  const sites = new Map();
  const created = [];
  const messages = [];
  async function request(url, options) {
    assert.equal(url.origin, "https://api.netlify.com");
    assert.equal(url.pathname, "/api/v1/new-team/sites");
    assert.equal(options.headers.Authorization, "Bearer mock-netlify-secret");
    assert.equal(options.redirect, "error");
    if (options.method === "GET") {
      const site = sites.get(url.searchParams.get("name"));
      return Response.json(site ? [site] : []);
    }
    assert.equal(options.method, "POST");
    assert.equal(url.searchParams.get("configure_dns"), "false");
    const body = JSON.parse(options.body);
    assert.deepEqual(Object.keys(body), ["name"]);
    created.push(body.name);
    sites.set(body.name, { id: siteId, name: body.name, account_slug: "new-team" });
    return Response.json({}, { status: 201 });
  }

  await scaffoldHostingProjects(netlify, request, (message) => messages.push(message));
  await scaffoldHostingProjects(netlify, request, (message) => messages.push(message));
  assert.deepEqual(created, [
    "bgo-api-development",
    "bgo-web-development",
    "bgo-site-development",
    "bgo-mcp-development",
  ]);
  assert(messages.some((message) => message.includes("existing project")));
  assert(messages.some((message) => message.includes("Public visitor access")));
  assert.doesNotMatch(messages.join("\n"), /mock-netlify-secret/);
});

test("Netlify refuses another owner's project and never renames a globally reserved site", async () => {
  await assert.rejects(
    scaffoldHostingProjects(
      netlify,
      async (url, options) => {
        assert.equal(options.method, "GET");
        return Response.json([
          {
            id: siteId,
            name: url.searchParams.get("name"),
            account_slug: "other-team",
          },
        ]);
      },
      () => {},
    ),
    /ownership could not be confirmed/,
  );

  const methods = [];
  await assert.rejects(
    scaffoldHostingProjects(
      netlify,
      async (_url, options) => {
        methods.push(options.method);
        return options.method === "GET"
          ? Response.json([])
          : Response.json({ message: "untrusted upstream response" }, { status: 422 });
      },
      () => {},
    ),
    /global name availability/,
  );
  assert.deepEqual(methods, ["GET", "POST", "GET"]);
});

function mockVercel() {
  const projects = new Map();
  const calls = [];
  return {
    calls,
    projects,
    async request(url, options) {
      assert.equal(url.origin, "https://api.vercel.com");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, "Bearer mock-vercel-secret");
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push([options.method, url.pathname, body]);
      if (url.pathname === "/v2/teams/team_Example") return Response.json({ id: "team_Example" });
      assert.equal(url.searchParams.get("teamId"), "team_Example");
      if (options.method === "POST") {
        assert.equal(url.pathname, "/v11/projects");
        const project = { ...body, id: `prj_${projects.size + 1}`, accountId: "team_Example" };
        projects.set(project.name, project);
        return Response.json(project, { status: 201 });
      }
      const [, , , ref, setting] = url.pathname.split("/");
      const project = [...projects.values()].find(({ id, name }) => ref === id || ref === name);
      if (options.method === "GET")
        return project ? Response.json(project) : Response.json({}, { status: 404 });
      assert.equal(options.method, "PATCH");
      if (setting === "protection-bypass") {
        assert(body.generate.secret === vercel.VERCEL_PROTECTION_BYPASS);
        project.protectionBypass = { [body.generate.secret]: { scope: "automation" } };
        return Response.json({ protectionBypass: project.protectionBypass });
      }
      Object.assign(project, body);
      return Response.json(project);
    },
  };
}

test("Vercel applies the project settings to new projects and leaves existing projects intact", async () => {
  const { calls, projects, request } = mockVercel();
  const messages = [];
  await scaffoldHostingProjects(vercel, request, (message) => messages.push(message));
  const writes = calls.filter(([method]) => method !== "GET");
  const create = writes.filter(([method]) => method === "POST");
  assert.deepEqual(
    create.map(([, , body]) => body.name),
    ["api", "web", "site", "bgo-mcp-production"],
  );
  assert(create.every(([, , body]) => !body.gitRepository && !body.rootDirectory));
  assert.equal(projects.get("web").ssoProtection, null);
  for (const [name, project] of projects) {
    assert.equal(project.nodeVersion, "26.x");
    assert.equal(project.sourceFilesOutsideRootDirectory, true);
    if (name !== "web")
      assert.equal(project.ssoProtection?.deploymentType, "all_except_custom_domains");
  }
  assert.equal(writes.filter(([, path]) => path.endsWith("/protection-bypass")).length, 2);
  assert.doesNotMatch(messages.join("\n"), /mock-ci-bypass|mock-vercel-secret|team_Example/);

  calls.length = 0;
  await scaffoldHostingProjects(vercel, request, () => {});
  assert(calls.every(([method]) => method === "GET"));
});

test("Vercel stops before creating a protected API when the automation secret is missing", async () => {
  const { calls, request } = mockVercel();
  await assert.rejects(
    scaffoldHostingProjects({ ...vercel, VERCEL_PROTECTION_BYPASS: "" }, request, () => {}),
    /Sync VERCEL_PROTECTION_BYPASS from Infisical/,
  );
  assert(calls.every(([method]) => method === "GET"));
});

test("Vercel refuses unverified credentials and keeps provider response details out of errors", async () => {
  await assert.rejects(
    scaffoldHostingProjects(
      vercel,
      async () =>
        Response.json(
          {
            accessToken: "untrusted secret in response",
          },
          { status: 403 },
        ),
      () => {},
    ),
    { message: "Vercel team lookup returned HTTP 403." },
  );
  await assert.rejects(
    scaffoldHostingProjects(
      vercel,
      async () => Response.json({ id: "team_Other" }),
      () => {},
    ),
    /team ownership could not be confirmed/,
  );
  await assert.rejects(
    scaffoldHostingProjects(
      vercel,
      async () => new Response("mock-vercel-secret"),
      () => {},
    ),
    { message: "Vercel team lookup returned invalid JSON." },
  );
  await assert.rejects(
    scaffoldHostingProjects(
      { ...netlify, NETLIFY_TEAM_SLUG: "../wrong" },
      async () => {
        assert.fail("Invalid Netlify team slug must never reach the provider.");
      },
      () => {},
    ),
    /configured Netlify team slug/i,
  );
});

test("the manual workflow uses pre-existing environment secrets only on the trusted Main checkout", () => {
  const workflow = parse(readFileSync(".github/workflows/scaffold-hosting.yml", "utf8"));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.environment.options, [
    "development",
    "production",
  ]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const [provider, job] of Object.entries(workflow.jobs)) {
    assert.match(job.if, /github.repository == 'BGOrganizer\/board-game-organizer'/);
    assert.match(job.if, /github.ref == 'refs\/heads\/main'/);
    assert.equal(job.environment, `\${{ inputs.environment }}`);
    assert.equal(job.steps[0].with["persist-credentials"], false);
    const { env, run } = job.steps.at(-1);
    assert.equal(run, "node .github/scripts/scaffold-hosting-projects.mjs");
    assert.equal(env.BGO_HOSTING_PROVIDER, provider);
    assert.equal(
      env[provider === "netlify" ? "NETLIFY_AUTH_TOKEN" : "VERCEL_TOKEN"],
      provider === "netlify"
        ? `\${{ secrets.NETLIFY_AUTH_TOKEN }}`
        : `\${{ secrets.VERCEL_TOKEN }}`,
    );
  }
});
