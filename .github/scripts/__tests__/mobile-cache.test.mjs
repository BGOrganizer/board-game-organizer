import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { mobileBuildInputs } from "../mobile-build-inputs.mjs";

const pr = parse(readFileSync(".github/workflows/pr-ci.yml", "utf8"));
const emulator = parse(readFileSync(".github/actions/android-emulator/action.yml", "utf8"));
const build = parse(readFileSync(".github/actions/mobile-build/action.yml", "utf8"));
const internal = pr.jobs["build-mobile-internal"].steps;
const fixture = {
  APP_VARIANT: "development",
  EXPO_UPDATE_CHANNEL: "ci-pr-22",
  MOBILE_BUILD_PROFILE: "internal",
  EXPO_PUBLIC_API_URL: "https://pr-22.example.invalid",
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "fixture-public-clerk",
  EXPO_PUBLIC_MAPTILER_API_KEY: "fixture-public-map",
  EXPO_PUBLIC_SENTRY_DSN: "fixture-public-sentry",
  EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS: "fixture-private-bypass",
  GOOGLE_SERVICES_JSON_CONTENT: "fixture-private-json",
};

test("build and upload callers explicitly separate app identity from the shared internal profile", () => {
  assert.equal(build.inputs["app-environment"].required, true);
  assert.equal(build.inputs["update-channel"].required, true);
  const eas = JSON.parse(readFileSync("apps/mobile/eas.json", "utf8"));
  assert.equal(eas.build.internal.channel, undefined);
  assert.equal(eas.build.development.channel, "development");
  assert.equal(eas.build.production.channel, "production");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Assert the literal GitHub expression.
  const prNumber = "${{ github.event.pull_request.number }}";
  let callers = 0;
  for (const [file, variant] of [
    ["pr-ci.yml", "development"],
    ["main-ci.yml", "production"],
  ]) {
    const workflow = parse(readFileSync(`.github/workflows/${file}`, "utf8"));
    for (const [jobId, job] of Object.entries(workflow.jobs))
      for (const step of job.steps ?? []) {
        if (step.uses === "./.github/actions/mobile-build") {
          assert.equal(step.with.profile, "internal");
          assert.equal(step.with["app-environment"], variant);
          assert.equal(
            step.with["update-channel"],
            variant === "production"
              ? "production"
              : jobId === "build-mobile-internal"
                ? `ci-pr-${prNumber}`
                : "development",
          );
          callers++;
        }
        if (step.run?.includes("scripts/eas-upload.mjs")) {
          assert.equal(step.env.APP_VARIANT, variant);
          assert.equal(
            step.env.EXPO_UPDATE_CHANNEL,
            variant === "production" ? "production" : "development",
          );
        }
        assert.doesNotMatch(step.run ?? "", /\beas update(?:\s|$)/);
      }
  }
  assert.equal(callers, 3);
});

test("app variant and OTA channel fail closed before build setup and export only supported pairs", () => {
  const step = build.runs.steps[0];
  assert.equal(step.name, "Select Android app variant");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: Assert the literal GitHub expression.
  assert.equal(step.env.APP_VARIANT, "${{ inputs.app-environment }}");
  for (const [variant, channel, valid] of [
    ["development", "development", true],
    ["development", "ci-pr-22", true],
    ["development", "development-pr-22", false],
    ["production", "production", true],
    ["development", "production", false],
    ["production", "development-pr-22", false],
    ["production", "ci-pr-22", false],
    ["development", "development-pr-0", false],
    ["development", "ci-pr-01", false],
    ["development", "internal", false],
    ["development", "", false],
    ["", "production", false],
    ["staging", "production", false],
    ["production\nGH_TOKEN=bad", "production", false],
    ["development", "ci-pr-22\nGH_TOKEN=bad", false],
  ]) {
    const folder = mkdtempSync(join(tmpdir(), "bgo-variant-"));
    const envFile = join(folder, "env");
    writeFileSync(envFile, "");
    try {
      const result = spawnSync("bash", ["-e", "-c", step.run], {
        encoding: "utf8",
        env: {
          ...process.env,
          APP_VARIANT: variant,
          EXPO_UPDATE_CHANNEL: channel,
          GITHUB_ENV: envFile,
        },
      });
      assert.equal(result.status, valid ? 0 : 1);
      assert.equal(
        readFileSync(envFile, "utf8"),
        valid ? `APP_VARIANT=${variant}\nEXPO_UPDATE_CHANNEL=${channel}\n` : "",
      );
      assert.doesNotMatch(result.stdout + result.stderr, /GH_TOKEN=bad/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
});

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
    /\.name == "APK \(CI\): build or reuse" or \.name == "📱 Mobile APK \(internal\) — build or reuse"\) and \.conclusion == "success"/,
  );
  assert.match(find.run, /\.expired==false/);
  assert.match(find.run, /mobile-build-changed\.mjs "\$RUN_SHA" "\$HEAD_SHA"/);
  const fingerprint = internal.find(
    (step) => step.name === "🔑 Fingerprint current APK configuration",
  );
  const buildStep = internal.find((step) => step.id === "build");
  for (const [env, input] of [
    ["EXPO_PUBLIC_API_URL", "api-url"],
    ["EXPO_UPDATE_CHANNEL", "update-channel"],
    ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "clerk-publishable-key"],
    ["EXPO_PUBLIC_MAPTILER_API_KEY", "maptiler-api-key"],
    ["EXPO_PUBLIC_SENTRY_DSN", "sentry-dsn"],
    ["EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS", "protection-bypass"],
    ["GOOGLE_SERVICES_JSON_CONTENT", "google-services-json"],
  ])
    assert.equal(fingerprint.env[env], buildStep.with[input]);
  assert.equal(fingerprint.env.MOBILE_BUILD_PROFILE, buildStep.with.profile);
  assert.equal(fingerprint.env.APP_VARIANT, buildStep.with["app-environment"]);
  assert.match(buildStep.if, /verify-apk.outputs.reused != 'true'/);
  const mobileBuild = build.runs.steps.find((step) => step.name.startsWith("📱 Build"));
  assert.match(mobileBuild.run, /mobile-build-inputs.mjs > build-output\/build-inputs.sha256/);
  assert.match(mobileBuild.run, /EXPO_UPDATE_CHANNEL.*> build-output\/update-channel.txt/);
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

test("APK disk preparation removes unused hosted tools/images without deleting SDK runtime tools or app data", () => {
  const cleanup = build.runs.steps.find((step) => step.name === "🧹 Free disk space");
  const setup = build.runs.steps.find((step) => step.uses === "./.github/actions/setup-bun");
  assert(build.runs.steps.indexOf(cleanup) < build.runs.steps.indexOf(setup));
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(
    bash,
    [
      "-e",
      "-o",
      "pipefail",
      "-c",
      `
    sudo() { printf 'remove:%s\\n' "$@"; }
    rm() { return 99; }
    docker() { printf 'docker:%s\\n' "$*"; }
    df() { echo disk-summary; }
    ${cleanup.run}
  `,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const removed = result.stdout
    .split("\n")
    .filter((line) => line.startsWith("remove:/"))
    .map((line) => line.slice(7));
  assert(removed.includes("/usr/local/.ghcup"));
  assert(removed.includes("/usr/share/swift"));
  assert(removed.includes("/usr/local/share/powershell"));
  assert(
    !removed.some((path) => path.startsWith("/usr/local/lib/android")),
    "EAS preflight needs the NDK referenced by the runner environment; preserve the entire SDK",
  );
  for (const path of removed) {
    assert.match(
      path,
      /^\/(usr\/share\/(dotnet|swift)|usr\/local\/(\.ghcup|share\/(boost|powershell))|opt\/(ghc|hostedtoolcache\/(CodeQL|go|Python|Ruby)))$/,
    );
  }
  assert.match(result.stdout, /docker:image prune --all --force/);
  assert.match(result.stdout, /disk-summary/);
  assert.doesNotMatch(cleanup.run, /continue-on-error|\|\| true/);
});

test("disk diagnostics run after failed APK builds without weakening build failure or exposing inputs", () => {
  const compile = build.runs.steps.find((step) => step.name.startsWith("📱 Build"));
  const report = build.runs.steps.find((step) => step.name === "💽 Report build disk usage");
  assert(build.runs.steps.indexOf(report) > build.runs.steps.indexOf(compile));
  assert.match(report.if, /^\$\{\{ always\(\) \}\}$/);
  assert.equal(compile["continue-on-error"], undefined);
  assert.doesNotMatch(compile.run, /eas build[\s\S]*\|\| true/);
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(
    bash,
    [
      "-e",
      "-o",
      "pipefail",
      "-c",
      `
    df() { printf 'df:%s\\n' "$*"; }
    du() { printf 'du:%s\\n' "$*"; return 1; }
    ${report.run}
  `,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: "/runner-home",
        RUNNER_TEMP: "/runner-temp",
        EXPO_TOKEN: "private-disk-test-token",
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /df:-h \/ \/tmp/);
  assert.match(result.stdout, /df:-i \/ \/tmp/);
  assert.match(result.stdout, /du:-sh \/runner-home\/\.gradle \/runner-temp \/tmp\/runner/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-disk-test-token/);
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
