import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("web validates real public keys inside the remote build, not a Secret-masked pull", () => {
  assert.doesNotMatch(deployAction, /vercel pull|vercel build|--prebuilt/);
  const url = new URL("../../apps/web/next.config.ts", import.meta.url).href;
  const run = (overrides = {}) =>
    spawnSync(process.execPath, ["-e", `import(${JSON.stringify(url)})`], {
      encoding: "utf8",
      env: {
        ...process.env,
        VERCEL: "1",
        NEXT_PUBLIC_MAPTILER_API_KEY: "public-map-key",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_test",
        ...overrides,
      },
    });
  for (const value of ["", "   ", "[SENSITIVE]"]) {
    const result = run({ NEXT_PUBLIC_MAPTILER_API_KEY: value });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Set NEXT_PUBLIC_MAPTILER_API_KEY/);
  }
  for (const value of ["", "[SENSITIVE]", "invalid"]) {
    const result = run({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: value });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/);
  }
  for (const clerk of ["pk_test_test", "pk_live_test"]) {
    const result = run({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: clerk });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "", "Never print key values");
  }
  assert.equal(
    run({ VERCEL: "", NEXT_PUBLIC_MAPTILER_API_KEY: "", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "" })
      .status,
    0,
  );
});
