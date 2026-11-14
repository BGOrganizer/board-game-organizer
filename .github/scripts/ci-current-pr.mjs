import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function requireCurrentPr(
  { repository, number, headSha, token, runId, attempt },
  request = fetch,
) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !/^[1-9][0-9]*$/.test(String(number)) ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(headSha) ||
    !token ||
    !/^[1-9][0-9]*$/.test(String(runId)) ||
    !/^[1-9][0-9]*$/.test(String(attempt))
  )
    throw new Error("Verified PR publication context required");
  async function get(path) {
    const response = await request(`https://api.github.com/repos/${repository}${path}`, {
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`PR publication check failed (${response.status})`);
    return response.json();
  }
  const pr = await get(`/pulls/${number}`);
  if (
    pr.state !== "open" ||
    pr.base?.ref !== "main" ||
    pr.head?.repo?.full_name !== repository ||
    pr.head?.sha !== headSha
  )
    throw new Error("PR closed, untrusted or superseded; refusing publication");
  const run = await get(`/actions/runs/${runId}`);
  if (
    run.id !== Number(runId) ||
    run.run_attempt !== Number(attempt) ||
    run.status !== "in_progress" ||
    run.event !== "pull_request" ||
    run.path !== ".github/workflows/pr-ci.yml" ||
    run.head_sha !== headSha ||
    run.head_branch !== pr.head.ref ||
    run.head_repository?.full_name !== repository ||
    !Number.isSafeInteger(run.run_number) ||
    !run.pull_requests?.some((row) => row.number === Number(number))
  )
    throw new Error("PR workflow run cancelled, untrusted or superseded; refusing publication");
  const query = new URLSearchParams({
    event: "pull_request",
    branch: pr.head.ref,
    head_sha: headSha,
    per_page: "100",
  });
  const recent = await get(`/actions/workflows/pr-ci.yml/runs?${query}`);
  if (
    !Array.isArray(recent.workflow_runs) ||
    !recent.workflow_runs.some((row) => row.id === run.id) ||
    recent.workflow_runs.some(
      (row) =>
        row.event === "pull_request" &&
        row.head_sha === headSha &&
        row.head_repository?.full_name === repository &&
        row.run_number > run.run_number &&
        row.pull_requests?.some((pr) => pr.number === Number(number)),
    )
  )
    throw new Error("Newer PR workflow run exists; refusing stale publication");
  return pr;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await requireCurrentPr({
    repository: process.env.GITHUB_REPOSITORY,
    number: process.env.PR_NUMBER,
    headSha: process.env.PR_HEAD_SHA,
    token: process.env.GH_TOKEN,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
  })
    .then(() => console.log("Current trusted PR head verified."))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
