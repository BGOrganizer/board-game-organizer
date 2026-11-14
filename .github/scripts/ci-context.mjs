import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const shaPattern = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i;
const repositoryPattern = /^[\w.-]+\/[\w.-]+$/;

/** Pushes with an open PR route to the PR event: no duplicate checks or builds. */
export async function resolveCiContext(input, openPulls) {
  const { eventName, event, repository, refName, sha } = input;
  if (!repositoryPattern.test(repository) || !shaPattern.test(sha))
    throw new Error("Invalid CI repository or source revision");
  if (eventName === "pull_request") {
    const pr = event.pull_request;
    if (
      !pr ||
      pr.base?.ref !== "main" ||
      !Number.isSafeInteger(pr.number) ||
      pr.number < 1 ||
      !shaPattern.test(pr.head?.sha) ||
      !shaPattern.test(pr.base?.sha)
    )
      throw new Error("Invalid main-targeting PR context");
    return {
      mode: "pr",
      trusted: String(pr.head.repo.full_name === repository),
      number: String(pr.number),
      title: pr.title,
      "head-sha": pr.head.sha,
      "base-sha": pr.base.sha,
      "checkout-sha": sha,
      branch: pr.head.ref,
    };
  }
  if (eventName !== "push") throw new Error("Unsupported CI event");
  if (event.deleted || refName === "main" || !event.ref?.startsWith("refs/heads/"))
    return { mode: "routed", trusted: "false" };
  const pulls = await openPulls(repository, refName);
  if (!Array.isArray(pulls)) throw new Error("Invalid PR lookup response");
  const matching = pulls.filter(
    (pr) =>
      pr.state === "open" &&
      pr.base?.ref === "main" &&
      pr.head?.ref === refName &&
      pr.head.repo?.full_name === repository,
  );
  if (matching.length > 1) throw new Error("Ambiguous PR branch");
  if (matching.length) return { mode: "routed", trusted: "true" };
  return {
    mode: "branch",
    trusted: "true",
    "checkout-sha": sha,
    "head-sha": sha,
    "base-sha":
      shaPattern.test(event.before ?? "") && !/^0+$/.test(event.before) ? event.before : "",
    branch: refName,
  };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const result = await resolveCiContext(
    {
      eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
      repository,
      refName: process.env.GITHUB_REF_NAME,
      sha: process.env.GITHUB_SHA,
    },
    async (repo, branch) => {
      if (!process.env.GH_TOKEN) throw new Error("CI PR lookup token required");
      const owner = repo.split("/")[0];
      const query = new URLSearchParams({
        state: "open",
        base: "main",
        head: `${owner}:${branch}`,
        per_page: "100",
      });
      const response = await fetch(`https://api.github.com/repos/${repo}/pulls?${query}`, {
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!response.ok) throw new Error(`CI PR lookup failed (${response.status})`);
      return response.json();
    },
  );
  for (const [key, value] of Object.entries(result)) {
    const delimiter = `ci_${randomUUID()}`;
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${key}<<${delimiter}\n${String(value)}\n${delimiter}\n`,
    );
  }
  console.log(`CI routing: ${result.mode}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
