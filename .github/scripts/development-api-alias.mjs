import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withProtectionBypass } from "../../packages/shared/src/common/api.ts";
import { requireCurrentPr } from "./ci-current-pr.mjs";

export function developmentApiUrl(number) {
  if (!/^[1-9][0-9]*$/.test(String(number))) throw new Error("Verified PR number required");
  return `https://api-development-pr-${number}-board-game-organizers-projects.vercel.app`;
}

function previewUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Owned immutable Preview URL required");
  return url.origin;
}

function vercel(args) {
  const result = spawnSync("vercel", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error("Development alias provider command failed");
  return result.stdout;
}

export async function activateDevelopmentApi(
  options,
  {
    command = vercel,
    request = fetch,
    current = () => requireCurrentPr(options.pr),
    pause = () => new Promise((done) => setTimeout(done, 3000)),
  } = {},
) {
  const api = previewUrl(options.apiUrl);
  const web = previewUrl(options.webUrl);
  const alias = developmentApiUrl(options.pr.number);
  if (
    !options.token ||
    !options.apiProjectId ||
    !options.webProjectId ||
    !options.branch ||
    !/^[a-f0-9]{40}$/.test(options.sourceSha) ||
    !options.clerkKey?.startsWith("sk_test_") ||
    !options.bypass
  )
    throw new Error("Verified Development publication inputs required");
  const provider = (args) => command([...args, "--token", options.token]);
  async function deployment(url, projectId) {
    const inspected = JSON.parse(await provider(["inspect", url, "--json"]));
    if (!/^dpl_[a-zA-Z0-9]+$/.test(inspected.id) || inspected.readyState !== "READY")
      throw new Error("Ready Development deployment required");
    const info = JSON.parse(await provider(["api", `/v13/deployments/${inspected.id}`, "--raw"]));
    if (
      info.id !== inspected.id ||
      (info.projectId ?? info.project?.id) !== projectId ||
      info.meta?.githubCommitRef !== options.branch ||
      info.meta?.githubCommitSha !== options.sourceSha
    )
      throw new Error("Development deployment project/source mismatch");
    return inspected.id;
  }
  const deploymentId = await deployment(api, options.apiProjectId);
  await deployment(web, options.webProjectId);
  async function get(url, headers) {
    const response = await request(withProtectionBypass(url, options.bypass), {
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers,
    });
    if (!response.ok) throw new Error("Development smoke/attestation failed");
    return response;
  }
  async function attest(url) {
    const body = await (
      await get(`${url}/api/admin/sync-user`, { Authorization: `Bearer ${options.clerkKey}` })
    ).json();
    if (
      body.webhookDbReady !== true ||
      typeof body.databaseName !== "string" ||
      !body.databaseName ||
      body.databaseName.startsWith("bgo_ci_") ||
      body.webhookDatabaseName !== body.databaseName
    )
      throw new Error("Development alias requires its non-CI webhook database");
  }
  await get(`${api}/api/health`);
  await get(`${web}/`);
  await attest(api);
  await current();
  await provider(["alias", "set", api, new URL(alias).hostname]);
  for (let attempt = 0; attempt < 20; attempt++) {
    let target;
    try {
      target = JSON.parse(await provider(["inspect", alias, "--json"]));
    } catch {
      target = {};
    }
    if (target.id === deploymentId && target.readyState === "READY") {
      await attest(alias);
      return alias;
    }
    await pause();
  }
  throw new Error("Development alias did not resolve to its verified deployment");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  try {
    if (process.argv[2] === "--url") {
      appendFileSync(env.GITHUB_OUTPUT, `url=${developmentApiUrl(env.PR_NUMBER)}\n`);
    } else {
      await activateDevelopmentApi({
        apiUrl: env.DEVELOPMENT_API_URL,
        webUrl: env.DEVELOPMENT_WEB_URL,
        apiProjectId: env.VERCEL_API_PROJECT_ID,
        webProjectId: env.VERCEL_WEB_PROJECT_ID,
        token: env.VERCEL_TOKEN,
        bypass: env.VERCEL_PROTECTION_BYPASS,
        clerkKey: env.CLERK_SECRET_KEY,
        sourceSha: env.OTA_SOURCE_SHA,
        branch: env.GITHUB_HEAD_REF,
        pr: {
          repository: env.GITHUB_REPOSITORY,
          number: env.PR_NUMBER,
          headSha: env.PR_HEAD_SHA,
          token: env.GH_TOKEN,
          runId: env.GITHUB_RUN_ID,
          attempt: env.GITHUB_RUN_ATTEMPT,
        },
      });
      console.log("Development API alias activated after smoke and source checks.");
    }
  } catch {
    console.error("Development API publication failed; no cross-environment fallback permitted.");
    process.exitCode = 1;
  }
}
