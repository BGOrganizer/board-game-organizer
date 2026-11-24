import assert from "node:assert/strict";
import test from "node:test";
import { vercelDeployStatus } from "../vercel-deploy-preflight.mjs";

const env = { VERCEL_ORG_ID: "team_fixture", VERCEL_TOKEN: "token-fixture" };
const healthyTeam = { id: env.VERCEL_ORG_ID, blocked: null, softBlock: null };
const softBlock = {
  blockedAt: Date.now() - 60_000,
  reason: "FAIR_USE_LIMITS_EXCEEDED",
  unpauseAt: Date.now() + 60_000,
};

test("checks Vercel's configured team with a bounded, read-only request", async () => {
  const status = await vercelDeployStatus(env, async (url, options) => {
    assert.equal(url, "https://api.vercel.com/v2/teams/team_fixture");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.Authorization, "Bearer token-fixture");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(healthyTeam);
  });
  assert.equal(status, "available");
});

test("an active fair-use block overrides active billing", async () => {
  const team = { ...healthyTeam, softBlock, billing: { status: "active" } };
  assert.equal(await vercelDeployStatus(env, async () => Response.json(team)), "blocked");
});

test("an explicit team block is enough when soft-block metadata is absent", async () => {
  for (const blocked of [true, { ...softBlock, unpauseAt: null }]) {
    const team = { id: env.VERCEL_ORG_ID, blocked };
    assert.equal(await vercelDeployStatus(env, async () => Response.json(team)), "blocked");
  }
});

test("expired, malformed, missing, or unrelated team details are inconclusive", async () => {
  for (const team of [
    { ...healthyTeam, id: "team_other", softBlock },
    { ...healthyTeam, softBlock: { ...softBlock, unpauseAt: Date.now() - 1 } },
    { ...healthyTeam, softBlock: { ...softBlock, unpauseAt: "future" } },
    { ...healthyTeam, softBlock: { ...softBlock, blockedAt: -1 } },
    { ...healthyTeam, softBlock: { ...softBlock, blockedAt: Date.now() + 60_000 } },
    { ...healthyTeam, softBlock: { ...softBlock, reason: " " } },
    { id: env.VERCEL_ORG_ID, billing: { status: "active" }, limited: true },
    null,
  ]) {
    assert.equal(await vercelDeployStatus(env, async () => Response.json(team)), "unknown");
  }
});

test("missing configuration avoids requests and provider errors stay inconclusive", async () => {
  let requests = 0;
  for (const envOverride of [{ VERCEL_TOKEN: "" }, { VERCEL_ORG_ID: ".." }]) {
    const status = await vercelDeployStatus({ ...env, ...envOverride }, async () => {
      requests++;
      return Response.json(healthyTeam);
    });
    assert.equal(status, "unknown");
  }
  assert.equal(requests, 0);
  for (const status of [401, 403, 429, 503]) {
    assert.equal(
      await vercelDeployStatus(env, async () => Response.json({ softBlock }, { status })),
      "unknown",
    );
  }
  assert.equal(await vercelDeployStatus(env, async () => new Response("unexpected")), "unknown");
  assert.equal(
    await vercelDeployStatus(env, async () => {
      throw new DOMException("Deadline exceeded", "TimeoutError");
    }),
    "unknown",
  );
});
