import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const mobileAction = readFileSync(".github/actions/mobile-build/action.yml", "utf8").replace(
  /\r\n/g,
  "\n",
);
const deployAction = readFileSync(".github/actions/vercel-deploy/action.yml", "utf8").replace(
  /\r\n/g,
  "\n",
);

test("composite mobile action takes the public key as input, never unsupported vars context", () => {
  assert.match(mobileAction, /maptiler-api-key:\n\s+description:[^\n]+\n\s+required: true/);
  assert.doesNotMatch(mobileAction, /\$\{\{\s*vars\./);
  assert.equal(
    (
      mobileAction.match(/EXPO_PUBLIC_MAPTILER_API_KEY: \$\{\{ inputs\.maptiler-api-key \}\}/g) ??
      []
    ).length,
    2,
  );
});

test("every mobile-build caller explicitly supplies the repository MapTiler variable", () => {
  let callers = 0;
  for (const name of ["pr-ci.yml", "main-ci.yml", "mobile-development.yml", "mobile-e2e.yml"]) {
    const lines = readFileSync(`.github/workflows/${name}`, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes("uses: ./.github/actions/mobile-build")) continue;
      const indent = lines[i].search(/\S/);
      let end = i + 1;
      while (end < lines.length && (!lines[end].trim() || lines[end].search(/\S/) >= indent)) end++;
      assert.match(
        lines.slice(i + 1, end).join("\n"),
        /maptiler-api-key: \$\{\{ vars\.EXPO_PUBLIC_MAPTILER_API_KEY \}\}/,
        `${name}:${i + 1}`,
      );
      callers++;
    }
  }
  assert.ok(callers > 0);
});

test("web deployment validates the pulled public key before building and only on web", () => {
  const start = deployAction.indexOf("- name: 🗺️ Verify public MapTiler web build key");
  const build = deployAction.indexOf("- name: 🔨 Build");
  assert.ok(start >= 0 && start < build);
  const step = deployAction.slice(start, build);
  assert.match(step, /inputs\.app-path == 'apps\/web'/);
  assert.match(step, /VERCEL_ENVIRONMENT: \$\{\{ inputs\.vercel-environment \}\}/);
  const match = step.match(/node <<'NODE'\n([\s\S]*?)\n\s*NODE/);
  assert.ok(match);
  const script = match[1];
  const folder = mkdtempSync(join(tmpdir(), "bgo-maptiler-build-"));
  try {
    const run = () =>
      spawnSync(process.execPath, ["-e", script], {
        cwd: folder,
        env: { ...process.env, VERCEL_ENVIRONMENT: "preview" },
        encoding: "utf8",
      });
    assert.notEqual(run().status, 0);
    mkdirSync(join(folder, ".vercel"));
    const file = join(folder, ".vercel", ".env.preview.local");
    for (const value of ["", 'NEXT_PUBLIC_MAPTILER_API_KEY="   "\n']) {
      writeFileSync(file, value);
      const result = run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Set NEXT_PUBLIC_MAPTILER_API_KEY/);
    }
    writeFileSync(file, 'NEXT_PUBLIC_MAPTILER_API_KEY="test-public-key"\n');
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "", "Never print key values");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
