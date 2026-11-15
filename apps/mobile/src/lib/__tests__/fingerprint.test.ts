import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const options = require("../../../fingerprint.config.js");
const { getExpoConfigSourcesAsync } = require("@expo/fingerprint/build/sourcer/Expo");
const { createContentsHashResultsAsync } = require("@expo/fingerprint/build/hash/Hash");
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
});
