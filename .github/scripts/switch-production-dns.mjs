import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { isIP } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { PRODUCTION_HOSTS, resolveProductionTargets } from "./production-dns-targets.mjs";

const routingTypes = new Set(["A", "AAAA", "CNAME"]);
const recordId = /^[a-f0-9]{32}$/i;
const hostname = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function normalizeRecord({ type, content }) {
  return `${type} ${content.toLowerCase().replace(/\.$/, "")}`;
}

function validateTargets(targets) {
  const expected = Object.entries(PRODUCTION_HOSTS);
  if (!Array.isArray(targets) || targets.length !== expected.length)
    throw new Error("The three Production routing targets are required.");
  for (const [index, target] of targets.entries()) {
    const [component, host] = expected[index];
    const { records } = target;
    if (
      target.component !== component ||
      target.host !== host ||
      !["vercel", "netlify"].includes(target.provider) ||
      !Array.isArray(records) ||
      records.length === 0 ||
      records.some(
        ({ type, content }) =>
          typeof content !== "string" ||
          (type === "A" ? isIP(content) !== 4 : type !== "CNAME" || !hostname.test(content)),
      ) ||
      (records.some(({ type }) => type === "CNAME") && records.length !== 1) ||
      new Set(records.map(normalizeRecord)).size !== records.length
    )
      throw new Error(`Invalid verified DNS targets for ${host}.`);
  }
}

function createCloudflareClient(zoneId, token, fetcher) {
  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}`;
  return async (path, label, body) => {
    let response;
    let payload;
    try {
      response = await fetcher(`${base}${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      payload = await response.json();
    } catch {
      throw new Error(`Cloudflare ${label} could not be verified.`);
    }
    if (!response.ok || payload?.success !== true)
      throw new Error(`Cloudflare ${label} failed (HTTP ${response.status}).`);
    return payload;
  };
}

async function readRoutingRecords(cloudflare) {
  const hosts = Object.values(PRODUCTION_HOSTS);
  const records = [];
  for (let page = 1; page <= 20; page++) {
    const result = await cloudflare(`/dns_records?per_page=100&page=${page}`, "DNS record read");
    if (!Array.isArray(result.result)) throw new Error("Invalid Cloudflare DNS record list.");
    records.push(
      ...result.result.filter(({ name, type }) => hosts.includes(name) && routingTypes.has(type)),
    );
    if (result.result.length < 100 || page >= result.result_info?.total_pages) {
      if (
        new Set(records.map(({ id }) => id)).size !== records.length ||
        records.some(
          ({ id, ttl, proxied, content }) =>
            !recordId.test(id) ||
            !Number.isInteger(ttl) ||
            typeof proxied !== "boolean" ||
            typeof content !== "string" ||
            !content,
        )
      )
        throw new Error("The existing Cloudflare routing records could not be verified.");
      return records.sort((left, right) => left.id.localeCompare(right.id));
    }
  }
  throw new Error("Cloudflare DNS pagination exceeded the bounded zone lookup.");
}

function routingPlan(records, targets) {
  const batch = { deletes: [], patches: [], posts: [] };
  for (const { host, records: desired } of targets) {
    const remaining = records.filter(({ name }) => name === host);
    const previous = remaining[0];
    if (!previous) throw new Error(`No existing Cloudflare routing record was found for ${host}.`);
    const missing = desired.filter((target) => {
      const index = remaining.findIndex(
        (record) => normalizeRecord(record) === normalizeRecord(target),
      );
      if (index === -1) return true;
      remaining.splice(index, 1);
      return false;
    });
    for (const target of missing) {
      const sameType = remaining.findIndex(({ type }) => type === target.type);
      if (sameType >= 0) {
        const [record] = remaining.splice(sameType, 1);
        batch.patches.push({
          id: record.id,
          name: record.name,
          ttl: record.ttl,
          proxied: record.proxied,
          ...target,
        });
      } else {
        if (
          remaining.some(({ ttl, proxied }) => ttl !== previous.ttl || proxied !== previous.proxied)
        )
          throw new Error(`Conflicting Cloudflare TTL or proxy settings for ${host}.`);
        const { ttl, proxied, comment, tags, settings } = previous;
        batch.posts.push({
          name: host,
          ...target,
          ttl,
          proxied,
          ...(comment ? { comment } : {}),
          ...(tags?.length ? { tags } : {}),
          ...(settings
            ? {
                settings: {
                  ipv4_only: settings.ipv4_only,
                  ipv6_only: settings.ipv6_only,
                  ...(target.type === "CNAME" && previous.type === "CNAME"
                    ? { flatten_cname: settings.flatten_cname }
                    : {}),
                },
              }
            : {}),
        });
      }
    }
    batch.deletes.push(...remaining.map(({ id }) => ({ id })));
  }
  return batch;
}

function hasChanges(batch) {
  return batch.deletes.length > 0 || batch.patches.length > 0 || batch.posts.length > 0;
}

function probeOrigin({ host, destination, path, json }) {
  const response = spawnSync(
    "curl",
    [
      "--disable",
      "--noproxy",
      "*",
      "--proto",
      "=https",
      "--silent",
      "--show-error",
      "--max-time",
      "12",
      "--connect-to",
      `${host}:443:${destination}:443`,
      "--output",
      json ? "-" : "/dev/null",
      "--write-out",
      "\n%{http_code}",
      `https://${host}${path}`,
    ],
    { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024 },
  );
  const match = response.stdout?.match(/^([\s\S]*)\n(2\d\d)$/);
  if (response.status === 0 && match) {
    if (!json) return;
    try {
      return JSON.parse(match[1]);
    } catch {
      // Provider error pages do not pass JSON health verification.
    }
  }
  throw new Error(`${host}${path} could not be verified on the selected origin with valid HTTPS.`);
}

async function verifyCanonicalOrigins(targets, probe) {
  for (const { component, host, records } of targets) {
    for (const { content: destination } of records) {
      if (component !== "api") {
        await probe({ host, destination, path: "/", json: false });
        continue;
      }
      const health = await probe({ host, destination, path: "/api/health", json: true });
      if (!health?.ok || health.service !== "board-game-organizer-api")
        throw new Error("The canonical API health check failed at the selected origin.");
      const discovery = await probe({
        host,
        destination,
        path: "/.well-known/oauth-protected-resource/mcp",
        json: true,
      });
      if (discovery?.resource !== `https://${host}/mcp`)
        throw new Error(
          "The selected API does not advertise the canonical Production MCP resource.",
        );
    }
  }
}

function requireCurrentMain(env) {
  const { status } = spawnSync(
    process.execPath,
    [".github/scripts/check-site-main.mjs", env.GITHUB_REF, env.GITHUB_SHA],
    { stdio: "ignore", timeout: 60_000 },
  );
  if (status !== 0) throw new Error("The verified Main source changed before the DNS switch.");
}

export async function switchProductionDns(
  env,
  {
    fetcher = fetch,
    resolveTargets = resolveProductionTargets,
    probe = probeOrigin,
    checkSource = requireCurrentMain,
    report = console.log,
  } = {},
) {
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ZONE_ID: zoneId } = env;
  if (!token && !zoneId) {
    report("Cloudflare DNS switch is inactive until Production credentials are configured.");
    return "inactive";
  }
  if (!token || !recordId.test(zoneId ?? ""))
    throw new Error("Both the Production Cloudflare token and a valid zone ID are required.");

  const cloudflare = createCloudflareClient(zoneId, token, fetcher);
  const zone = await cloudflare("", "zone read");
  if (zone.result?.name !== PRODUCTION_HOSTS.site)
    throw new Error("Cloudflare credentials must target the Board Game Organizer zone.");

  const targets = await resolveTargets(env, fetcher);
  validateTargets(targets);
  const previous = await readRoutingRecords(cloudflare);
  const batch = routingPlan(previous, targets);
  await verifyCanonicalOrigins(targets, probe);
  if (!hasChanges(batch)) {
    report("Production routing already matches the verified deployments.");
    return "unchanged";
  }

  const snapshot = await readRoutingRecords(cloudflare);
  if (!isDeepStrictEqual(previous, snapshot))
    throw new Error(
      "Cloudflare routing changed during verification. Retry with the current records.",
    );
  await checkSource(env);
  for (const { host, provider, records } of targets) {
    const before = previous
      .filter(({ name }) => name === host)
      .map(
        ({ type, content, ttl, proxied }) =>
          `${type} ${proxied ? "(proxied origin)" : content} (TTL ${ttl})`,
      );
    const next = records.map(({ type, content }) => `${type} ${content}`);
    report(`- \`${host}\` (${provider}): ${before.join(", ")} → ${next.join(", ")}`);
  }

  let writeError;
  try {
    await cloudflare("/dns_records/batch", "DNS switch", batch);
  } catch (error) {
    writeError = error;
  }
  const updated = await readRoutingRecords(cloudflare);
  if (hasChanges(routingPlan(updated, targets)))
    throw writeError ?? new Error("Cloudflare routing differs from the requested DNS targets.");
  report(
    "Cloudflare recorded the Production switch. Resolver caches may still use the previous targets.",
  );
  return "changed";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { GITHUB_STEP_SUMMARY: summary } = process.env;
    await switchProductionDns(process.env, {
      report(line) {
        console.log(line);
        if (summary) appendFileSync(summary, `${line}\n`);
      },
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
