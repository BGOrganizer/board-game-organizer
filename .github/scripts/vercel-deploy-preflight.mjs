import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function blockStatus(block, now) {
  if (block === null || block === false) return "available";
  if (block === true) return "blocked";
  if (
    !Number.isSafeInteger(block?.blockedAt) ||
    block.blockedAt <= 0 ||
    block.blockedAt > now ||
    typeof block.reason !== "string" ||
    !block.reason.trim() ||
    (block.unpauseAt != null && (!Number.isSafeInteger(block.unpauseAt) || block.unpauseAt <= now))
  )
    return "unknown";
  return "blocked";
}

export async function vercelDeployStatus(env, fetchTeam = fetch) {
  const { VERCEL_ORG_ID: teamId, VERCEL_TOKEN: token } = env;
  if (!token || !/^team_[a-zA-Z0-9]+$/.test(teamId ?? "")) return "unknown";
  try {
    const response = await fetchTeam(`https://api.vercel.com/v2/teams/${teamId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return "unknown";
    const team = await response.json();
    if (team?.id !== teamId) return "unknown";

    // Vercel reports fair-use limits in softBlock even when billing is active.
    const now = Date.now();
    const hard = blockStatus(team.blocked, now);
    const soft = blockStatus(team.softBlock, now);
    if (hard === "blocked" || soft === "blocked") return "blocked";
    if (hard === "available" && soft === "available") return "available";
  } catch {
    // Do not surface the remote response or request details.
  }
  return "unknown";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const status = await vercelDeployStatus(process.env);
  const { GITHUB_OUTPUT: output } = process.env;
  if (output) appendFileSync(output, `status=${status}\n`);
  console.log(`Vercel team preflight: ${status}.`);
}
