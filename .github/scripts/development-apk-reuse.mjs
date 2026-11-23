import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mobileBuildChanged } from "./mobile-build-changed.mjs";
import { mobileBuildInputs } from "./mobile-build-inputs.mjs";

const sha = /^[a-f0-9]{40}$/;
const number = /^[1-9][0-9]*$/;

export async function findDevelopmentApk(
  { GITHUB_REPOSITORY: repository, GITHUB_HEAD_REF: branch, PR_NUMBER: pr, GH_TOKEN: token },
  request = fetch,
) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !branch || !number.test(pr) || !token)
    throw new Error("Verified PR identity required for Development APK reuse");
  async function get(path, params) {
    const url = new URL(`https://api.github.com/repos/${repository}/actions/${path}`);
    url.search = new URLSearchParams(params);
    const response = await request(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("Cannot read verified Development APK candidates");
    return response.json();
  }
  const { workflow_runs: runs } = await get("workflows/pr-ci.yml/runs", {
    event: "pull_request",
    branch,
    status: "completed",
    per_page: "10",
  });
  for (const run of runs) {
    if (
      run.status !== "completed" ||
      run.event !== "pull_request" ||
      run.path !== ".github/workflows/pr-ci.yml" ||
      run.head_branch !== branch ||
      run.head_repository?.full_name !== repository ||
      !run.pull_requests?.some((entry) => entry.number === Number(pr)) ||
      !sha.test(run.head_sha) ||
      !Number.isSafeInteger(run.id) ||
      run.id < 1 ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt < 1
    )
      continue;
    const { artifacts } = await get(`runs/${run.id}/artifacts`, { name: "apk-development" });
    const candidates = artifacts.filter(
      (artifact) =>
        artifact.name === "apk-development" &&
        artifact.expired === false &&
        artifact.workflow_run?.id === run.id &&
        artifact.workflow_run?.head_sha === run.head_sha,
    );
    if (candidates.length !== 1) continue;
    const { jobs } = await get(`runs/${run.id}/attempts/${run.run_attempt}/jobs`, {
      per_page: "100",
    });
    if (
      jobs.some(
        (job) =>
          job.name === "Build APK (Development)" &&
          job.conclusion === "success" &&
          job.steps?.some(
            (step) =>
              step.name === "🏗️ Build internal APK against development Preview" &&
              step.conclusion === "success",
          ),
      )
    )
      return { runId: run.id, headSha: run.head_sha };
  }
}

export function requireEquivalentDevelopmentApk(base, head, root = process.cwd(), producerHead) {
  if (!sha.test(base) || !sha.test(head) || (producerHead && !sha.test(producerHead)))
    throw new Error("Invalid Development APK source");
  function git(...args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
  }
  let parents;
  try {
    parents = git("show", "-s", "--format=%P", base);
  } catch {
    git("fetch", "--no-tags", "origin", base);
    parents = git("show", "-s", "--format=%P", base);
  }
  const mergeParents = parents.split(" ");
  if (mergeParents.length !== 2 || (producerHead && mergeParents[1] !== producerHead))
    throw new Error("Development APK source does not match its producer merge");
  if (mobileBuildChanged(base, head, root, "development"))
    throw new Error("Development APK build inputs changed");
}

export async function verifyDevelopmentApk(
  folder,
  env,
  root = process.cwd(),
  requireEquivalent = requireEquivalentDevelopmentApk,
) {
  const read = (name) => readFileSync(join(folder, name), "utf8").trim();
  const source = read("source-head.txt");
  const names = readdirSync(folder).filter((name) => name.endsWith(".apk"));
  const checksum = read("apk.sha256").match(/^([a-f0-9]{64}) [ *]([\w.-]+\.apk)$/);
  if (
    !sha.test(env.APK_PRODUCER_HEAD) ||
    !sha.test(env.GITHUB_SHA) ||
    !env.EXPO_PUBLIC_API_URL ||
    env.EXPO_UPDATE_CHANNEL !== "development" ||
    names.length !== 1 ||
    checksum?.[2] !== names[0] ||
    read("api-url.txt") !== env.EXPO_PUBLIC_API_URL ||
    read("update-channel.txt") !== env.EXPO_UPDATE_CHANNEL ||
    read("build-inputs.sha256") !== mobileBuildInputs(env)
  )
    throw new Error("Development APK configuration or manifest changed");
  requireEquivalent(source, env.GITHUB_SHA, root, env.APK_PRODUCER_HEAD);
  const path = join(folder, names[0]);
  if (statSync(path).size === 0) throw new Error("Development APK is empty");
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  if (digest.digest("hex") !== checksum[1]) throw new Error("Development APK checksum mismatch");
  return source;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { GITHUB_OUTPUT: outputPath } = process.env;
  const output = (data) => appendFileSync(outputPath, data);
  try {
    if (process.argv[2] === "find") {
      const apk = await findDevelopmentApk(process.env);
      if (apk) output(`run-id=${apk.runId}\nproducer-head=${apk.headSha}\n`);
    } else if (process.argv[2] === "verify") {
      const source = await verifyDevelopmentApk(process.argv[3], process.env);
      output(`source-sha=${source}\n`);
      console.log("Reusing a verified Development APK with matching mobile inputs.");
    }
  } catch {
    console.log("No eligible Development APK; a fresh build is required.");
  }
}
