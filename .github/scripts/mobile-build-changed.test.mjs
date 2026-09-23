import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import YAML from "yaml";
import { mobileBuildChanged, mobileBuildJob, mobileLockGraph, sourceAffectsMobile } from "./mobile-build-changed.mjs";

const repo = mkdtempSync(join(tmpdir(), "mobile-build-changed-"));
after(() => rmSync(repo, { recursive: true, force: true }));
function git(...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}
function put(path, contents) {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), contents);
}
function commit(message) {
  git("add", ".");
  git("commit", "-qm", message);
  return git("rev-parse", "HEAD");
}
git("init", "-q");
git("config", "user.email", "test@example.com");
git("config", "user.name", "Test");
const lock = {
  importers: {
    "apps/mobile": { dependencies: { expo: { version: "57.0.0" } } },
    "packages/shared": {},
    "apps/web": { dependencies: { next: { version: "16.0.0" } } },
  },
  packages: { "expo@57.0.0": {}, "metro@1.0.0": {}, "next@16.0.0": {} },
  snapshots: {
    "expo@57.0.0": { dependencies: { metro: "1.0.0" } },
    "metro@1.0.0": {},
    "next@16.0.0": {},
  },
};
put("pnpm-lock.yaml", YAML.stringify(lock));
put(".github/workflows/pr-ci.yml", "jobs:\n  build-mobile-internal:\n    api-url: preview\n  deploy-preview-api:\n    enabled: true\n");
put("apps/mobile/src/app/index.tsx", "initial");
const base = commit("baseline");

function changed(path, contents) {
  put(path, contents);
  const next = commit(path);
  assert.equal(mobileBuildChanged(base, next, repo), sourceAffectsMobile(path));
  git("reset", "--hard", base);
}

test("only mobile runtime and linked packages rebuild APK", () => {
  for (const path of [
    "apps/mobile/src/app/profile.tsx",
    "apps/mobile/assets/icon.png",
    "apps/mobile/app.config.js",
    "packages/shared/src/api.ts",
    "packages/query/src/provider.tsx",
    "packages/store/src/index.ts",
    "packages/schemas/src/dto/matches.ts",
    "messages/it.js",
    ".github/actions/mobile-build/action.yml",
  ]) {
    assert.equal(sourceAffectsMobile(path), true, path);
    changed(path, "changed");
  }
  for (const path of [
    "apps/web/src/app/page.tsx",
    "apps/api/src/app/api/matches/route.ts",
    "apps/mobile/.maestro/flows/test.yaml",
    "apps/mobile/src/lib/__tests__/prefs.test.ts",
    "packages/shared/src/__tests__/api.test.ts",
    "apps/mobile/README.md",
  ]) {
    assert.equal(sourceAffectsMobile(path), false, path);
    changed(path, "changed");
  }
});

test("moving source out of mobile still rebuilds APK", () => {
  mkdirSync(join(repo, "apps/web/src/app"), { recursive: true });
  git("mv", "apps/mobile/src/app/index.tsx", "apps/web/src/app/index.tsx");
  assert.equal(mobileBuildChanged(base, commit("move mobile source"), repo), true);
  git("reset", "--hard", base);
});

test("only mobile build job wiring changes trigger rebuild", () => {
  const initial = "jobs:\n  build-mobile-internal:\n    api-url: preview\n  other:\n    yes: true\n";
  assert.equal(mobileBuildJob(initial), mobileBuildJob(initial.replace("yes: true", "yes: false")));
  assert.notEqual(mobileBuildJob(initial), mobileBuildJob(initial.replace("api-url: preview", "api-url: production")));
  put(".github/workflows/pr-ci.yml", initial.replace("yes: true", "yes: false"));
  assert.equal(mobileBuildChanged(base, commit("unrelated CI"), repo), false);
  git("reset", "--hard", base);
  put(".github/workflows/pr-ci.yml", initial.replace("api-url: preview", "api-url: production"));
  assert.equal(mobileBuildChanged(base, commit("APK inputs"), repo), true);
  git("reset", "--hard", base);
});

test("lockfile compares mobile dependency closure, not web dependencies", () => {
  const webOnly = structuredClone(lock);
  webOnly.snapshots["next@16.0.0"] = { dependencies: { extra: "1.0.0" } };
  assert.equal(mobileLockGraph(YAML.stringify(lock)), mobileLockGraph(YAML.stringify(webOnly)));
  const reordered = structuredClone(lock);
  reordered.snapshots = Object.fromEntries(Object.entries(reordered.snapshots).reverse());
  assert.equal(mobileLockGraph(YAML.stringify(lock)), mobileLockGraph(YAML.stringify(reordered)));
  put("pnpm-lock.yaml", YAML.stringify(webOnly));
  assert.equal(mobileBuildChanged(base, commit("web lock change"), repo), false);
  git("reset", "--hard", base);

  const mobileTransitive = structuredClone(lock);
  mobileTransitive.snapshots["metro@1.0.0"] = { dependencies: { extra: "1.0.0" } };
  put("pnpm-lock.yaml", YAML.stringify(mobileTransitive));
  assert.equal(mobileBuildChanged(base, commit("mobile transitive"), repo), true);
  git("reset", "--hard", base);
});
