import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const shared = new Set([
  "Route branch / PR",
  "Check commits",
  "Lint and CI contracts",
  "Typecheck",
  "Integration tests (API)",
  "Build API",
  "Build Web",
  "🔀 Resolve CI context",
  "💬 commitlint (Conventional Commits)",
  "🧹 Biome lint & format",
  "🧪 TypeScript typecheck",
  "🐳 API integration tests (testcontainers)",
  "🏗️ Build API",
  "🏗️ Build Web",
]);
export function sharedQualityFailed(jobs) {
  return jobs.some(
    (job) =>
      ["failure", "timed_out", "startup_failure"].includes(job.conclusion) &&
      (shared.has(job.name) ||
        /^(?:🧪 )?Unit tests \((mobile|web|api|schemas|shared)\)( \+ coverage)?$/.test(job.name)),
  );
}
async function main() {
  const repository = process.env.GITHUB_REPOSITORY,
    id = process.env.RUN_ID;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[1-9][0-9]*$/.test(id) || !process.env.GH_TOKEN)
    throw new Error("Trusted CI watchdog context required");
  async function api(path, method = "GET") {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/runs/${id}${path}`,
      {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (!response.ok) throw new Error(`CI watchdog request failed (${response.status})`);
    return response.status === 204 || response.status === 202 ? null : response.json();
  }
  while (true) {
    if ((await api("")).status === "completed") return;
    if (sharedQualityFailed((await api("/jobs?per_page=100")).jobs)) {
      console.log("Cancelling CI after a shared quality failure; lane failures remain isolated.");
      try {
        await api("/cancel", "POST");
      } catch (error) {
        if ((await api("")).status !== "completed") throw error;
      }
      return;
    }
    await setTimeout(15_000);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
