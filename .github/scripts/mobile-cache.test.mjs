import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { mobileBuildInputs } from "./mobile-build-inputs.mjs";

const pr = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
const emulator = parse(readFileSync(".github/actions/android-emulator/action.yml", "utf8"));
const build = parse(readFileSync(".github/actions/mobile-build/action.yml", "utf8"));
const internal = pr.jobs["build-mobile-internal"].steps;
const fixture = {
  MOBILE_BUILD_PROFILE: "internal",
  EXPO_PUBLIC_API_URL: "https://pr-22.example.invalid",
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "fixture-public-clerk",
  EXPO_PUBLIC_MAPTILER_API_KEY: "fixture-public-map",
  EXPO_PUBLIC_SENTRY_DSN: "fixture-public-sentry",
  EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS: "fixture-private-bypass",
  GOOGLE_SERVICES_JSON_CONTENT: "fixture-private-json",
};

test("APK fingerprint covers every embedded configuration input without emitting values", () => {
  const hash = mobileBuildInputs(fixture);
  assert.match(hash, /^[a-f0-9]{64}$/);
  for (const name of Object.keys(fixture))
    assert.notEqual(
      mobileBuildInputs({ ...fixture, [name]: `${fixture[name]}-changed` }),
      hash,
      name,
    );
  assert.equal(mobileBuildInputs({}), mobileBuildInputs({ GOOGLE_SERVICES_JSON_CONTENT: "" }));
  const cli = spawnSync(process.execPath, [".github/scripts/mobile-build-inputs.mjs"], {
    encoding: "utf8",
    env: { ...process.env, ...fixture },
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.trim(), hash);
  assert.doesNotMatch(cli.stdout + cli.stderr, /fixture-/);
});

test("successful APK build may be reused after failed acceptance, with independent provenance checks", () => {
  const find = internal.find((step) => step.id === "reuse");
  assert.equal(
    find.if,
    undefined,
    "No previous green pipeline must not prevent artifact discovery",
  );
  assert.match(find.run, /\.status == "completed"/);
  assert.doesNotMatch(find.run, /\.conclusion == "success" and any\(\.pull_requests/);
  assert.match(
    find.run,
    /\.name == "📱 Mobile APK \(internal\) — build or reuse" and \.conclusion == "success"/,
  );
  assert.match(find.run, /\.expired==false/);
  assert.match(find.run, /mobile-build-changed\.mjs "\$RUN_SHA" "\$HEAD_SHA"/);
  const fingerprint = internal.find(
    (step) => step.name === "🔑 Fingerprint current APK configuration",
  );
  const buildStep = internal.find((step) => step.id === "build");
  for (const [env, input] of [
    ["EXPO_PUBLIC_API_URL", "api-url"],
    ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "clerk-publishable-key"],
    ["EXPO_PUBLIC_MAPTILER_API_KEY", "maptiler-api-key"],
    ["EXPO_PUBLIC_SENTRY_DSN", "sentry-dsn"],
    ["EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS", "protection-bypass"],
    ["GOOGLE_SERVICES_JSON_CONTENT", "google-services-json"],
  ])
    assert.equal(fingerprint.env[env], buildStep.with[input]);
  assert.equal(fingerprint.env.MOBILE_BUILD_PROFILE, buildStep.with.profile);
  assert.match(buildStep.if, /verify-apk.outputs.reused != 'true'/);
  const mobileBuild = build.runs.steps.find((step) => step.name.startsWith("📱 Build"));
  assert.match(mobileBuild.run, /mobile-build-inputs.mjs > build-output\/build-inputs.sha256/);
  assert.match(mobileBuild.run, /sha256sum -- \*\.apk > apk.sha256/);
});

test("reused APK must match API, private/public configuration digest and actual file checksum", () => {
  const verify = internal.find((step) => step.id === "verify-apk");
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  for (const fault of ["none", "api", "configuration", "checksum", "missing"]) {
    const folder = mkdtempSync(join(tmpdir(), "bgo-apk-provenance-"));
    const apkDir = join(folder, "apps/mobile/build-output");
    mkdirSync(apkDir, { recursive: true });
    const bytes = "unit-only APK checksum fixture";
    writeFileSync(join(apkDir, "fixture.apk"), fault === "checksum" ? "corrupted fixture" : bytes);
    writeFileSync(
      join(apkDir, "api-url.txt"),
      fault === "api" ? "https://wrong.example.invalid" : fixture.EXPO_PUBLIC_API_URL,
    );
    writeFileSync(join(folder, "expected-apk-inputs.sha256"), `${mobileBuildInputs(fixture)}\n`);
    if (fault !== "missing") {
      writeFileSync(
        join(apkDir, "build-inputs.sha256"),
        `${fault === "configuration" ? "stale" : mobileBuildInputs(fixture)}\n`,
      );
      writeFileSync(
        join(apkDir, "apk.sha256"),
        `${createHash("sha256").update(bytes).digest("hex")}  fixture.apk\n`,
      );
    }
    const output = join(folder, "outputs.txt");
    try {
      const result = spawnSync(bash, ["-e", "-o", "pipefail", "-c", verify.run], {
        cwd: folder,
        encoding: "utf8",
        env: {
          ...process.env,
          EXPECTED_API_URL: fixture.EXPO_PUBLIC_API_URL,
          RUNNER_TEMP: folder.replaceAll("\\", "/"),
          GITHUB_OUTPUT: output.replaceAll("\\", "/"),
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, "utf8").trim(), `reused=${fault === "none"}`);
      assert.equal(existsSync(apkDir), fault === "none");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
});

test("cold native builds configure client and daemon memory separately without overwriting unrelated Gradle properties", () => {
  const configure = build.runs.steps.find(
    (step) => step.name === "🧠 Configure Gradle for cold native builds",
  );
  const compile = build.runs.steps.find((step) => step.name.startsWith("📱 Build"));
  assert.equal(compile.env.JAVA_OPTS, "-Xmx512m");
  assert(build.runs.steps.indexOf(configure) < build.runs.steps.indexOf(compile));
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  for (const customHome of [false, true]) {
    const folder = mkdtempSync(join(tmpdir(), "bgo-gradle-memory-"));
    const home = join(folder, customHome ? "custom-gradle" : ".gradle");
    mkdirSync(home, { recursive: true });
    const properties = join(home, "gradle.properties");
    writeFileSync(properties, "unrelated=keep\norg.gradle.jvmargs=-Xmx2048m\n");
    const env = { ...process.env, HOME: folder.replaceAll("\\", "/") };
    delete env.GRADLE_USER_HOME;
    if (customHome) env.GRADLE_USER_HOME = home.replaceAll("\\", "/");
    try {
      const result = spawnSync(bash, ["-e", "-c", configure.run], {
        encoding: "utf8",
        env,
      });
      assert.equal(result.status, 0, result.stderr);
      const settings = Object.fromEntries(
        readFileSync(properties, "utf8")
          .trim()
          .split("\n")
          .map((line) => {
            const index = line.indexOf("=");
            return [line.slice(0, index), line.slice(index + 1)];
          }),
      );
      assert.equal(settings.unrelated, "keep");
      assert.equal(
        settings["org.gradle.jvmargs"],
        "-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8",
      );
      assert.equal(settings["org.gradle.workers.max"], "2");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
});

test("SDK cache prepares only its three directories before restoring root-owned runner tools", () => {
  const prepare = emulator.runs.steps.find((step) => step.name === "Resolve SDK cache path");
  const restore = emulator.runs.steps.find((step) => step.uses === "actions/cache/restore@v4");
  assert(emulator.runs.steps.indexOf(prepare) < emulator.runs.steps.indexOf(restore));
  const folder = mkdtempSync(join(tmpdir(), "bgo-sdk-owner-"));
  const sdk = join(folder, "SDK root").replaceAll("\\", "/");
  const targets = ["system-images/android-34/google_apis/x86_64", "emulator", "platform-tools"];
  for (const target of [...targets, "unrelated", ".android/avd"])
    mkdirSync(`${sdk}/${target}`, { recursive: true });
  const log = join(folder, "ownership.txt").replaceAll("\\", "/");
  const envFile = join(folder, "env.txt").replaceAll("\\", "/");
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  try {
    const result = spawnSync(
      bash,
      ["-e", "-c", 'sudo() { printf "%s\\n" "$@" >> "$OWNER_LOG"; }\n' + prepare.run],
      {
        encoding: "utf8",
        env: { ...process.env, ANDROID_HOME: sdk, GITHUB_ENV: envFile, OWNER_LOG: log },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.length, 12);
    for (const [index, target] of targets.entries()) {
      assert.deepEqual(calls.slice(index * 4, index * 4 + 2), ["chown", "-R"]);
      assert.match(calls[index * 4 + 2], /^\d+:\d+$/);
      assert.equal(calls[index * 4 + 3], `${sdk}/${target}`);
    }
    assert.equal(readFileSync(envFile, "utf8").trim(), `BGO_ANDROID_SDK=${sdk}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("SDK cache survives failed acceptance without persisting emulator identity or snapshots", () => {
  const restore = emulator.runs.steps.find((step) => step.uses === "actions/cache/restore@v4");
  const save = emulator.runs.steps.find((step) => step.uses === "actions/cache/save@v4");
  assert.equal(restore.id, "sdk-cache");
  assert.equal(save.with.path, restore.with.path);
  assert.equal(save.with.key, "${{ steps.sdk-cache.outputs.cache-primary-key }}");
  assert.match(save.if, /inputs.phase == 'sdk'/);
  assert.match(save.if, /cache-hit != 'true'/);
  assert.match(restore.with.path, /system-images\/android-34\/google_apis\/x86_64/);
  assert.doesNotMatch(restore.with.path, /\.android|avd|userdata|snapshot/);
  assert(
    emulator.runs.steps.indexOf(save) <
      emulator.runs.steps.findIndex((step) => step.name === "🚀 Create AVD"),
  );
  assert.match(
    emulator.runs.steps.find((step) => step.name === "📱 Boot emulator").run,
    /-no-snapshot[\s\S]*-accel on/,
  );
  const gradle = build.runs.steps.find((step) => step.name === "📦 Cache Gradle");
  assert.equal(gradle.with.path.trim(), "~/.gradle/caches/modules-2\n~/.gradle/wrapper");
  assert.doesNotMatch(JSON.stringify(build), /~\/\.eas-build-local/);
});

test("native acceptance preserves normal animations and Android failure dialogs", () => {
  const boot = emulator.runs.steps.find((step) => step.name === "📱 Boot emulator").run;
  for (const setting of [
    "window_animation_scale",
    "transition_animation_scale",
    "animator_duration_scale",
  ])
    assert.match(boot, new RegExp(`settings put global ${setting} 1\\.0\\n`));
  assert.match(boot, /settings put global hide_error_dialogs 0\n/);
});

test("lost-device capture retains bounded host memory/kernel evidence without command arguments or secrets", () => {
  const script = readFileSync(".github/scripts/maestro-e2e.sh", "utf8");
  const capture = script.slice(script.indexOf("capture() {"), script.indexOf('case "${1:-}" in'));
  assert.match(capture, /timeout 10 sudo -n dmesg/);
  assert.match(capture, /ps -eo pid,ppid,rss,comm --sort=-rss/);
  const folder = mkdtempSync(join(tmpdir(), "bgo-emulator-host-"));
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  try {
    const result = spawnSync(
      bash,
      [
        "-e",
        "-o",
        "pipefail",
        "-c",
        `
      free() { echo "Mem: 16000 12000 4000"; }
      ps() { echo "42 1 8000000 qemu-system-x86"; }
      sudo() { echo "Out of memory: Killed process 42 (qemu-system-x86)"; }
      timeout() { shift; "$@"; }
      adb() { return 1; }
      stop_recording() { :; }
      ${capture.replaceAll("/tmp/maestro-debug/", '"$HOST_FIXTURE/"')}
      capture
    `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOST_FIXTURE: folder.replaceAll("\\", "/"),
          E2E_PASSWORD: "fixture-private-password",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const evidence = readFileSync(join(folder, "failure-host.txt"), "utf8");
    assert.match(evidence, /Mem: 16000 12000 4000/);
    assert.match(evidence, /Out of memory: Killed process 42/);
    assert.doesNotMatch(evidence, /fixture-private-password/);
    assert.equal(
      readFileSync(join(folder, "failure-device.txt"), "utf8").trim(),
      "Android device unavailable after Maestro failure",
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
