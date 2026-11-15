import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { scanner } from "../../../scripts/dependencies/registry-policy.mjs";

test("local, CI, EAS and remote installs share the manifest's exact Bun version", () => {
  const version = JSON.parse(readFileSync("package.json", "utf8")).packageManager.replace(
    /^bun@/,
    "",
  );
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const active = spawnSync("bun", ["--version"], { encoding: "utf8" });
  assert.equal(active.status, 0);
  assert.equal(active.stdout.trim(), version);
  const setup = parse(readFileSync(".github/actions/setup-bun/action.yml", "utf8"));
  assert.equal(setup.inputs["bun-version"].default, version);
  for (const profile of Object.values(
    JSON.parse(readFileSync("apps/mobile/eas.json", "utf8")).build,
  ))
    assert.equal(profile.bun, version);
  const deploy = readFileSync(".github/actions/vercel-deploy/action.yml", "utf8");
  assert(deploy.includes(`bunx bun@${version} install --frozen-lockfile`));
  assert(deploy.includes(`bunx bun@${version} run --filter`));
  assert(
    !deploy.includes("bunVersion"),
    "Package-manager migration must not switch the Vercel runtime",
  );
});

test("dependency scanner accepts registry packages and rejects exotic or credential-bearing sources", async () => {
  const valid = {
    name: "fixture",
    version: "1.2.3",
    tarball: "https://registry.npmjs.org/fixture/-/fixture-1.2.3.tgz",
  };
  assert.deepEqual(
    await scanner.scan({ packages: [valid, { ...valid, version: "1.2.3-rc.1+build" }] }),
    [],
  );
  for (const invalid of [
    { tarball: "http://registry.npmjs.org/fixture.tgz" },
    { tarball: "https://registry.npmjs.org.evil.test/fixture.tgz" },
    { tarball: "https://token@registry.npmjs.org/fixture.tgz" },
    { tarball: "https://registry.npmjs.org:443/fixture.tgz", version: "github:owner/repo" },
    { tarball: "file:fixture.tgz" },
    { tarball: "" },
  ]) {
    const result = await scanner.scan({ packages: [{ ...valid, ...invalid }] });
    assert.equal(result.length, 1);
    assert.equal(result[0].level, "fatal");
    assert.equal(result[0].url, null);
    assert(!JSON.stringify(result).includes("token@"));
  }
});

test("Bun script/filter commands retain Node runtime and application-owned env loading", () => {
  const dir = mkdtempSync(join(tmpdir(), "bgo-bun-policy-"));
  try {
    const config = readFileSync("bunfig.toml", "utf8");
    assert.match(config, /minimumReleaseAge = 86400/);
    writeFileSync(join(dir, "bunfig.toml"), config);
    writeFileSync(join(dir, ".env"), "BGO_BUN_ENV_SENTINEL=must-not-load\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "fixture",
        private: true,
        workspaces: ["apps/*"],
        scripts: { verify: "node verify.cjs" },
      }),
    );
    const verify =
      "console.log(JSON.stringify({node: !!process.versions.node && !process.versions.bun, loaded: !!process.env.BGO_BUN_ENV_SENTINEL}))";
    writeFileSync(join(dir, "verify.cjs"), verify);
    const child = join(dir, "apps", "child");
    mkdirSync(child, { recursive: true });
    writeFileSync(
      join(child, "package.json"),
      JSON.stringify({ name: "child", scripts: { verify: "node verify.cjs" } }),
    );
    writeFileSync(join(child, "verify.cjs"), verify);
    writeFileSync(join(child, ".env"), "BGO_BUN_ENV_SENTINEL=must-not-load\n");
    for (const args of [
      ["run", "verify"],
      ["run", "--filter", "child", "verify"],
    ]) {
      const result = spawnSync("bun", args, {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, BGO_BUN_ENV_SENTINEL: "" },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /"node":true,"loaded":false/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("actual Bun install rejects local source dependencies before running trusted scripts", () => {
  const dir = mkdtempSync(join(tmpdir(), "bgo-bun-source-"));
  try {
    const vendor = join(dir, "vendor");
    mkdirSync(vendor);
    writeFileSync(
      join(vendor, "package.json"),
      JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        scripts: { postinstall: "node marker.cjs" },
      }),
    );
    writeFileSync(
      join(vendor, "marker.cjs"),
      "require('node:fs').writeFileSync('../executed', 'unsafe')",
    );
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "probe",
        dependencies: { fixture: "file:./vendor" },
        trustedDependencies: ["fixture"],
      }),
    );
    const scannerPath = resolve("scripts/dependencies/registry-policy.mjs").replaceAll("\\", "/");
    writeFileSync(
      join(dir, "bunfig.toml"),
      `[install.security]\nscanner = ${JSON.stringify(scannerPath)}\n`,
    );
    const result = spawnSync("bun", ["install"], { cwd: dir, encoding: "utf8", timeout: 30_000 });
    assert.notEqual(result.status, 0, "Exotic sources must reach the scanner before installation");
    assert.match(
      `${result.stdout}${result.stderr}`,
      /BGO dependencies must use HTTPS npm registry/,
    );
    assert.throws(() => readFileSync(join(dir, "executed")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
