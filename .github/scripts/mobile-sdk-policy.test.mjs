import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const mobile = createRequire(join(repo, "apps/mobile/package.json"));
const expoRoot = dirname(mobile.resolve("expo/package.json"));
const sdk = JSON.parse(readFileSync(join(expoRoot, "bundledNativeModules.json"), "utf8"));
const nativeVersion = mobile("react-native/package.json").version;

function checkSdk(version) {
  const fixture = mkdtempSync(join(tmpdir(), "bgo-sdk-policy-"));
  try {
    mkdirSync(join(fixture, "node_modules/react-native"), { recursive: true });
    symlinkSync(expoRoot, join(fixture, "node_modules/expo"), "junction");
    writeFileSync(
      join(fixture, "node_modules/react-native/package.json"),
      JSON.stringify({ name: "react-native", version }),
    );
    writeFileSync(
      join(fixture, "package.json"),
      JSON.stringify({
        name: "sdk-policy-fixture",
        dependencies: { expo: mobile("expo/package.json").version, "react-native": version },
      }),
    );
    writeFileSync(
      join(fixture, "app.json"),
      JSON.stringify({ expo: { name: "SDK policy fixture", slug: "sdk-policy-fixture" } }),
    );
    return spawnSync(
      process.execPath,
      [join(expoRoot, "bin/cli"), "install", "--check", "--json"],
      {
        cwd: fixture,
        encoding: "utf8",
        env: {
          ...process.env,
          CI: "1",
          EXPO_OFFLINE: "1",
          HTTP_PROXY: "http://127.0.0.1:1",
          HTTPS_PROXY: "http://127.0.0.1:1",
        },
      },
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("CI validates the installed SDK before Doctor and EAS, without moving SDK metadata", () => {
  const action = readFileSync(join(repo, ".github/actions/mobile-build/action.yml"), "utf8");
  const check = action.indexOf("name: 🩺 Check locked Expo SDK compatibility");
  const doctor = action.indexOf("name: 🩺 Expo doctor");
  const build = action.indexOf("name: 📱 Build ");
  assert.ok(check >= 0 && doctor > check && build > doctor);
  assert.match(
    action.slice(check, doctor),
    /EXPO_OFFLINE: '1'[\s\S]*run: pnpm exec expo install --check/,
  );
  assert.match(
    action.slice(doctor, build),
    /EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK: '1'[\s\S]*run: pnpm exec expo-doctor/,
  );
  assert.match(action.slice(build), /EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK: '1'/);
  assert.doesNotMatch(
    action,
    /pnpm dlx expo-doctor|EXPO_NO_DEPENDENCY_VALIDATION|continue-on-error/,
  );
  const pkg = JSON.parse(readFileSync(join(repo, "apps/mobile/package.json"), "utf8"));
  assert.match(pkg.devDependencies["expo-doctor"], /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.expo?.install?.exclude, undefined);
});

test("compatible locked packages pass with remote version metadata unreachable", () => {
  assert.ok(sdk["react-native"]);
  const result = checkSdk(nativeVersion);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).upToDate, true);
});

test("Screens keeps Expo version and upstream Fabric listener lifetime backport", () => {
  const pkg = mobile("react-native-screens/package.json");
  assert.equal(pkg.version, "4.26.2");
  const patch = readFileSync(join(repo, "patches/react-native-screens@4.26.2.patch"), "utf8");
  const files = [...patch.matchAll(/^diff --git a\/(\S+) b\/\S+$/gm)].map((match) => match[1]);
  assert.deepEqual(files.sort(), [
    "android/src/main/cpp/NativeProxy.cpp",
    "android/src/main/cpp/NativeProxy.h",
    "cpp/RNSScreenRemovalListener.cpp",
    "cpp/RNSScreenRemovalListener.h",
  ]);
  assert.match(patch, /https:\/\/github\.com\/software-mansion\/react-native-screens\/pull\/4413/);
  const screensRoot = dirname(mobile.resolve("react-native-screens/package.json"));
  const proxy = readFileSync(join(screensRoot, "android/src/main/cpp/NativeProxy.cpp"), "utf8");
  assert.match(proxy, /static const std::shared_ptr<RNSScreenRemovalListener> instance/);
  assert.match(proxy, /setListener\(\[javaPart = javaPart_\]/);
  assert.match(proxy, /clearListener\(removalListenerToken_\)/);
  assert.doesNotMatch(proxy, /screenRemovalListener_/);
  const listener = readFileSync(join(screensRoot, "cpp/RNSScreenRemovalListener.cpp"), "utf8");
  assert.match(listener, /return \+\+currentToken_/);
  assert.match(listener, /if \(token == currentToken_\)/);
  assert.match(listener, /listener = listenerFunction_/);
  assert.match(listener, /if \(!listener\)/);
  assert.match(listener, /listener\(mutation\.oldChildShadowView\.tag\)/);
});

test("incompatible installed packages still fail the mandatory SDK gate", () => {
  const result = checkSdk("999.0.0");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.upToDate, false);
  assert.ok(report.dependencies.some((dependency) => dependency.packageName === "react-native"));
});
