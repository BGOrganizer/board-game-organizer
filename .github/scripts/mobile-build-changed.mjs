import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const mobilePackages = ["apps/mobile", "packages/query", "packages/schemas", "packages/shared", "packages/store"];
const mobileSources = ["apps/mobile/", "packages/query/", "packages/schemas/", "packages/shared/", "packages/store/"];

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout;
}

export function sourceAffectsMobile(path) {
  if (path.startsWith("apps/mobile/.maestro/") || path.includes("/__tests__/")) return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(path) || /(^|\/)(README|vitest\.config)\b/i.test(path)) return false;
  if (path.endsWith(".md") || path.endsWith(".env.example")) return false;
  return (
    mobileSources.some((prefix) => path.startsWith(prefix)) ||
    /^messages\/(en|it)\.(js|po)$/.test(path) ||
    path.startsWith(".github/actions/mobile-build/") ||
    path.startsWith(".github/actions/setup-pnpm/") ||
    path === "pnpm-workspace.yaml"
  );
}

export function mobileBuildJob(workflow) {
  return workflow.match(/^  build-mobile-internal:[^\n]*\n[\s\S]*?(?=^  [\w-]+:|(?![\s\S]))/m)?.[0] ?? "";
}

export function mobileLockGraph(lock) {
  const { importers = {}, packages = {}, snapshots = {}, settings, patchedDependencies } = YAML.parse(lock);
  const graph = { settings, patchedDependencies, importers: {}, packages: {}, snapshots: {} };
  const queue = [];
  for (const path of mobilePackages) {
    graph.importers[path] = importers[path];
    for (const dependencies of Object.values(importers[path] ?? {})) {
      if (typeof dependencies !== "object" || !dependencies) continue;
      for (const [name, value] of Object.entries(dependencies)) {
        if (value?.version && !value.version.startsWith("link:")) queue.push(`${name}@${value.version}`);
      }
    }
  }
  for (const key of queue) {
    if (Object.hasOwn(graph.snapshots, key)) continue;
    const snapshot = snapshots[key];
    graph.snapshots[key] = snapshot;
    graph.packages[key] = packages[key];
    if (!snapshot) continue;
    for (const group of [snapshot.dependencies, snapshot.optionalDependencies]) {
      for (const [name, version] of Object.entries(group ?? {})) {
        if (!version.startsWith("link:")) queue.push(`${name}@${version}`);
      }
    }
  }
  return JSON.stringify(graph, (_, value) =>
    value && !Array.isArray(value) && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

export function mobileBuildChanged(base, head, cwd = process.cwd()) {
  const files = git(cwd, "diff", "--no-renames", "--name-only", "-z", base, head).split("\0").filter(Boolean);
  if (files.some(sourceAffectsMobile)) return true;
  if (files.includes(".github/workflows/pr-ci.yml")) {
    if (mobileBuildJob(git(cwd, "show", `${base}:.github/workflows/pr-ci.yml`)) !==
        mobileBuildJob(git(cwd, "show", `${head}:.github/workflows/pr-ci.yml`))) return true;
  }
  if (files.includes("pnpm-lock.yaml")) {
    return mobileLockGraph(git(cwd, "show", `${base}:pnpm-lock.yaml`)) !==
      mobileLockGraph(git(cwd, "show", `${head}:pnpm-lock.yaml`));
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
