import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { withProtectionBypass } from "../../packages/shared/src/common/api.ts";
import { netlifyPreviewAttempt } from "./netlify-preview-target.mjs";

const OUTPUT_NAMES = ["api-url", "api-client-url", "web-url", "web-client-url"];

function isOwnedUrl(value, provider, target, app, client) {
  const url = typeof value === "string" && URL.parse(value);
  if (!url || value !== url.origin || url.protocol !== "https:") return false;
  if (provider === "vercel") return /^[a-z0-9-]+\.vercel\.app$/.test(url.host);

  const stage = target === "production" ? "production" : "development";
  const site = `bgo-${app}-${stage}.netlify.app`;
  if (url.host === site) return client && target === "production";
  if (!url.host.endsWith(`--${site}`)) return false;
  const label = url.host.slice(0, -site.length - 2);
  return /^[a-f0-9]{24}$/.test(label);
}

export function deploymentCandidates(env) {
  const target = env.TARGET;
  if (!["ci", "development", "production"].includes(target))
    throw new Error("Invalid deployment target");
  return ["vercel", "netlify"].flatMap((provider) => {
    const prefix = provider.toUpperCase();
    const api = env[`${prefix}_API_URL`];
    const web = env[`${prefix}_WEB_URL`];
    const apiClient = env[`${prefix}_API_CLIENT_URL`] || api;
    const webClient = env[`${prefix}_WEB_CLIENT_URL`] || web;
    if (
      !isOwnedUrl(api, provider, target, "api", false) ||
      !isOwnedUrl(web, provider, target, "web", false)
    )
      return [];

    if (provider === "netlify" && target !== "production") {
      const preview = {
        lane: target === "ci" ? "ci-pr" : "pr",
        number: env.PR_NUMBER,
        runId: env.GITHUB_RUN_ID,
        attempt: env.GITHUB_RUN_ATTEMPT,
      };
      const apiAttempt = netlifyPreviewAttempt(apiClient, { ...preview, app: "api" });
      const webAttempt = netlifyPreviewAttempt(webClient, { ...preview, app: "web" });
      if (!apiAttempt || apiAttempt !== webAttempt) return [];
    } else if (
      !isOwnedUrl(apiClient, provider, target, "api", true) ||
      !isOwnedUrl(webClient, provider, target, "web", true)
    ) {
      return [];
    }

    return [
      {
        provider,
        api,
        apiClient,
        web,
        webClient,
        bypass: provider === "vercel" ? env.VERCEL_PROTECTION_BYPASS : undefined,
      },
    ];
  });
}

async function smokeDeployment({ api, web, bypass }) {
  function endpoint(origin, path) {
    const url = `${origin}${path}`;
    return fetch(bypass ? withProtectionBypass(url, bypass) : url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [health, page] = await Promise.all([endpoint(api, "/api/health"), endpoint(web, "/")]);
      if (health.ok) {
        const result = await health.json();
        await page.body?.cancel();
        if (result.ok === true && result.service === "board-game-organizer-api" && page.ok)
          return true;
      } else {
        await Promise.all([health.body?.cancel(), page.body?.cancel()]);
      }
    } catch {
      // Keep connection errors and bypass URLs out of job logs.
    }
    if (attempt < 2) await setTimeout(2000);
  }
  return false;
}

export async function selectDeployment(candidates, smoke = smokeDeployment) {
  for (const candidate of candidates) {
    if (await smoke(candidate)) return candidate;
  }
  throw new Error("No verified Vercel or Netlify API/Web pair passed the smoke test.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const { provider, api, apiClient, web, webClient } = await selectDeployment(
      deploymentCandidates(process.env),
      (candidate) =>
        candidate.provider === "vercel" && process.env.VERCEL_VERIFIED === "true"
          ? true
          : smokeDeployment(candidate),
    );
    const values = [api, apiClient, web, webClient];
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `provider=${provider}\n` +
        OUTPUT_NAMES.map((name, index) => `${name}=${values[index]}\n`).join(""),
    );
    console.log(`Selected and verified ${provider === "vercel" ? "Vercel" : "Netlify"}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
