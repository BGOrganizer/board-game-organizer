import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const action = readFileSync(
  new URL("../actions/maestro-e2e/action.yml", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const flows = [...action.matchAll(/^\s+run_flow ([\w-]+)$/gm)].map((match) => match[1]);
test("native acceptance flows are invoked and require real, distinct JUnit reports", () => {
  assert.equal(flows.length, 13);
  for (const name of ["08-groups", "09-group-invitations", "12-organizations", "13-event-draft"])
    assert(flows.includes(name), `${name} missing from the executable Maestro commands`);
  for (const name of flows)
    assert(existsSync(new URL(`../../apps/mobile/.maestro/flows/${name}.yaml`, import.meta.url)));
  assert(action.includes('--output "/tmp/maestro-reports/$1.xml"'));
  assert(action.includes("trap persist EXIT"));
  const verification = action.slice(
    action.indexOf("python3 .github/scripts/verify-maestro-reports.py"),
  );
  for (const name of flows) assert(verification.includes(name));
  for (const name of ["pr-ci.yml", "main-ci.yml", "mobile-e2e.yml"])
    assert.doesNotMatch(
      readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8"),
      /no-junit-output|all-flows-passed/,
    );
  assert.doesNotMatch(action, /all-flows-passed|summary\.xml/);
});
test("native device verification uses Clerk development fixtures, without disabling Device Trust", () => {
  const provision = readFileSync(
    new URL("../actions/provision-e2e-user/action.yml", import.meta.url),
    "utf8",
  );
  assert.match(provision, /case "\$CLERK_SECRET_KEY" in\s+sk_test_\*/);
  assert.equal((provision.match(/\+clerk_test@gmail\.com/g) ?? []).length, 2);
  const helper = readFileSync(
    new URL("../../apps/mobile/.maestro/helpers/verify-clerk-device.yaml", import.meta.url),
    "utf8",
  );
  assert(helper.includes('visible: "Check your email|Mobile number|Matches"'));
  assert(helper.includes('inputText: "424242"'));
  for (const name of [
    "02-login",
    "05-contacts-follow-block",
    "07-reauth-after-logout",
    "09-group-invitations",
  ]) {
    const flow = readFileSync(
      new URL(`../../apps/mobile/.maestro/flows/${name}.yaml`, import.meta.url),
      "utf8",
    );
    for (const match of flow.matchAll(
      /- inputText: \$\{PASSWORD(?:_2)?\}\n- tapOn: "Continue"\n/g,
    )) {
      assert(
        flow
          .slice(match.index + match[0].length)
          .startsWith('- runFlow: "../helpers/verify-clerk-device.yaml"'),
      );
    }
  }
});
test("native event acceptance uses the catalog game actually seeded by CI", () => {
  const flow = readFileSync(
    new URL("../../apps/mobile/.maestro/flows/13-event-draft.yaml", import.meta.url),
    "utf8",
  );
  const seed = readFileSync(
    new URL("../../apps/api/src/app/api/admin/ci-db/route.ts", import.meta.url),
    "utf8",
  );
  assert(seed.includes('name: "Cascadia"'));
  assert(flow.includes('"Select: Cascadia"'));
  assert(!flow.includes('"Select: Catan"'));
});
test("the gallery fixture is committed and pushed to the emulator before community acceptance", () => {
  const push = action.indexOf(
    "adb push apps/mobile/assets/icon.png /sdcard/Pictures/bgo-organization-logo.png",
  );
  assert(push >= 0);
  assert(push < action.indexOf("run_flow 12-organizations"));
  assert(existsSync(new URL("../../apps/mobile/assets/icon.png", import.meta.url)));
  assert(action.includes("android.intent.action.MEDIA_SCANNER_SCAN_FILE"));
});

test("emulator executes quoted scripts fully and preserves command/pipeline failures", () => {
  const emulator = readFileSync(
    new URL("../actions/android-emulator/action.yml", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert.match(emulator, /EMULATOR_SCRIPT: \$\{\{ inputs\.script \}\}/);
  assert.doesNotMatch(emulator, /bash[^\n]*\$\{\{ inputs\.script \}\}/);
  assert(emulator.includes("trap 'kill \"$EMU_PID\" 2>/dev/null || true' EXIT"));
  const wrapper = emulator.match(/SCRIPT_EXIT=0\r?\n([\s\S]*?)exit "\$SCRIPT_EXIT"/)?.[0];
  assert(wrapper);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const run = (script) =>
    spawnSync(bash, ["-e", "-c", wrapper], {
      encoding: "utf8",
      env: { ...process.env, EMULATOR_SCRIPT: script },
    });
  const result = run(
    "APK=\"path with spaces.apk\"\nprintf '%s\\n' \"APK found: $APK\"\nprintf '%s\\n' '$(echo not expanded)'\necho finished",
  );
  assert.equal(result.status, 0, result.stderr);
  assert(result.stdout.includes("APK found: path with spaces.apk"));
  assert(result.stdout.includes("$(echo not expanded)"));
  assert(result.stdout.includes("finished"));
  for (const script of ["false\necho unreachable", "false | cat\necho unreachable"]) {
    const failed = run(script);
    assert.equal(failed.status, 1, failed.stderr);
    assert(!failed.stdout.includes("unreachable"));
  }
});

test("JUnit validation fails closed for absent, fabricated, skipped, failed, or malformed results", () => {
  const folder = mkdtempSync(join(tmpdir(), "bgo-maestro-junit-"));
  const script = fileURLToPath(new URL("./verify-maestro-reports.py", import.meta.url));
  const file = join(folder, "01-launch-welcome.xml");
  const run = (...names) =>
    spawnSync(process.platform === "win32" ? "python" : "python3", [script, folder, ...names], {
      encoding: "utf8",
    });
  const valid =
    '<testsuites><testsuite tests="1" failures="0"><testcase name="01-launch-welcome" status="SUCCESS"/></testsuite></testsuites>';
  try {
    assert.notEqual(run("01-launch-welcome").status, 0);
    writeFileSync(file, valid);
    const ok = run("01-launch-welcome");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /1 real Maestro flows; zero failures or skips/);
    assert.notEqual(run().status, 0);
    for (const xml of [
      "not XML",
      "<testsuites/>",
      valid.replace('status="SUCCESS"', ""),
      valid.replace('status="SUCCESS"', 'status="ERROR"'),
      valid.replace('name="01-launch-welcome"', 'name="all-flows-passed"'),
      valid.replace('failures="0"', 'failures="1"'),
      valid.replace('failures="0"', 'errors="1"'),
      valid.replace('failures="0"', 'skipped="1"'),
      valid.replace('tests="1"', 'tests="0"'),
      ...["failure", "error", "skipped"].map((tag) =>
        valid.replace("/></testsuite>", `><${tag}/></testcase></testsuite>`),
      ),
    ]) {
      writeFileSync(file, xml);
      assert.notEqual(run("01-launch-welcome").status, 0, xml);
    }
    writeFileSync(file, valid);
    writeFileSync(join(folder, "summary.xml"), valid);
    assert.notEqual(run("01-launch-welcome").status, 0);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
