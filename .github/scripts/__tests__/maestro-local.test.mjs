import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "bgo maestro local "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [
    ".maestro-version",
    "scripts/maestro.sh",
    ".github/scripts/install-maestro.sh",
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(file, join(root, file));
  }
  const version = readFileSync(join(root, ".maestro-version"), "utf8").trim();
  const install = join(root, ".tools/maestro", version);
  const run = (args = [], env = {}) =>
    spawnSync("bash", [join(root, "scripts/maestro.sh"), ...args], {
      cwd: tmpdir(),
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
  return { root, install, version, run };
}

test("local Maestro requires installation and the exact pinned distribution", (t) => {
  const { install, run, version } = fixture(t);
  assert.match(run().stderr, /bun run maestro:install/);
  mkdirSync(join(install, "bin"), { recursive: true });
  writeFileSync(join(install, "bin/maestro"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const missingJar = run(["--version"]);
  assert.equal(missingJar.status, 1);
  assert(missingJar.stderr.includes(version));
});

test("local Maestro preserves arguments, caller directory, environment and exit code", (t) => {
  const { root, install, version, run } = fixture(t);
  mkdirSync(join(install, "bin"), { recursive: true });
  mkdirSync(join(install, "lib"));
  writeFileSync(join(install, `lib/maestro-cli-${version}.jar`), "fixture");
  writeFileSync(
    join(install, "bin/maestro"),
    '#!/bin/sh\nprintf "%s\\n" "$MAESTRO_OPTS" "$HOME" "$PWD" "$@"\nexit 23\n',
    { mode: 0o755 },
  );
  const result = run(["--device", "test-device", "test", "flow with spaces.yaml"], {
    MAESTRO_OPTS: "-Xmx256m",
  });
  assert.equal(result.status, 23);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    `-Xmx256m "-Duser.home=${root}/.tools/maestro/runtime"`,
    process.env.HOME,
    tmpdir(),
    "--device",
    "test-device",
    "test",
    "flow with spaces.yaml",
  ]);
});

test("local installation uses the shared pinned installer and rejects a corrupt download", (t) => {
  const { root, version, run } = fixture(t);
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "curl"),
    '#!/bin/bash\nprintf "%s\\n" "$@" > "$DOWNLOAD_ARGS"\nwhile [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then printf corrupt > "$2"; exit 0; fi; shift; done\n',
    { mode: 0o755 },
  );
  const args = join(root, "download-args");
  assert.notEqual(
    run(["--install"], { PATH: `${bin}:${process.env.PATH}`, DOWNLOAD_ARGS: args }).status,
    0,
  );
  assert(
    readFileSync(args, "utf8").includes(
      `https://github.com/mobile-dev-inc/Maestro/releases/download/cli-${version}/maestro.zip`,
    ),
  );
  assert.throws(() => readFileSync(join(root, ".tools/maestro", version, "bin/maestro")));
});
