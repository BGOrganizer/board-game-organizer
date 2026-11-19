import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import v8 from "@vitest/coverage-v8";
import { loadConfigFromFile } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(import.meta.url);
const metrics = ["lines", "functions", "branches", "statements"];
const configs = {};
for (const [owner, directory, filename = "vitest.config.ts"] of [
  ["shared", "packages/shared"],
  ["web", "apps/web"],
  ["mobile", "apps/mobile"],
  ["api", "apps/api"],
  ["api-integration", "apps/api", "vitest.integration.config.ts"],
  ["schemas", "packages/schemas"],
]) {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "test" },
    resolve(root, directory, filename),
  );
  assert(loaded, `Expected the actual ${owner} coverage configuration`);
  configs[owner] = { directory: resolve(root, directory), coverage: loaded.config.test.coverage };
}

// Synthetic Istanbul fragments exercise the installed provider's actual gate.
// They are never application execution evidence or reported app coverage.
function fragment(path, covered, size = 1) {
  const statementMap = {},
    fnMap = {},
    branchMap = {},
    s = {},
    f = {},
    b = {};
  for (let index = 0; index < size; index++) {
    const loc = { start: { line: index + 1, column: 0 }, end: { line: index + 1, column: 20 } };
    statementMap[index] = loc;
    fnMap[index] = { name: `fn${index}`, decl: loc, loc, line: index + 1 };
    branchMap[index] = { type: "if", loc, locations: [loc, loc], line: index + 1 };
    s[index] = f[index] = covered ? 1 : 0;
    b[index] = covered ? [1, 1] : [0, 0];
  }
  return { path, statementMap, fnMap, branchMap, s, f, b };
}

for (const [workspace, pattern, uncovered, large] of [
  ["shared", "src/**/*.{ts,tsx,js,jsx}", "src/missed.ts", "../query/src/covered.ts"],
  ["shared", "../query/src/**/*.{ts,tsx,js,jsx}", "../query/src/missed.ts", "src/covered.ts"],
  ["shared", "../store/src/**/*.{ts,tsx,js,jsx}", "../store/src/missed.ts", "src/covered.ts"],
  ["web", "src/**/*.{ts,tsx,js,jsx}", "src/missed.tsx", "../../packages/shared/src/covered.ts"],
  ["web", "public/firebase-messaging-sw.js", "public/firebase-messaging-sw.js", "src/covered.ts"],
]) {
  test(`actual ${workspace} gate ${pattern} rejects a missed owner despite passing global coverage`, async () => {
    const { directory, coverage } = configs[workspace];
    for (const metric of metrics) assert.equal(coverage.thresholds[pattern]?.[metric], 90);
    const provider = await v8.getProvider();
    assert.equal(provider.version, require("vitest/package.json").version);
    const errors = [];
    provider.initialize({
      version: provider.version,
      config: { root: directory },
      _coverageOptions: coverage,
      logger: { error: (message) => errors.push(message), warn: (message) => assert.fail(message) },
    });
    const map = provider.createCoverageMap();
    const missed = resolve(directory, uncovered);
    map.addFileCoverage(fragment(resolve(directory, large), true, 100));
    map.addFileCoverage(fragment(missed, false));
    const groups = provider.resolveThresholds(map);
    const owner = groups.find((group) => group.name === pattern);
    assert(owner.coverageMap.files().includes(missed), "The configured owner glob must match");
    for (const metric of metrics) assert(map.getCoverageSummary().data[metric].pct >= 90);
    const previousExitCode = process.exitCode;
    try {
      provider.checkThresholds(groups);
      assert.equal(process.exitCode, 1, "A masked owner must fail the actual provider gate");
      assert(errors.some((error) => error.includes(`"${pattern}" threshold (90%)`)));
      assert(errors.every((error) => !error.includes("global threshold")));
    } finally {
      process.exitCode = previousExitCode;
    }
  });
}

test("actual Vitest LCOV reporters preserve repository-relative application and package identities", async (t) => {
  const output = mkdtempSync(join(tmpdir(), "bgo-lcov-owners-"));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const expectedSources = {
    web: ["apps/web/src/components/events/EventCard.tsx"],
    mobile: ["apps/mobile/src/components/events/EventCard.tsx"],
    api: ["apps/api/src/app/lib/cors.ts"],
    "api-integration": ["apps/api/src/app/lib/cors.ts"],
    shared: [
      "packages/shared/src/index.ts",
      "packages/query/src/index.ts",
      "packages/store/src/index.ts",
    ],
    schemas: ["packages/schemas/src/index.ts"],
  };
  const identities = new Set();
  for (const [workspace, paths] of Object.entries(expectedSources)) {
    const { directory, coverage } = configs[workspace];
    const reporter = coverage.reporter.find((entry) =>
      Array.isArray(entry) ? entry[0] === "lcov" : entry === "lcov",
    );
    assert(Array.isArray(reporter), `${workspace} must configure the LCOV source root explicitly`);
    assert.equal(resolve(reporter[1].projectRoot), root);
    const provider = await v8.getProvider();
    const reportsDirectory = join(output, workspace);
    provider.initialize({
      version: provider.version,
      config: { root: directory },
      // This isolates reporter behavior; synthetic fragments are never app coverage evidence.
      _coverageOptions: {
        ...coverage,
        reporter: [reporter],
        reportsDirectory,
        thresholds: undefined,
      },
      logger: { error: (message) => assert.fail(message), warn: (message) => assert.fail(message) },
    });
    const map = provider.createCoverageMap();
    for (const path of paths) map.addFileCoverage(fragment(resolve(root, path), true));
    await provider.generateReports(map, true);
    const report = readFileSync(join(reportsDirectory, "lcov.info"), "utf8");
    const sources = [...report.matchAll(/^SF:(.+)$/gm)].map((match) => match[1]);
    assert.deepEqual(
      sources.sort(),
      [...paths].sort(),
      `${workspace} must retain each exact owner`,
    );
    assert.equal(new Set(sources).size, paths.length);
    for (const source of sources) identities.add(source);
  }
  // API unit and integration reports intentionally merge the same resource; other owners stay distinct.
  assert.equal(identities.size, 7);
});
