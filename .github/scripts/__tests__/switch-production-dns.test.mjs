import assert from "node:assert/strict";
import test from "node:test";
import { PRODUCTION_HOSTS } from "../production-dns-targets.mjs";
import { switchProductionDns } from "../switch-production-dns.mjs";

const environment = { CLOUDFLARE_API_TOKEN: "fixture-token", CLOUDFLARE_ZONE_ID: "1".repeat(32) };
const destinations = {
  api: "bgo-api-production.netlify.app",
  web: "bgo-web-production.netlify.app",
  site: "apex-loadbalancer.netlify.com",
};
const targets = Object.entries(PRODUCTION_HOSTS).map(([component, host]) => ({
  component,
  host,
  provider: "netlify",
  records: [{ type: "CNAME", content: destinations[component] }],
}));
const record = (id, name, content, type = "CNAME", ttl = 300) => ({
  id: String(id).padStart(32, "0"),
  name,
  type,
  content,
  ttl,
  proxied: false,
});
const api = record(1, PRODUCTION_HOSTS.api, "api.vercel-dns.example.");
const web = record(2, PRODUCTION_HOSTS.web, "web.vercel-dns.example.", "CNAME", 600);
const apex = record(3, PRODUCTION_HOSTS.site, "192.0.2.9", "A");
const clerk = record(4, "clerk.board-game-organizer.com", "frontend-api.clerk.services");
const txt = record(5, PRODUCTION_HOSTS.site, "ownership-verification", "TXT");

function fixture({
  probeFailure,
  wrongZone,
  lostWriteReply,
  drift,
  stale,
  initial = [api, web, apex, clerk, txt],
} = {}) {
  const records = structuredClone(initial);
  const batches = [];
  const messages = [];
  const probes = [];
  let reads = 0;
  let sourceChecks = 0;
  let nextId = 6;
  async function fetcher(url, request) {
    const path = url.replace(
      `https://api.cloudflare.com/client/v4/zones/${environment.CLOUDFLARE_ZONE_ID}`,
      "",
    );
    assert.equal(request.headers.Authorization, "Bearer fixture-token");
    assert.equal(request.redirect, "error");
    if (request.method === "GET") {
      if (path === "")
        return Response.json({
          success: true,
          result: { name: wrongZone || PRODUCTION_HOSTS.site },
        });
      assert.equal(path, "/dns_records?per_page=100&page=1");
      if (++reads === 2 && drift) records[0].content = "concurrent.example.com";
      return Response.json({
        success: true,
        result: records,
        result_info: { total_pages: 1 },
      });
    }
    assert.equal(request.method, "POST");
    assert.equal(path, "/dns_records/batch");
    const batch = JSON.parse(request.body);
    batches.push(batch);
    for (const { id } of batch.deletes)
      records.splice(
        records.findIndex((current) => current.id === id),
        1,
      );
    for (const patch of batch.patches)
      Object.assign(
        records.find((current) => current.id === patch.id),
        patch,
      );
    for (const created of batch.posts)
      records.push({ ...created, id: String(nextId++).padStart(32, "0") });
    if (lostWriteReply) throw new Error("simulated connection loss after applying batch");
    return Response.json({ success: true, result: {} });
  }
  return {
    records,
    batches,
    probes,
    messages,
    checks: () => sourceChecks,
    options: {
      fetcher,
      resolveTargets: async () => targets,
      async probe(details) {
        probes.push(details);
        if (probeFailure) return probeFailure(details);
        if (details.path === "/api/health")
          return { ok: true, service: "board-game-organizer-api" };
        if (details.path.includes("/.well-known/"))
          return { resource: `https://${PRODUCTION_HOSTS.api}/mcp` };
      },
      checkSource() {
        sourceChecks++;
        if (stale) throw new Error("verified Main source changed");
      },
      report: (line) => messages.push(line),
    },
  };
}

test("switches exactly API, Web and apex together and retains unrelated records", async () => {
  const { options, batches, probes, records, checks, messages } = fixture();
  assert.equal(await switchProductionDns(environment, options), "changed");
  assert.equal(checks(), 1);
  assert.deepEqual(
    probes.map(({ host, destination, path }) => [host, destination, path]),
    [
      [PRODUCTION_HOSTS.api, destinations.api, "/api/health"],
      [PRODUCTION_HOSTS.api, destinations.api, "/.well-known/oauth-protected-resource/mcp"],
      [PRODUCTION_HOSTS.web, destinations.web, "/"],
      [PRODUCTION_HOSTS.site, destinations.site, "/"],
    ],
  );
  assert.deepEqual(batches, [
    {
      deletes: [{ id: apex.id }],
      patches: [
        { ...api, content: destinations.api },
        { ...web, content: destinations.web },
      ],
      posts: [
        {
          name: PRODUCTION_HOSTS.site,
          type: "CNAME",
          content: destinations.site,
          ttl: 300,
          proxied: false,
        },
      ],
    },
  ]);
  assert.deepEqual(
    records.find(({ id }) => id === clerk.id),
    clerk,
  );
  assert.deepEqual(
    records.find(({ id }) => id === txt.id),
    txt,
  );
  assert.equal(records.find(({ id }) => id === web.id).ttl, 600);
  assert.doesNotMatch(messages.join("\n"), /fixture-token/);
  assert.match(messages.join("\n"), /TTL 600/);

  assert.equal(await switchProductionDns(environment, options), "unchanged");
  assert.equal(batches.length, 1);
  assert.equal(checks(), 1);
});

test("switches back to Vercel using all apex addresses and keeps existing record metadata", async () => {
  const netlifyApex = {
    ...apex,
    type: "CNAME",
    content: destinations.site,
    ttl: 1,
    proxied: true,
    comment: "Public site",
    tags: ["team:bgo"],
  };
  const { options, records, batches, probes, messages } = fixture({
    initial: [
      { ...api, content: destinations.api },
      { ...web, content: destinations.web },
      netlifyApex,
      clerk,
      txt,
    ],
  });
  const addresses = ["192.0.2.10", "192.0.2.11"];
  const vercel = [
    {
      ...targets[0],
      provider: "vercel",
      records: [{ type: "CNAME", content: "api.vercel-dns.example" }],
    },
    {
      ...targets[1],
      provider: "vercel",
      records: [{ type: "CNAME", content: "web.vercel-dns.example" }],
    },
    {
      ...targets[2],
      provider: "vercel",
      records: addresses.map((content) => ({ type: "A", content })),
    },
  ];
  assert.equal(
    await switchProductionDns(environment, { ...options, resolveTargets: async () => vercel }),
    "changed",
  );
  assert.deepEqual(
    probes
      .filter(({ host }) => host === PRODUCTION_HOSTS.site)
      .map(({ destination }) => destination),
    addresses,
  );
  assert.deepEqual(batches[0].deletes, [{ id: netlifyApex.id }]);
  assert.doesNotMatch(messages.join("\n"), /apex-loadbalancer/);
  assert.match(messages.join("\n"), /proxied origin/);
  assert.deepEqual(
    records.filter(({ name, type }) => name === PRODUCTION_HOSTS.site && type === "A"),
    addresses.map((content, index) => ({
      ...netlifyApex,
      id: String(6 + index).padStart(32, "0"),
      content,
      type: "A",
    })),
  );
});

test("reconciles an interrupted batch acknowledgment without issuing a second write", async () => {
  const { options, batches } = fixture({ lostWriteReply: true });
  assert.equal(await switchProductionDns(environment, options), "changed");
  assert.equal(await switchProductionDns(environment, options), "unchanged");
  assert.equal(batches.length, 1);
});

test("leaves Cloudflare untouched on failed HTTPS or a mismatched MCP audience", async () => {
  for (const probeFailure of [
    () => {
      throw new Error("certificate mismatch");
    },
    ({ path }) =>
      path === "/api/health"
        ? { ok: true, service: "board-game-organizer-api" }
        : { resource: "https://bgo-mcp-production.netlify.app/mcp" },
  ]) {
    const { options, batches, checks } = fixture({ probeFailure });
    await assert.rejects(
      switchProductionDns(environment, options),
      /certificate|canonical Production MCP/,
    );
    assert.equal(batches.length, 0);
    assert.equal(checks(), 0);
  }
});

test("refuses a wrong zone, routing drift, stale source and unintended routing targets", async () => {
  for (const [failure, message] of [
    [{ wrongZone: "another-zone.example" }, /Board Game Organizer zone/],
    [{ drift: true }, /Cloudflare routing changed/],
    [{ stale: true }, /verified Main source changed/],
  ]) {
    const { options, batches } = fixture(failure);
    await assert.rejects(switchProductionDns(environment, options), message);
    assert.equal(batches.length, 0);
  }
  const { options, batches } = fixture();
  await assert.rejects(
    switchProductionDns(environment, {
      ...options,
      resolveTargets: async () => [...targets.slice(0, 2), { ...targets[2], host: clerk.name }],
    }),
    /Invalid verified DNS targets/,
  );
  assert.equal(batches.length, 0);
});

test("the Cloudflare switch may be inactive but rejects partial credentials", async () => {
  const fetcher = async () => assert.fail("missing credentials must never reach Cloudflare");
  const report = () => {};
  assert.equal(await switchProductionDns({}, { fetcher, report }), "inactive");
  await assert.rejects(
    switchProductionDns({ CLOUDFLARE_API_TOKEN: "fixture-token" }, { fetcher, report }),
    /token and a valid zone ID/,
  );
});
