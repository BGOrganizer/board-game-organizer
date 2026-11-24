import { isIPv4 } from "node:net";

export const PRODUCTION_HOSTS = Object.freeze({
  api: "api.board-game-organizer.com",
  web: "app.board-game-organizer.com",
  site: "board-game-organizer.com",
});

const label = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const siteId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function providerReader(origin, token, fetcher) {
  return async (path, query, description) => {
    const url = new URL(path, origin);
    url.search = new URLSearchParams(query);
    try {
      const result = await fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
      if (result.ok) return await result.json();
    } catch {
      // Provider errors may include sensitive values or request metadata.
    }
    throw new Error(`${description} is unavailable.`);
  };
}

async function netlifyRecords(env, component, host, selectedHost, fetcher) {
  const name = `bgo-${component}-production`;
  const team = env.NETLIFY_TEAM_SLUG || "board-game-organizer";
  const deploymentId = new RegExp(`^([a-f0-9]{24})--${name}\\.netlify\\.app$`).exec(
    selectedHost,
  )?.[1];
  if (!deploymentId || !env.NETLIFY_AUTH_TOKEN || !label.test(team) || team !== team.trim())
    throw new Error(`Netlify ${component} requires its scoped token and immutable deployment.`);

  const get = providerReader("https://api.netlify.com", env.NETLIFY_AUTH_TOKEN, fetcher);
  const sites = await get(`/api/v1/${team}/sites`, { name, per_page: 100 }, `Netlify ${component}`);
  const matches = Array.isArray(sites) && sites.filter((site) => site?.name === name);
  const site = matches?.length === 1 ? matches[0] : null;
  if (site?.account_slug !== team || !siteId.test(site.id ?? ""))
    throw new Error(`Netlify ${component} project ownership could not be verified.`);

  const deploy = site.published_deploy;
  if (
    deploy?.id !== deploymentId ||
    deploy.site_id !== site.id ||
    deploy.name !== name ||
    deploy.context !== "production" ||
    deploy.state !== "ready"
  )
    throw new Error(`Netlify ${component} selected deployment is not published.`);
  if (
    site.custom_domain !== host &&
    (!Array.isArray(site.domain_aliases) || !site.domain_aliases.includes(host))
  )
    throw new Error(`Netlify ${component} does not have the required custom domain ${host}.`);

  // External DNS for Netlify's standard network uses CNAME flattening at the apex.
  const content = component === "site" ? "apex-loadbalancer.netlify.com" : `${name}.netlify.app`;
  return [{ type: "CNAME", content }];
}

function vercelRecommendations(configuration, component) {
  const apex = component === "site";
  const candidates = apex ? configuration?.recommendedIPv4 : configuration?.recommendedCNAME;
  const preferred = (Array.isArray(candidates) ? candidates : [])
    .filter((record) => record?.rank === 1)
    .map((record) => record.value);
  if (
    apex &&
    preferred.length &&
    preferred.every((value) => Array.isArray(value) && value.length)
  ) {
    const addresses = [...new Set(preferred.flat())];
    if (addresses.every((address) => typeof address === "string" && isIPv4(address)))
      return addresses.map((content) => ({ type: "A", content }));
  }
  if (!apex && preferred.length === 1 && typeof preferred[0] === "string") {
    const content = preferred[0].toLowerCase().replace(/\.$/, "");
    if (
      content.length <= 253 &&
      content.includes(".") &&
      !/[^a-z0-9.-]/.test(content) &&
      content.split(".").every((part) => part.length <= 63 && label.test(part)) &&
      !Object.values(PRODUCTION_HOSTS).includes(content) &&
      !isIPv4(content)
    )
      return [{ type: "CNAME", content }];
  }
  throw new Error(`Vercel ${component} did not supply valid preferred DNS targets.`);
}

async function vercelRecords(env, component, host, selectedHost, fetcher) {
  const { VERCEL_ORG_ID: teamId, VERCEL_TOKEN: token } = env;
  const projectId = env[`VERCEL_${component.toUpperCase()}_PROJECT_ID`];
  if (
    !token ||
    teamId !== teamId?.trim() ||
    projectId !== projectId?.trim() ||
    !/^team_[a-zA-Z0-9]+$/.test(teamId ?? "") ||
    !/^prj_[a-zA-Z0-9]+$/.test(projectId ?? "") ||
    !selectedHost.endsWith(".vercel.app") ||
    !label.test(selectedHost.slice(0, -".vercel.app".length))
  )
    throw new Error(`Vercel ${component} requires its scoped token, project ID and deployment.`);

  const get = providerReader("https://api.vercel.com", token, fetcher);
  const query = { teamId };
  const path = `/v9/projects/${projectId}`;
  const name = `Vercel ${component}`;
  const [project, deployment, domain, config] = await Promise.all([
    get(path, query, `${name} project`),
    get(`/v13/deployments/${selectedHost}`, query, `${name} deployment`),
    get(`${path}/domains/${host}`, query, `${name} domain`),
    get(`/v6/domains/${host}/config`, { ...query, projectIdOrName: projectId }, `${name} DNS`),
  ]);
  const published = project?.targets?.production;
  if (
    project?.id !== projectId ||
    project.accountId !== teamId ||
    deployment?.ownerId !== teamId ||
    deployment.projectId !== projectId ||
    deployment.url !== selectedHost ||
    deployment.target !== "production" ||
    deployment.readyState !== "READY" ||
    !/^dpl_[a-zA-Z0-9]+$/.test(deployment.id ?? "") ||
    published?.id !== deployment.id ||
    published.url !== selectedHost
  )
    throw new Error(`${name} selected deployment is not the ready production deployment.`);
  if (
    domain?.name !== host ||
    domain.projectId !== projectId ||
    domain.verified !== true ||
    domain.gitBranch != null ||
    domain.customEnvironmentId != null ||
    domain.redirect != null
  )
    throw new Error(`${name} does not have the verified production domain ${host}.`);
  // The destination's DNS may still be pointed at the previous provider.
  return vercelRecommendations(config, component);
}

export function resolveProductionTargets(env, fetcher = fetch) {
  return Promise.all(
    Object.entries(PRODUCTION_HOSTS).map(async ([component, host]) => {
      const provider =
        component === "site" ? env.PRODUCTION_SITE_PROVIDER : env.PRODUCTION_PROVIDER;
      const selected = env[`PRODUCTION_${component.toUpperCase()}_URL`];
      const url = typeof selected === "string" && URL.parse(selected);
      if (!url || url.origin !== selected || url.protocol !== "https:")
        throw new Error(`The selected Production ${component} deployment URL is invalid.`);
      if (provider !== "vercel" && provider !== "netlify")
        throw new Error(`The selected Production ${component} provider is invalid.`);
      const resolveRecords = provider === "vercel" ? vercelRecords : netlifyRecords;
      const records = await resolveRecords(env, component, host, url.hostname, fetcher);
      return { host, component, provider, records };
    }),
  );
}
