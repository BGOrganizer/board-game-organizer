import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function fixture(t, flows) {
  const root = mkdtempSync(join(tmpdir(), "bgo syntax check "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, "apps/mobile/.maestro/flows");
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(root, ".github/scripts"), { recursive: true });
  mkdirSync(join(root, "scripts"));
  copyFileSync(
    ".github/scripts/check-maestro-syntax.sh",
    join(root, ".github/scripts/check-maestro-syntax.sh"),
  );
  for (const flow of flows)
    writeFileSync(join(directory, flow), "appId: fixture\n---\n- launchApp\n");
  // External CLI boundary: this proves invocation/aggregation, never real YAML parsing.
  writeFileSync(
    join(root, "scripts/maestro.sh"),
    'printf "%s\\0" "$@" >> "$CLI_LOG"\nif [[ "$2" == *02-failure.yaml ]]; then exit 23; fi\n',
  );
  const log = join(root, "commands");
  const run = () =>
    spawnSync("bash", [join(root, ".github/scripts/check-maestro-syntax.sh")], {
      cwd: tmpdir(),
      env: { ...process.env, CLI_LOG: log },
      encoding: "utf8",
    });
  return { run, log };
}

test("Maestro syntax attempts every flow after a failure and preserves spaced paths without executing tests", (t) => {
  const { run, log } = fixture(t, ["01-first.yaml", "02-failure.yaml", "03 spaced flow.yaml"]);
  assert.equal(run().status, 1);
  assert.deepEqual(readFileSync(log, "utf8").split("\0").filter(Boolean), [
    "check-syntax",
    "apps/mobile/.maestro/flows/01-first.yaml",
    "check-syntax",
    "apps/mobile/.maestro/flows/02-failure.yaml",
    "check-syntax",
    "apps/mobile/.maestro/flows/03 spaced flow.yaml",
  ]);
});
test("Maestro syntax succeeds only after nonempty successful CLI checks", (t) => {
  const success = fixture(t, ["01-first.yaml"]);
  assert.equal(success.run().status, 0);
  const empty = fixture(t, []);
  assert.equal(empty.run().status, 1);
  assert.match(empty.run().stderr, /refusing an empty syntax check/);
});
