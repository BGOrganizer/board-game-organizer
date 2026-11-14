import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { withProductionBuildEnvironment } from "../mobile-build-environment.mjs";

const env = { APP_VARIANT: "production", MOBILE_BUILD_PROFILE: "internal" };
const script = fileURLToPath(new URL("../mobile-build-environment.mjs", import.meta.url));
const original = '{ "build": { "internal": { "distribution": "internal" } } }\r\n';

function fixture(contents = original) {
  const project = mkdtempSync(join(tmpdir(), "bgo-build-environment-"));
  const path = join(project, "eas.json");
  writeFileSync(path, contents, { mode: 0o640 });
  chmodSync(path, 0o640);
  return { project, path };
}

test("Development never reads or changes a fingerprint input, including absent eas.json", async () => {
  const f = fixture();
  try {
    for (const variant of [undefined, "development"]) {
      assert.equal(
        await withProductionBuildEnvironment(f.project, { APP_VARIANT: variant }, () => 17),
        17,
      );
      assert.equal(readFileSync(f.path, "utf8"), original);
    }
    rmSync(f.path);
    assert.equal(
      await withProductionBuildEnvironment(f.project, { APP_VARIANT: "development" }, () => 23),
      23,
    );
  } finally {
    rmSync(f.project, { recursive: true, force: true });
  }
});

for (const fail of [false, true])
  test(`Production scopes the documented EAS environment and restores exact bytes/mode, failure=${fail}`, async () => {
    const f = fixture();
    try {
      const operation = withProductionBuildEnvironment(f.project, env, async () => {
        const config = JSON.parse(readFileSync(f.path, "utf8"));
        assert.deepEqual(config, {
          build: { internal: { distribution: "internal", environment: "production" } },
        });
        assert.equal(statSync(f.path).mode & 0o777, 0o640);
        await Promise.resolve();
        if (fail) throw new Error("Owned build failure");
        return "APK complete";
      });
      if (fail) await assert.rejects(operation, /Owned build failure/);
      else assert.equal(await operation, "APK complete");
      assert.equal(readFileSync(f.path, "utf8"), original);
      assert.equal(statSync(f.path).mode & 0o777, 0o640);
    } finally {
      rmSync(f.project, { recursive: true, force: true });
    }
  });

test("outer and merged OTA scopes use identical deterministic fingerprint inputs", async () => {
  const f = fixture();
  try {
    await withProductionBuildEnvironment(f.project, env, async () => {
      const outer = readFileSync(f.path, "utf8");
      await withProductionBuildEnvironment(f.project, env, () => {
        assert.equal(readFileSync(f.path, "utf8"), outer);
      });
      assert.equal(readFileSync(f.path, "utf8"), outer);
    });
    assert.equal(readFileSync(f.path, "utf8"), original);
  } finally {
    rmSync(f.project, { recursive: true, force: true });
  }
});

test("invalid Production profile/configuration cannot dispatch a build", async () => {
  let ran = false;
  const run = () => {
    ran = true;
  };
  await assert.rejects(
    withProductionBuildEnvironment(
      "/not-read",
      { ...env, MOBILE_BUILD_PROFILE: "production" },
      run,
    ),
    /internal profile/,
  );
  for (const contents of [
    "{",
    "{}",
    '{"build":{"internal":null}}',
    '{"build":{"internal":[]}}',
    '{"build":{"internal":"bad"}}',
  ]) {
    const f = fixture(contents);
    try {
      await assert.rejects(withProductionBuildEnvironment(f.project, env, run));
      assert.equal(readFileSync(f.path, "utf8"), contents);
    } finally {
      rmSync(f.project, { recursive: true, force: true });
    }
  }
  assert.equal(ran, false);
});

for (const exitCode of [0, 7])
  test(`APK CLI invokes only eas build with exact arguments and restores configuration, status=${exitCode}`, () => {
    const f = fixture();
    try {
      const executable = join(f.project, "eas");
      writeFileSync(
        executable,
        `#!/usr/bin/env node\nconst fs=require('node:fs');const assert=require('node:assert/strict');assert.deepEqual(process.argv.slice(2),['build','--platform','android','--profile','internal','--local']);assert.equal(JSON.parse(fs.readFileSync('eas.json')).build.internal.environment,'production');process.exit(${exitCode});\n`,
      );
      chmodSync(executable, 0o755);
      const result = spawnSync(
        process.execPath,
        [script, "--platform", "android", "--profile", "internal", "--local"],
        {
          cwd: f.project,
          env: { ...process.env, ...env, PATH: `${f.project}:${process.env.PATH}` },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, exitCode === 0 ? 0 : 1);
      if (exitCode) assert.match(result.stderr, /APK build failed/);
      assert.equal(readFileSync(f.path, "utf8"), original);
    } finally {
      rmSync(f.project, { recursive: true, force: true });
    }
  });

test("a missing EAS executable fails without leaving a rewritten Production configuration", () => {
  const f = fixture();
  try {
    const result = spawnSync(process.execPath, [script, "--platform", "android"], {
      cwd: f.project,
      env: { ...process.env, ...env, PATH: "" },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /APK build failed/);
    assert.equal(readFileSync(f.path, "utf8"), original);
  } finally {
    rmSync(f.project, { recursive: true, force: true });
  }
});
