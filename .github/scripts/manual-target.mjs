const productionApi = "https://api.board-game-organizer.com";

/** Manual operations accept an immutable owned Preview or the fixed Production API only. */
export function manualApiTarget(target, value) {
  if (!["preview", "production"].includes(target))
    throw new Error("Explicit Preview/Production target required");
  let url;
  try {
    url = new URL(value || (target === "production" ? productionApi : ""));
  } catch {
    throw new Error("Valid API URL required");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (target === "production"
      ? url.origin !== productionApi
      : !/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(url.hostname))
  )
    throw new Error("API URL does not match the selected environment");
  return url.origin;
}

export function requireClerkTarget(target, value, kind) {
  if (
    !["preview", "production"].includes(target) ||
    !["pk", "sk"].includes(kind) ||
    typeof value !== "string" ||
    !value.startsWith(`${kind}_${target === "production" ? "live" : "test"}_`) ||
    value.length <= `${kind}_${target === "production" ? "live" : "test"}_`.length
  )
    throw new Error("Matching Clerk configuration required; no cross-environment fallback");
  return value;
}

/** Never send an application secret to an arbitrary caller-supplied Vercel deployment. */
export async function verifyPreviewProject(apiUrl, { token, team, project }, request = fetch) {
  const host = new URL(manualApiTarget("preview", apiUrl)).hostname;
  if (!token || !team || !project)
    throw new Error("Vercel project ownership configuration required");
  const response = await request(
    `https://api.vercel.com/v13/deployments/${host}?teamId=${encodeURIComponent(team)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(`Preview ownership check failed (${response.status})`);
  const deployment = await response.json();
  if (
    deployment.url !== host ||
    deployment.projectId !== project ||
    deployment.target === "production" ||
    deployment.readyState !== "READY"
  )
    throw new Error("Ready Preview must belong to the configured API project");
}

export async function attestManualApi(target, apiUrl, secret, bypass, request = fetch) {
  const origin = manualApiTarget(target, apiUrl);
  requireClerkTarget(target, secret, "sk");
  const url = new URL("/api/admin/sync-user", origin);
  if (target === "preview") {
    if (!bypass) throw new Error("Preview protection bypass required");
    url.searchParams.set("x-vercel-protection-bypass", bypass);
  }
  const response = await request(url.href, {
    headers: { Authorization: `Bearer ${secret}` },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`API environment attestation failed (${response.status})`);
  const data = await response.json();
  if (
    typeof data.databaseName !== "string" ||
    !data.databaseName ||
    data.databaseName.startsWith("bgo_ci_") ||
    data.webhookDbReady !== true ||
    data.webhookDatabaseName !== data.databaseName
  )
    throw new Error("Attested non-CI database and matching Clerk webhook database required");
}
