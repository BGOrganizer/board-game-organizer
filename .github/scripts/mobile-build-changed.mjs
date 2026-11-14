import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";

const mobilePackages = [
  "apps/mobile",
  "packages/query",
  "packages/schemas",
  "packages/shared",
  "packages/store",
];
const mobileSources = [
  "apps/mobile/",
  "packages/query/",
  "packages/schemas/",
  "packages/shared/",
  "packages/store/",
];

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout;
}

export function sourceAffectsMobile(path) {
  if (path.startsWith("apps/mobile/.maestro/") || path.includes("/__tests__/")) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)(README|vitest\.config)\b/i.test(path))
    return false;
  if (path.endsWith(".md") || path.endsWith(".env.example")) return false;
  return (
    mobileSources.some((prefix) => path.startsWith(prefix)) ||
    /^messages\/(en|it)\.(js|po)$/.test(path) ||
    path.startsWith(".github/actions/mobile-build/") ||
    path.startsWith(".github/actions/setup-bun/") ||
    path.startsWith("patches/") ||
    ["package.json", "bunfig.toml"].includes(path)
  );
}

export function mobileBuildJob(workflow) {
  return (
    workflow.match(
      /^ {2}build-mobile-internal:[^\n]*\n[\s\S]*?(?=^ {2}[\w-]+:|(?![\s\S]))/m,
    )?.[0] ?? ""
  );
}

export function mobileLockGraph(text) {
  const errors = [];
  const lock = parse(text, errors, { allowTrailingComma: true });
  if (errors.length || !lock?.workspaces || !lock.packages)
    throw new Error("Valid Bun dependency graph required");
  const graph = {
    overrides: lock.overrides,
    patchedDependencies: lock.patchedDependencies,
    workspaces: {},
    packages: {},
  };
  const queue = [];
  function dependencies(owner, metadata) {
    for (const group of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      for (const name of Object.keys(metadata[group] ?? {})) {
        let parent = owner;
        let key;
        while (parent) {
          if (lock.packages[`${parent}/${name}`]) {
            key = `${parent}/${name}`;
            break;
          }
          const segments = parent.split("/");
          segments.splice(segments.at(-2)?.startsWith("@") ? -2 : -1);
          parent = segments.join("/");
        }
        key ??= lock.packages[name] ? name : undefined;
        if (key) queue.push(key);
        else if (group === "dependencies" || group === "devDependencies")
          throw new Error("Incomplete Bun dependency graph");
      }
    }
  }
  for (const path of mobilePackages) {
    const workspace = lock.workspaces[path];
    if (!workspace) throw new Error("Missing mobile workspace in Bun lockfile");
    graph.workspaces[path] = workspace;
    dependencies(workspace.name, workspace);
  }
  for (const key of queue) {
    if (Object.hasOwn(graph.packages, key)) continue;
    const entry = lock.packages[key];
    if (!Array.isArray(entry) || typeof entry[0] !== "string")
      throw new Error("Invalid Bun package record");
    graph.packages[key] = entry;
    const workspacePath = entry[0].split("@workspace:")[1];
    if (workspacePath) {
      const workspace = lock.workspaces[workspacePath];
      if (!workspace) throw new Error("Missing linked Bun workspace");
      graph.workspaces[workspacePath] = workspace;
      dependencies(key, workspace);
    } else dependencies(key, entry[2] ?? {});
  }
  return JSON.stringify(graph, (_, value) =>
    value && !Array.isArray(value) && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

export function mobileBuildChanged(base, head, cwd = process.cwd()) {
  const files = git(cwd, "diff", "--no-renames", "--name-only", "-z", base, head)
    .split("\0")
    .filter(Boolean);
  if (files.some(sourceAffectsMobile)) return true;
  if (files.includes(".github/workflows/pr-ci.yml")) {
    if (
      mobileBuildJob(git(cwd, "show", `${base}:.github/workflows/pr-ci.yml`)) !==
      mobileBuildJob(git(cwd, "show", `${head}:.github/workflows/pr-ci.yml`))
    )
      return true;
  }
  if (files.includes("bun.lock")) {
    return (
      mobileLockGraph(git(cwd, "show", `${base}:bun.lock`)) !==
      mobileLockGraph(git(cwd, "show", `${head}:bun.lock`))
    );
  }
  return false;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(mobileBuildChanged(process.argv[2], process.argv[3]) ? "true" : "false");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
