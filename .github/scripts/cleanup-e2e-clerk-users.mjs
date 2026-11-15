import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ownerPattern = /^e2e_(?:target_)?([1-9][0-9]*)_([1-9][0-9]*)_[a-f0-9]{6}$/;

/** Explicit IDs/run cleanup never falls through to the scheduled orphan sweep. */
export async function cleanupE2eUsers(env, ids = [], request = fetch, pause = setTimeout) {
  const key = env.CLERK_SECRET_KEY;
  if (!key?.startsWith("sk_test_") || key.length <= 8)
    throw new Error("E2E cleanup requires a development Clerk secret key");
  if (ids.some((id) => !/^user_[a-zA-Z0-9]+$/.test(id)))
    throw new Error("Invalid explicit E2E user ID");
  const runKey = env.E2E_RUN_KEY;
  if (runKey && !/^[1-9][0-9]*_[1-9][0-9]*$/.test(runKey))
    throw new Error("Invalid E2E run identity");
  const orphanSweep = !runKey && ids.length === 0;
  const maxAge = Number(env.E2E_USER_MAX_AGE_SECONDS ?? 86400);
  if (!Number.isSafeInteger(maxAge) || maxAge < 1) throw new Error("Invalid E2E retention age");
  if (orphanSweep && (!env.GH_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY)))
    throw new Error("Orphan cleanup requires GitHub run verification");
  const cutoff = Date.now() - maxAge * 1000;
  async function call(url, token, method = "GET") {
    return request(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  }
  let deleted = 0;
  let failures = 0;
  const seen = new Set();
  async function remove(id) {
    if (seen.has(id)) return;
    seen.add(id);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await call(`https://api.clerk.com/v1/users/${id}`, key, "DELETE");
        if ([200, 202, 204, 404].includes(response.status)) {
          deleted++;
          return;
        }
      } catch {
        // Retry without logging request URLs, headers or provider response bodies.
      }
      if (attempt < 3) await pause(attempt * 1000);
    }
    failures++;
  }
  for (const id of ids) await remove(id);
  if (!orphanSweep && !runKey) return { deleted, failures };
  const completedRuns = new Map();
  async function completedOwner(runId, attempt) {
    if (!completedRuns.has(runId)) {
      const response = await call(
        `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`,
        env.GH_TOKEN,
      );
      // A missing/forbidden/failed lookup is not evidence that the owner is inactive.
      if (!response.ok) throw new Error(`E2E owner verification failed (${response.status})`);
      const run = await response.json();
      completedRuns.set(
        runId,
        String(run.id) === runId &&
          run.status === "completed" &&
          run.event === "pull_request" &&
          run.path === ".github/workflows/pr-ci.yml" &&
          run.head_repository?.full_name === env.GITHUB_REPOSITORY &&
          Number.isSafeInteger(run.run_attempt)
          ? run.run_attempt
          : 0,
      );
    }
    return completedRuns.get(runId) >= Number(attempt);
  }
  // Snapshot candidates before deletion so offset pagination cannot skip shifted rows.
  const candidates = [];
  for (let offset = 0; ; offset += 100) {
    if (offset >= 10_000) throw new Error("E2E cleanup pagination limit reached");
    const response = await call(`https://api.clerk.com/v1/users?limit=100&offset=${offset}`, key);
    if (!response.ok) throw new Error(`E2E user listing failed (${response.status})`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid E2E user listing");
    for (const row of rows) {
      if (row.public_metadata?.e2e !== true || !/^user_[a-zA-Z0-9]+$/.test(row.id)) continue;
      const owner = ownerPattern.exec(row.username ?? "");
      if (!owner) continue;
      const [, runId, attempt] = owner;
      if (runKey) {
        if (`${runId}_${attempt}` === runKey) candidates.push(row.id);
      } else {
        const created =
          typeof row.created_at === "number" ? row.created_at : Date.parse(row.created_at);
        if (created > 0 && created < cutoff && (await completedOwner(runId, attempt)))
          candidates.push(row.id);
      }
    }
    if (rows.length < 100) break;
  }
  for (const id of candidates) await remove(id);
  return { deleted, failures };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await cleanupE2eUsers(process.env, process.argv.slice(2).filter(Boolean));
    console.log(`E2E cleanup: ${result.deleted} deleted, ${result.failures} failed.`);
    if (result.failures) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
