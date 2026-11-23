import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const manifests = [
  "apps/api/package.json",
  "apps/mobile/package.json",
  "apps/web/package.json",
  "apps/mcp/package.json",
];
const config = "apps/mobile/app.config.js";
const files = [...manifests, config, "CHANGELOG.md"].sort();

/** Resume only the exact version-only child of this run's already validated merge. */
export function inspectMainRelease(
  { sourceSha, cwd = process.cwd(), requireTag = true },
  execute = execFileSync,
) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? "")) throw new Error("Validated Main source required");
  const git = (...args) => execute("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  git("fetch", "--no-tags", "origin", "main");
  const sha = git("rev-parse", "origin/main");
  if (sha === sourceSha) {
    if (git("rev-parse", "HEAD") !== sourceSha) throw new Error("Wrong Main checkout");
    return { mode: "prepare", published: false, sha, version: "" };
  }
  const parents = git("rev-list", "--parents", "-n", "1", sha).split(" ");
  const subject = git("log", "-1", "--format=%s", sha);
  if (parents.length !== 2 || parents[1] !== sourceSha || !subject.startsWith("chore(release):"))
    return { mode: "superseded", published: false, sha: "", version: "" };
  const version = subject.match(/^chore\(release\): (\d+\.\d+\.\d+) \[skip ci\]$/)?.[1];
  if (!stable.test(version ?? "")) throw new Error("Invalid prepared release subject");
  const read = (at, path) => git("show", `${at}:${path}`);
  const changed = git("diff", "--name-only", sourceSha, sha).split("\n").sort();
  if (!isDeepStrictEqual(changed, files))
    throw new Error("Prepared release changes unrelated files");
  let previous;
  for (const path of manifests) {
    const before = JSON.parse(read(sourceSha, path)),
      after = JSON.parse(read(sha, path));
    if (previous && before.version !== previous) throw new Error("Inconsistent source versions");
    previous = before.version;
    if (after.version !== version || !isDeepStrictEqual({ ...before, version }, after))
      throw new Error("Prepared release changes a manifest beyond its version");
  }
  if (!stable.test(previous)) throw new Error("Invalid source version");
  const before = previous.split(".").map(BigInt),
    after = version.split(".").map(BigInt);
  const first = after.findIndex((part, index) => part !== before[index]);
  if (first < 0 || after[first] < before[first]) throw new Error("Prepared version must increase");
  const oldConfig = read(sourceSha, config),
    newConfig = read(sha, config);
  if (
    !oldConfig.includes(`version: "${previous}"`) ||
    newConfig !== oldConfig.replace(`version: "${previous}"`, `version: "${version}"`)
  )
    throw new Error("Prepared release changes native configuration beyond its version");
  const notes = git("log", "-1", "--format=%b", sha);
  if (!notes || read(sha, "CHANGELOG.md") !== `${notes}\n\n${read(sourceSha, "CHANGELOG.md")}`)
    throw new Error("Prepared changelog does not match its release notes");
  if (requireTag) {
    const tag = `refs/tags/v${version}`;
    const refs = git("ls-remote", "--tags", "origin", tag, `${tag}^{}`)
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(/\s+/));
    const target =
      refs.find(([, name]) => name === `${tag}^{}`)?.[0] ??
      refs.find(([, name]) => name === tag)?.[0];
    if (target !== sha)
      throw new Error("Prepared release tag is missing or targets another commit");
  }
  return { mode: "resume", published: requireTag, sha, version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectMainRelease({ sourceSha: process.env.GITHUB_SHA });
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(result)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(""),
      );
    console.log(
      `Main release preparation: ${result.mode}${result.version ? ` v${result.version}` : ""}`,
    );
  } catch {
    console.error(
      "Main release preparation refused: source, version-only bump and tag must match.",
    );
    process.exitCode = 1;
  }
}
