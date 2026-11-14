import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  mobileBuildChanged,
  mobileBuildJob,
  mobileLockGraph,
  sourceAffectsMobile,
} from "../mobile-build-changed.mjs";

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
  workspaces: {
    "apps/mobile": { name: "mobile", dependencies: { expo: "57.0.0" } },
    "packages/shared": { name: "@board-game-organizer/shared" },
    "packages/query": { name: "@board-game-organizer/query" },
    "packages/schemas": { name: "@board-game-organizer/schemas" },
    "packages/store": { name: "@board-game-organizer/store" },
    "apps/web": { name: "web", dependencies: { next: "16.0.0" } },
  },
  packages: {
    expo: ["expo@57.0.0", "", { dependencies: { metro: "1.0.0" } }, "expo-integrity"],
    metro: ["metro@1.0.0", "", {}, "metro-integrity"],
    next: ["next@16.0.0", "", {}, "next-integrity"],
  },
};
put("bun.lock", JSON.stringify(lock));
put(
  ".github/workflows/pr-ci.yml",
  "jobs:\n  build-mobile-internal:\n    api-url: preview\n  deploy-preview-api:\n    enabled: true\n",
);
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
    "packages/shared/src/common/api.ts",
    "packages/query/src/provider.tsx",
    "packages/store/src/index.ts",
    "packages/schemas/src/matches/dto/matches.ts",
    "messages/it.js",
    ".github/actions/mobile-build/action.yml",
    "patches/heroui-native@1.0.9.patch",
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
  const initial =
    "jobs:\n  build-mobile-internal:\n    api-url: preview\n  other:\n    yes: true\n";
  assert.equal(mobileBuildJob(initial), mobileBuildJob(initial.replace("yes: true", "yes: false")));
  assert.notEqual(
    mobileBuildJob(initial),
    mobileBuildJob(initial.replace("api-url: preview", "api-url: production")),
  );
  put(".github/workflows/pr-ci.yml", initial.replace("yes: true", "yes: false"));
  assert.equal(mobileBuildChanged(base, commit("unrelated CI"), repo), false);
  git("reset", "--hard", base);
  put(".github/workflows/pr-ci.yml", initial.replace("api-url: preview", "api-url: production"));
  assert.equal(mobileBuildChanged(base, commit("APK inputs"), repo), true);
  git("reset", "--hard", base);
});

test("lockfile compares mobile dependency closure, not web dependencies", () => {
  const webOnly = structuredClone(lock);
  webOnly.packages.next[3] = "new-web-integrity";
  assert.equal(mobileLockGraph(JSON.stringify(lock)), mobileLockGraph(JSON.stringify(webOnly)));
  const reordered = structuredClone(lock);
  reordered.packages = Object.fromEntries(Object.entries(reordered.packages).reverse());
  assert.equal(mobileLockGraph(JSON.stringify(lock)), mobileLockGraph(JSON.stringify(reordered)));
  put("bun.lock", JSON.stringify(webOnly));
  assert.equal(mobileBuildChanged(base, commit("web lock change"), repo), false);
  git("reset", "--hard", base);

  const mobileTransitive = structuredClone(lock);
  mobileTransitive.packages.metro[3] = "new-mobile-integrity";
  put("bun.lock", JSON.stringify(mobileTransitive));
  assert.equal(mobileBuildChanged(base, commit("mobile transitive"), repo), true);
  git("reset", "--hard", base);
});

test("Bun graph includes nested resolutions, peers and linked workspaces; malformed graphs fail closed", () => {
  const nested = structuredClone(lock);
  nested.packages["expo/metro"] = [
    "metro@2.0.0",
    "",
    { peerDependencies: { react: "*" }, optionalDependencies: { absent: "*" } },
    "nested",
  ];
  nested.packages.react = ["react@19.2.3", "", {}, "react"];
  assert.notEqual(mobileLockGraph(JSON.stringify(nested)), mobileLockGraph(JSON.stringify(lock)));
  const peerChange = structuredClone(nested);
  peerChange.packages.react[3] = "new-peer";
  assert.notEqual(
    mobileLockGraph(JSON.stringify(nested)),
    mobileLockGraph(JSON.stringify(peerChange)),
  );
  assert.equal(
    mobileLockGraph(JSON.stringify(lock).replace("{", "{ // comment\n")),
    mobileLockGraph(JSON.stringify(lock)),
  );
  for (const text of ["{", "{}", JSON.stringify({ workspaces: {}, packages: {} })])
    assert.throws(() => mobileLockGraph(text));
  const missing = structuredClone(lock);
  delete missing.packages.metro;
  assert.throws(() => mobileLockGraph(JSON.stringify(missing)));
});

test("scoped parents never resolve unscoped dependencies through an unrelated scope namespace", () => {
  const scoped = structuredClone(lock);
  scoped.packages.expo[2].dependencies = { "@scope/pkg": "1.0.0" };
  scoped.packages["@scope/pkg"] = [
    "@scope/pkg@1.0.0",
    "",
    { dependencies: { dep: "1.0.0" } },
    "owner",
  ];
  scoped.packages["@scope/dep"] = ["@scope/dep@1.0.0", "", {}, "distractor"];
  scoped.packages.dep = ["dep@1.0.0", "", {}, "actual"];
  const changed = structuredClone(scoped);
  changed.packages.dep[3] = "actual-updated";
  assert.notEqual(
    mobileLockGraph(JSON.stringify(scoped)),
    mobileLockGraph(JSON.stringify(changed)),
  );
  const unrelated = structuredClone(scoped);
  unrelated.packages["@scope/dep"][3] = "unrelated";
  assert.equal(mobileLockGraph(JSON.stringify(scoped)), mobileLockGraph(JSON.stringify(unrelated)));
});
