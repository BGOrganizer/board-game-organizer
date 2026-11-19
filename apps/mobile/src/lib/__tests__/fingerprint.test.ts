import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const options = require("../../../fingerprint.config.js");
const { getExpoConfigSourcesAsync } = require("@expo/fingerprint/build/sourcer/Expo");
const { getPackageJsonScriptSourcesAsync } = require("@expo/fingerprint/build/sourcer/Bare");
const {
  createContentsHashResultsAsync,
  createFingerprintFromSourcesAsync,
} = require("@expo/fingerprint/build/hash/Hash");
const { normalizeSourceSkips } = require("@expo/fingerprint/build/Config");
const project = fileURLToPath(new URL("../../../", import.meta.url));
const apiA = "https://api-development-pr-22-board-game-organizers-projects.vercel.app";
const apiB = "https://api-development-pr-23-board-game-organizers-projects.vercel.app";
const base = {
  android: { package: "com.bgo.boardgameorganizer.dev" },
  plugins: ["expo-notifications"],
  updates: {
    url: "https://u.expo.dev/f19004af-2669-49ca-8c46-2697b66841b6",
    requestHeaders: { "expo-channel-name": "development" },
  },
  extra: {
    sentryEnvironment: "development",
    apiUrl: apiA,
    clerkPublishableKey: "pk_test_fixture",
    eas: { projectId: "f19004af-2669-49ca-8c46-2697b66841b6" },
  },
};
async function sdkHash(config: unknown, transform = true) {
  const settings = {
    hashAlgorithm: "sha1",
    platforms: ["android"],
    sourceSkips: normalizeSourceSkips(options.sourceSkips),
    ...(transform ? { fileHookTransform: options.fileHookTransform } : {}),
  };
  const sources = await getExpoConfigSourcesAsync(project, { exp: config }, [], settings);
  const source = sources.find((value: { id?: string }) => value.id === "expoConfig");
  expect(source).toBeDefined();
  return (await createContentsHashResultsAsync(source, settings)).hex;
}

async function sdkScriptsHash(scripts: Record<string, string>, variant: string, transform = true) {
  const folder = mkdtempSync(join(tmpdir(), "bgo-fingerprint-scripts-"));
  const manifest = join(folder, "package.json");
  const settings = {
    hashAlgorithm: "sha1",
    platforms: ["android"],
    concurrentIoLimit: 1,
    sourceSkips: normalizeSourceSkips(options.sourceSkips),
    ...(transform ? { fileHookTransform: options.fileHookTransform } : {}),
  };
  try {
    writeFileSync(manifest, JSON.stringify({ scripts }));
    const sources = await getPackageJsonScriptSourcesAsync(folder, settings);
    const config = {
      ...base,
      android: {
        package: variant === "production" ? "com.bgo.boardgameorganizer" : base.android.package,
      },
      extra: {
        ...base.extra,
        sentryEnvironment: variant,
        apiUrl: variant === "production" ? "https://api.board-game-organizer.com" : apiA,
      },
      updates: { ...base.updates, requestHeaders: { "expo-channel-name": variant } },
    };
    const configs = await getExpoConfigSourcesAsync(project, { exp: config }, [], settings);
    const source = configs.find((value: { id?: string }) => value.id === "expoConfig");
    expect(source).toBeDefined();
    return (await createFingerprintFromSourcesAsync([...sources, source], folder, settings)).hash;
  } finally {
    delete require.cache[manifest];
    rmSync(folder, { recursive: true, force: true });
  }
}

const scripts = {
  start: "expo start",
  android: "expo run:android --variant release",
  ios: "expo run:ios --configuration Release",
  "eas-build-post-install": "node configure-native.js",
  postinstall: "node install-native.js",
  "test-build": "node custom-build.js",
  pretest: "node test-setup.js",
  test: "vitest run",
  "test:coverage": "vitest run --coverage",
};

it.each(["development", "production"])(
  "keeps %s SDK hashes stable when test commands are added, changed or removed",
  async (variant) => {
    const baseline = await sdkScriptsHash(scripts, variant);
    const changed = {
      ...scripts,
      test: "vitest run --maxWorkers=1",
      "test:coverage": "vitest run --coverage --reporter=json",
      "test:perf": "vitest run --config performance/vitest.config.ts",
      "test:components": "vitest run --project native",
    };
    const { test: _test, "test:coverage": _coverage, ...withoutTests } = scripts;
    expect(await sdkScriptsHash(changed, variant)).toBe(baseline);
    expect(await sdkScriptsHash(withoutTests, variant)).toBe(baseline);
    // The unfiltered SDK input reproduces the unnecessary runtime change.
    expect(await sdkScriptsHash(changed, variant, false)).not.toBe(
      await sdkScriptsHash(scripts, variant, false),
    );
    expect(await sdkScriptsHash(scripts, variant, false)).not.toBe(baseline);
  },
);

it.each(["development", "production"])(
  "keeps %s build commands and lifecycle hooks in the SDK fingerprint",
  async (variant) => {
    const baseline = await sdkScriptsHash(scripts, variant);
    for (const name of [
      "start",
      "android",
      "ios",
      "eas-build-post-install",
      "postinstall",
      "test-build",
      "pretest",
    ] as const) {
      expect(
        await sdkScriptsHash({ ...scripts, [name]: `${scripts[name]} changed` }, variant),
        name,
      ).not.toBe(baseline);
    }
  },
);

it("keeps the real SDK runtime stable across PR API URLs without changing the manifest", async () => {
  const next = { ...base, extra: { ...base.extra, apiUrl: apiB } };
  expect(await sdkHash(base, false)).not.toBe(await sdkHash(next, false));
  expect(await sdkHash(base)).toBe(await sdkHash(next));
  expect(base.extra.apiUrl).toBe(apiA);
  expect(next.extra.apiUrl).toBe(apiB);
});

it.each([
  { ...base, android: { package: "other.app" } },
  { ...base, plugins: ["expo-camera"] },
  { ...base, updates: { ...base.updates, url: "https://u.expo.dev/other-project" } },
  { ...base, updates: { ...base.updates, requestHeaders: { "expo-channel-name": "ci-pr-22" } } },
  { ...base, extra: { ...base.extra, clerkPublishableKey: "pk_test_changed" } },
  { ...base, extra: { ...base.extra, eas: { projectId: "other-project" } } },
])("preserves other native and environment compatibility inputs", async (config) => {
  expect(await sdkHash(config)).not.toBe(await sdkHash(base));
});

it.each([
  ["production", "production"],
  ["development", "ci-pr-22"],
])("keeps %s on %s sensitive to API URL changes", async (variant, channel) => {
  const config = {
    ...base,
    extra: { ...base.extra, sentryEnvironment: variant },
    updates: { ...base.updates, requestHeaders: { "expo-channel-name": channel } },
  };
  expect(await sdkHash(config)).not.toBe(
    await sdkHash({ ...config, extra: { ...config.extra, apiUrl: apiB } }),
  );
});

it.each([
  {},
  { extra: {} },
  { extra: { sentryEnvironment: "development" } },
  { extra: { sentryEnvironment: "development" }, updates: {} },
  { extra: { sentryEnvironment: "development" }, updates: { requestHeaders: {} } },
])("preserves incomplete config instead of normalizing outside the Development lane", (config) => {
  const chunk = JSON.stringify(config);
  expect(options.fileHookTransform({ type: "contents", id: "expoConfig" }, chunk)).toBe(chunk);
});

it("passes native files, other contents and end-of-file chunks through unchanged", () => {
  const chunk = Buffer.from("native Firebase or plugin configuration");
  expect(options.fileHookTransform({ type: "file", filePath: "google-services.json" }, chunk)).toBe(
    chunk,
  );
  expect(options.fileHookTransform({ type: "contents", id: "other" }, chunk)).toBe(chunk);
  expect(options.fileHookTransform({ type: "file", filePath: "native.c" }, null)).toBeNull();
  expect(() => options.fileHookTransform({ type: "contents", id: "expoConfig" }, "{")).toThrow();
  expect(() =>
    options.fileHookTransform({ type: "contents", id: "packageJson:scripts" }, "{"),
  ).toThrow();
});
