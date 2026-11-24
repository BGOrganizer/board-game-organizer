import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTION_HOSTS, resolveProductionTargets } from "../production-dns-targets.mjs";

const team = "board-game-organizer";
const vercelTeam = "team_fixture";
const siteId = "be36a2fb-84da-4c51-b98e-9dfd36c8bc2b";
const components = Object.keys(PRODUCTION_HOSTS);
const deployId = (component) => String(components.indexOf(component) + 1).repeat(24);
const projectName = (component) => `bgo-${component}-production`;
const vercelHostname = (component) => `${component}-123-bgo-production.vercel.app`;
const vercelId = (component) => `prj_${component}`;
const vercelDeploymentId = (component) => `dpl_${component}`;

function config(provider = "netlify", siteProvider = provider) {
  const env = {
    PRODUCTION_PROVIDER: provider,
    PRODUCTION_SITE_PROVIDER: siteProvider,
    VERCEL_ORG_ID: vercelTeam,
    VERCEL_TOKEN: "vercel-token-fixture",
    NETLIFY_AUTH_TOKEN: "netlify-token-fixture",
  };
  for (const component of components) {
    const kind = component === "site" ? siteProvider : provider;
    const hostname =
      kind === "vercel"
        ? vercelHostname(component)
        : `${deployId(component)}--${projectName(component)}.netlify.app`;
    env[`PRODUCTION_${component.toUpperCase()}_URL`] = `https://${hostname}`;
    env[`VERCEL_${component.toUpperCase()}_PROJECT_ID`] = vercelId(component);
  }
  return env;
}

function netlifySite(component, account = team) {
  const domain = PRODUCTION_HOSTS[component];
  return {
    id: siteId,
    name: projectName(component),
    account_slug: account,
    custom_domain: component === "web" ? null : domain,
    domain_aliases: component === "web" ? [domain] : [],
    published_deploy: {
      id: deployId(component),
      name: projectName(component),
      site_id: siteId,
      context: "production",
      state: "ready",
    },
  };
}

const vercelContent = {
  project: (component) => ({
    id: vercelId(component),
    accountId: vercelTeam,
    targets: { production: { id: vercelDeploymentId(component), url: vercelHostname(component) } },
  }),
  deployment: (component) => ({
    id: vercelDeploymentId(component),
    ownerId: vercelTeam,
    projectId: vercelId(component),
    url: vercelHostname(component),
    target: "production",
    readyState: "READY",
  }),
  domain: (component) => ({
    name: PRODUCTION_HOSTS[component],
    projectId: vercelId(component),
    verified: true,
    gitBranch: null,
    customEnvironmentId: null,
    redirect: null,
  }),
  dns: (component) => ({
    configuredBy: null,
    misconfigured: true,
    recommendedCNAME: [
      { rank: 2, value: "old.vercel-dns.com." },
      { rank: 1, value: `${component}.Example.COM.` },
    ],
    recommendedIPv4: [
      { rank: 2, value: ["192.0.2.9"] },
      { rank: 1, value: ["192.0.2.1", "192.0.2.2", "192.0.2.1"] },
    ],
  }),
};

function providerFetch({ account = team, netlify = (body) => body, vercel = (body) => body } = {}) {
  return async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Accept, "application/json");
    if (url.origin === "https://api.netlify.com") {
      assert.equal(options.headers.Authorization, "Bearer netlify-token-fixture");
      assert.equal(url.pathname, `/api/v1/${account}/sites`);
      const component = components.find(
        (value) => projectName(value) === url.searchParams.get("name"),
      );
      assert.ok(component);
      assert.equal(url.searchParams.get("per_page"), "100");
      return Response.json(netlify([netlifySite(component, account)], component));
    }
    assert.equal(url.origin, "https://api.vercel.com");
    assert.equal(options.headers.Authorization, "Bearer vercel-token-fixture");
    assert.equal(url.searchParams.get("teamId"), vercelTeam);
    for (const component of components) {
      const endpoints = {
        project: `/v9/projects/${vercelId(component)}`,
        deployment: `/v13/deployments/${vercelHostname(component)}`,
        domain: `/v9/projects/${vercelId(component)}/domains/${PRODUCTION_HOSTS[component]}`,
        dns: `/v6/domains/${PRODUCTION_HOSTS[component]}/config`,
      };
      const contract = Object.keys(endpoints).find((key) => url.pathname === endpoints[key]);
      if (!contract) continue;
      if (contract === "dns")
        assert.equal(url.searchParams.get("projectIdOrName"), vercelId(component));
      return Response.json(vercel(vercelContent[contract](component), contract, component));
    }
    assert.fail("Unexpected provider endpoint");
  };
}

const target = (component, provider, records) => ({
  host: PRODUCTION_HOSTS[component],
  component,
  provider,
  records,
});

test("resolves the three owned Netlify projects to standard network DNS records", async () => {
  assert.ok(Object.isFrozen(PRODUCTION_HOSTS));
  assert.deepEqual(await resolveProductionTargets(config(), providerFetch()), [
    target("api", "netlify", [{ type: "CNAME", content: "bgo-api-production.netlify.app" }]),
    target("web", "netlify", [{ type: "CNAME", content: "bgo-web-production.netlify.app" }]),
    target("site", "netlify", [{ type: "CNAME", content: "apex-loadbalancer.netlify.com" }]),
  ]);
});

test("uses Vercel's current exact production deployments and project-specific DNS", async () => {
  assert.deepEqual(await resolveProductionTargets(config("vercel"), providerFetch()), [
    target("api", "vercel", [{ type: "CNAME", content: "api.example.com" }]),
    target("web", "vercel", [{ type: "CNAME", content: "web.example.com" }]),
    target("site", "vercel", [
      { type: "A", content: "192.0.2.1" },
      { type: "A", content: "192.0.2.2" },
    ]),
  ]);
});

test("supports a separate Site provider and the configured Netlify team", async () => {
  const account = "other-bgo-team";
  const env = { ...config("netlify", "vercel"), NETLIFY_TEAM_SLUG: account };
  const results = await resolveProductionTargets(env, providerFetch({ account }));
  assert.deepEqual(
    results.map(({ provider }) => provider),
    ["netlify", "netlify", "vercel"],
  );
});

test("rejects foreign, unpublished and unbound Netlify projects and deploys", async () => {
  for (const [patch, error] of [
    [{ account_slug: "other-team" }, /project ownership/],
    [{ id: "foreign-id" }, /project ownership/],
    [{ id: null }, /project ownership/],
    [{ custom_domain: "other.example.com" }, /required custom domain/],
    [{ published_deploy: null }, /is not published/],
    [
      { published_deploy: { ...netlifySite("api").published_deploy, id: deployId("web") } },
      /is not published/,
    ],
    [
      { published_deploy: { ...netlifySite("api").published_deploy, site_id: "other" } },
      /is not published/,
    ],
    [
      { published_deploy: { ...netlifySite("api").published_deploy, name: projectName("web") } },
      /is not published/,
    ],
    [
      { published_deploy: { ...netlifySite("api").published_deploy, context: "branch-deploy" } },
      /is not published/,
    ],
    [
      { published_deploy: { ...netlifySite("api").published_deploy, state: "building" } },
      /is not published/,
    ],
  ]) {
    const fetcher = providerFetch({
      netlify: (body, component) => (component === "api" ? [{ ...body[0], ...patch }] : body),
    });
    await assert.rejects(resolveProductionTargets(config(), fetcher), error);
  }
  const duplicate = providerFetch({ netlify: (body) => [...body, ...body] });
  await assert.rejects(resolveProductionTargets(config(), duplicate), /project ownership/);
});

test("rejects a different project, preview, stale deployment or unverified domain on Vercel", async () => {
  for (const [contract, patch, error] of [
    ["project", { id: vercelId("web") }, /not the ready production deployment/],
    ["project", { accountId: "team_other" }, /not the ready production deployment/],
    [
      "project",
      { targets: { production: { id: "dpl_old", url: vercelHostname("api") } } },
      /not the ready production deployment/,
    ],
    [
      "project",
      { targets: { production: { id: vercelDeploymentId("api"), url: vercelHostname("web") } } },
      /not the ready production deployment/,
    ],
    ["deployment", { ownerId: "team_other" }, /not the ready production deployment/],
    ["deployment", { projectId: vercelId("web") }, /not the ready production deployment/],
    ["deployment", { url: "an-alias.vercel.app" }, /not the ready production deployment/],
    ["deployment", { target: null }, /not the ready production deployment/],
    ["deployment", { readyState: "BUILDING" }, /not the ready production deployment/],
    ["deployment", { id: "not-a-deploy-id" }, /not the ready production deployment/],
    ["deployment", { id: null }, /not the ready production deployment/],
    ["domain", { name: PRODUCTION_HOSTS.web }, /verified production domain/],
    ["domain", { projectId: vercelId("web") }, /verified production domain/],
    ["domain", { verified: false }, /verified production domain/],
    ["domain", { gitBranch: "another-branch" }, /verified production domain/],
    ["domain", { customEnvironmentId: "env_preview" }, /verified production domain/],
    ["domain", { redirect: "another.example.com" }, /verified production domain/],
  ]) {
    const fetcher = providerFetch({
      vercel: (body, key, component) =>
        contract === key && component === "api" ? { ...body, ...patch } : body,
    });
    await assert.rejects(resolveProductionTargets(config("vercel"), fetcher), error);
  }
});

test("rejects missing and unsafe preferred DNS values even if a fallback exists", async () => {
  for (const [component, patch] of [
    ["site", { recommendedIPv4: [{ rank: 2, value: ["192.0.2.1"] }] }],
    ["site", { recommendedIPv4: [{ rank: 1, value: "192.0.2.1" }] }],
    ["site", { recommendedIPv4: [{ rank: 1, value: ["300.0.2.1"] }] }],
    ["site", { recommendedIPv4: [{ rank: 1, value: [] }] }],
    ["api", { recommendedCNAME: null }],
    ["api", { recommendedCNAME: [{ rank: 1, value: 1 }] }],
    ["api", { recommendedCNAME: [{ rank: 1, value: PRODUCTION_HOSTS.api }] }],
    ["api", { recommendedCNAME: [{ rank: 1, value: "not-preferred.example.com/path" }] }],
    ["api", { recommendedCNAME: [{ rank: 1, value: "192.0.2.1" }] }],
    [
      "api",
      {
        recommendedCNAME: [
          { rank: 1, value: "a.example.com" },
          { rank: 1, value: "b.example.com" },
        ],
      },
    ],
  ]) {
    const fetcher = providerFetch({
      vercel: (body, key, affected) =>
        key === "dns" && affected === component ? { ...body, ...patch } : body,
    });
    await assert.rejects(
      resolveProductionTargets(config("vercel"), fetcher),
      /valid preferred DNS targets/,
    );
  }
});

test("rejects unsafely selected URLs/profiles and hides provider errors", async () => {
  for (const [overrides, error] of [
    [{ PRODUCTION_API_URL: "http://example.com" }, /deployment URL is invalid/],
    [{ PRODUCTION_API_URL: "https://example.com?token=secret" }, /deployment URL is invalid/],
    [
      { PRODUCTION_API_URL: `https://${deployId("api")}--bgo-api-development.netlify.app` },
      /immutable deployment/,
    ],
    [{ PRODUCTION_API_URL: "https://bgo-api-production.netlify.app" }, /immutable deployment/],
    [{ NETLIFY_AUTH_TOKEN: "" }, /scoped token/],
    [{ NETLIFY_TEAM_SLUG: "../attacker" }, /scoped token/],
    [{ PRODUCTION_PROVIDER: "another" }, /provider is invalid/],
  ]) {
    await assert.rejects(
      resolveProductionTargets({ ...config(), ...overrides }, providerFetch()),
      error,
    );
  }
  for (const [overrides, error] of [
    [{ VERCEL_TOKEN: "" }, /scoped token/],
    [{ VERCEL_ORG_ID: "wrong-team" }, /scoped token/],
    [{ VERCEL_ORG_ID: undefined }, /scoped token/],
    [{ VERCEL_API_PROJECT_ID: "../private" }, /scoped token/],
    [{ VERCEL_API_PROJECT_ID: undefined }, /scoped token/],
    [{ PRODUCTION_API_URL: "https://example.com" }, /scoped token/],
  ]) {
    await assert.rejects(
      resolveProductionTargets({ ...config("vercel"), ...overrides }, providerFetch()),
      error,
    );
  }
  for (const fetcher of [
    async () => {
      throw new Error("sensitive response");
    },
    async () => new Response("sensitive response", { status: 500 }),
    async () => new Response("sensitive response"),
  ]) {
    await assert.rejects(resolveProductionTargets(config(), fetcher), {
      message: "Netlify api is unavailable.",
    });
  }
});
