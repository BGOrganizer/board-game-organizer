import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const components = ["api", "web", "site", "mcp"];
const netlifyDefaultTeam = "board-game-organizer";
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const vercelProtection = { deploymentType: "all_except_custom_domains" };

function providerRequest(origin, token, fetcher) {
  return async (path, label, { method = "GET", body, allowed = [] } = {}) => {
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetcher(new URL(path, origin), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error(`${label} request failed.`);
    }
    if (!response.ok && !allowed.includes(response.status))
      throw new Error(`${label} returned HTTP ${response.status}.`);
    return response;
  };
}

async function readJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

async function scaffoldNetlify(env, fetcher, report) {
  const team = env.NETLIFY_TEAM_SLUG || netlifyDefaultTeam;
  if (!env.NETLIFY_AUTH_TOKEN || !slug.test(team))
    throw new Error("Configured Netlify team slug and Infisical-synced token required.");
  const request = providerRequest("https://api.netlify.com", env.NETLIFY_AUTH_TOKEN, fetcher);
  const teamSites = `/api/v1/${team}/sites`;
  const findProject = async (name) => {
    const response = await request(
      `${teamSites}?name=${name}&per_page=100`,
      "Netlify project lookup",
    );
    const records = await readJson(response, "Netlify project lookup");
    if (!Array.isArray(records)) throw new Error("Invalid Netlify project list.");
    const projects = records.filter((record) => record?.name === name);
    if (
      projects.length > 1 ||
      projects.some((record) => record.account_slug !== team || !/^[a-f0-9-]{36}$/.test(record.id))
    )
      throw new Error(`Netlify project ownership could not be confirmed for ${name}.`);
    return projects[0];
  };

  for (const component of components) {
    const name = `bgo-${component}-${env.BGO_HOSTING_ENVIRONMENT}`;
    if (await findProject(name)) {
      report(`- Netlify ${name}: existing project verified.`);
      continue;
    }
    const creation = await request(`${teamSites}?configure_dns=false`, "Netlify project creation", {
      method: "POST",
      body: { name },
      allowed: [400, 409, 422],
    });
    if (!(await findProject(name)))
      throw new Error(
        `Netlify could not create ${name} in the selected team. Check global name availability.`,
      );
    report(
      `- Netlify ${name}: ${creation.ok ? "created" : "already created in the selected team"}.`,
    );
  }
  report(
    "Set Public visitor access for the required deploy contexts and bind API/Web Infisical syncs.",
  );
}

async function scaffoldVercel(env, fetcher, report) {
  const { VERCEL_ORG_ID: team, VERCEL_TOKEN: token, VERCEL_PROTECTION_BYPASS: bypass } = env;
  if (!token || !/^team_[a-zA-Z0-9]+$/.test(team ?? ""))
    throw new Error("Configured Vercel team ID and Infisical-synced token required.");
  const request = providerRequest("https://api.vercel.com", token, fetcher);
  const teamResponse = await request(`/v2/teams/${team}`, "Vercel team lookup");
  const account = await readJson(teamResponse, "Vercel team lookup");
  if (account?.id !== team) throw new Error("Vercel team ownership could not be confirmed.");
  const query = `?teamId=${team}`;
  const ownedProject = (project, name) => {
    if (
      project.name !== name ||
      project.accountId !== team ||
      !/^prj_[a-zA-Z0-9]+$/.test(project.id)
    )
      throw new Error(`Vercel project ownership could not be confirmed for ${name}.`);
    return project;
  };
  const findProject = async (name) => {
    const response = await request(`/v9/projects/${name}${query}`, "Vercel project lookup", {
      allowed: [404],
    });
    return response.status === 404
      ? null
      : ownedProject(await readJson(response, "Vercel project lookup"), name);
  };

  for (const component of components) {
    const name = component === "mcp" ? `bgo-mcp-${env.BGO_HOSTING_ENVIRONMENT}` : component;
    const project = await findProject(name);
    const needsBypass = component === "api" || component === "site";
    if (project) {
      report(`- Vercel ${name}: existing project verified. See project settings for its ID.`);
      continue;
    }
    if (needsBypass && !bypass?.trim())
      throw new Error(
        "Sync VERCEL_PROTECTION_BYPASS from Infisical before creating Vercel API or Site.",
      );
    const creation = await request(`/v11/projects${query}`, "Vercel project creation", {
      method: "POST",
      body: {
        name,
        framework: component === "api" || component === "web" ? "nextjs" : null,
        ...(component === "web" ? {} : { ssoProtection: vercelProtection }),
      },
      allowed: [409],
    });
    if (creation.status === 409) {
      if (!(await findProject(name)))
        throw new Error(`Vercel project name unavailable for ${name}.`);
      report(`- Vercel ${name}: already created in the selected team. Check its project settings.`);
      continue;
    }
    const created = ownedProject(await readJson(creation, "Vercel project creation"), name);
    report(`- Vercel ${name}: created. See project settings for its ID.`);
    await request(`/v9/projects/${created.id}${query}`, "Vercel project settings", {
      method: "PATCH",
      body: {
        nodeVersion: "26.x",
        sourceFilesOutsideRootDirectory: true,
        ssoProtection: component === "web" ? null : vercelProtection,
      },
    });
    if (needsBypass) {
      await request(
        `/v1/projects/${created.id}/protection-bypass${query}`,
        "Vercel CI bypass setup",
        {
          method: "PATCH",
          body: { generate: { secret: bypass, note: "BGO CI" } },
        },
      );
    }
    const verified = await findProject(name);
    if (
      verified?.id !== created.id ||
      verified.nodeVersion !== "26.x" ||
      verified.sourceFilesOutsideRootDirectory !== true ||
      (needsBypass && !Object.hasOwn(verified.protectionBypass ?? {}, bypass)) ||
      (component === "web"
        ? verified.ssoProtection != null
        : verified.ssoProtection?.deploymentType !== vercelProtection.deploymentType)
    )
      throw new Error(`Vercel project settings did not match the scaffold for ${name}.`);
  }
  report(
    "Bind the Infisical syncs to the selected projects and update the project references used by CI.",
  );
}

export async function scaffoldHostingProjects(env, fetcher = fetch, report = console.log) {
  const provider = env.BGO_HOSTING_PROVIDER;
  if (!["development", "production"].includes(env.BGO_HOSTING_ENVIRONMENT))
    throw new Error("A supported GitHub environment is required.");
  if (provider === "netlify") await scaffoldNetlify(env, fetcher, report);
  else if (provider === "vercel") await scaffoldVercel(env, fetcher, report);
  else throw new Error("Select Vercel or Netlify.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await scaffoldHostingProjects(process.env, fetch, (line) => {
      console.log(line);
      const { GITHUB_STEP_SUMMARY: summary } = process.env;
      if (summary) appendFileSync(summary, `${line}\n`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
