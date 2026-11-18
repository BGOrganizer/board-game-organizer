import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const flags = [
  "--expose-gc",
  "--no-concurrent-sweeping",
  "--max-old-space-size=1024",
  "--max-opt=1",
];
const run = (args) =>
  spawnSync(process.execPath, [...args, "scripts/performance/verify-worker.mjs"], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
  });

test("Reassure rejects a worker without actual exposed garbage collection", () => {
  const result = run(flags.filter((flag) => flag !== "--expose-gc"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /actual Node garbage collector/);
});
for (const absent of flags.slice(1))
  test(`Reassure rejects an exposed-GC worker missing ${absent}`, () => {
    const result = run(flags.filter((flag) => flag !== absent));
    assert.equal(result.status, 1);
    assert(result.stderr.includes(`Reassure worker is missing ${absent}`));
  });
test("Reassure accepts all required flags on the actual Node worker", () => {
  const result = run(flags);
  assert.equal(result.status, 0, result.stderr);
});
test("both benchmark configs forward V8 flags while native behavior tests remain separate", () => {
  for (const path of [
    "apps/mobile/performance/vitest.config.ts",
    "apps/web/performance/vitest.config.mts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /execArgv:\s*\[/);
    for (const flag of flags) assert(source.includes(`"${flag}"`));
    assert(source.includes('"../../scripts/performance/verify-worker.mjs"'));
  }
  const native = readFileSync("apps/mobile/vitest.native.config.mts", "utf8");
  assert.match(native, /execArgv:\s*\["--max-old-space-size=1024"\]/);
  assert.match(native, /setupFiles:\s*\["\.\/performance\/setup\.ts"\]/);
});
