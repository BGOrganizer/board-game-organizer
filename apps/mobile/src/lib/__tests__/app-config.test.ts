import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
it("ignores version labels while preserving the SDK default fingerprint script filter", () => {
  expect(require("../../../fingerprint.config.js")).toEqual({
    sourceSkips: ["ExpoConfigVersions", "PackageJsonAndroidAndIosScriptsIfNotContainRun"],
  });
});
const configPath = require.resolve("../../../app.config.js");
let folder: string;
function config() {
  delete require.cache[configPath];
  return require(configPath).expo;
}
function firebase(value: unknown) {
  const file = join(folder, "firebase.json");
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  vi.stubEnv("GOOGLE_SERVICES_JSON", file);
}
const client = (packageName: string) => ({
  client_info: { android_client_info: { package_name: packageName } },
});

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "bgo-app-config-"));
  vi.stubEnv("APP_VARIANT", undefined);
  vi.stubEnv("EXPO_UPDATE_CHANNEL", undefined);
  vi.stubEnv("GOOGLE_SERVICES_JSON", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete require.cache[configPath];
  rmSync(folder, { recursive: true, force: true });
});

it.each([undefined, "development", "production"])(
  "selects Android identity and localized names for %s without changing iOS identity",
  (variant) => {
    vi.stubEnv("APP_VARIANT", variant);
    const development = variant !== "production";
    const result = config();
    expect(result.extra.sentryEnvironment).toBe(variant ?? "development");
    expect(result.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(result.updates).toEqual({
      url: "https://u.expo.dev/f19004af-2669-49ca-8c46-2697b66841b6",
      requestHeaders: { "expo-channel-name": variant ?? "development" },
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
    });
    expect(result.android.package).toBe(
      development ? "com.bgo.boardgameorganizer.dev" : "com.bgo.boardgameorganizer",
    );
    expect(result.android.scheme).toBe(development ? "bgo-dev" : "bgo");
    expect(result.scheme).toBeUndefined();
    expect(result.ios.bundleIdentifier).toBe("com.bgo.mobile");
    expect(result.ios.scheme).toBe("bgo");
    expect(result.ios.infoPlist.CFBundleDisplayName).toBe("Board Game Organizer");
    expect(result.android.googleServicesFile).toBeUndefined();
    expect(result.name).toBe(development ? "Board Game Organizer Dev" : "Board Game Organizer");
    expect(result.locales.en.android.app_name).toBe(result.name);
    expect(result.locales.it.android.app_name).toBe(
      development ? "Board Game Organizer Sviluppo" : "Board Game Organizer",
    );
    expect(result.locales.it.ios.NSCameraUsageDescription).toContain("Scatta");
    expect(result.extra.eas.projectId).toBe("f19004af-2669-49ca-8c46-2697b66841b6");
  },
);

it.each([
  ["development", "development"],
  ["development", "ci-pr-42"],
  ["development", "development-pr-42"],
  ["production", "production"],
])("embeds only the selected %s OTA channel %s", (variant, channel) => {
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("EXPO_UPDATE_CHANNEL", channel);
  expect(config().updates.requestHeaders["expo-channel-name"]).toBe(channel);
});

it.each([
  ["production", "development"],
  ["production", "ci-pr-42"],
  ["production", "development-pr-42"],
  ["production", ""],
  ["development", "production"],
  ["development", ""],
  ["development", "internal"],
  ["development", "development-pr-0"],
  ["development", "ci-pr-01"],
  ["development", "ci-pr--1"],
  ["development", "development-pr-42\nGH_TOKEN=private-sentinel"],
])("rejects a channel outside the %s lane without exposing its value", (variant, channel) => {
  vi.stubEnv("APP_VARIANT", variant);
  vi.stubEnv("EXPO_UPDATE_CHANNEL", channel);
  expect(config).toThrow("EXPO_UPDATE_CHANNEL must match APP_VARIANT and a supported channel");
});

it.each(["", "staging", "Production"])("rejects an unknown variant %s", (variant) => {
  vi.stubEnv("APP_VARIANT", variant);
  expect(config).toThrow("APP_VARIANT must be development or production");
});

it.each(["development", "production"])(
  "accepts only a matching Firebase client for %s",
  (variant) => {
    vi.stubEnv("APP_VARIANT", variant);
    firebase({
      client: [
        client(
          variant === "development"
            ? "com.bgo.boardgameorganizer.dev"
            : "com.bgo.boardgameorganizer",
        ),
      ],
    });
    expect(config().android.googleServicesFile).toBe(join(folder, "firebase.json"));
  },
);

it.each([
  {},
  { client: null },
  { client: [] },
  { client: [null, {}, { client_info: {} }, { client_info: { android_client_info: {} } }] },
  { client: [client("com.bgo.boardgameorganizer")] },
])("rejects missing, malformed or other-variant Firebase clients", (value) => {
  firebase(value);
  expect(config).toThrow("GOOGLE_SERVICES_JSON does not match the selected Android app variant");
});

it("selects the matching client in a multi-app Firebase configuration", () => {
  firebase({ client: [client("other.app"), client("com.bgo.boardgameorganizer.dev")] });
  expect(config().android.package).toBe("com.bgo.boardgameorganizer.dev");
});

it.each(["{private-sentinel", "null"])("does not disclose invalid Firebase JSON", (value) => {
  firebase(value);
  expect(config).toThrow("Cannot read GOOGLE_SERVICES_JSON as a Firebase app configuration");
});

it("rejects unreadable Firebase files without printing file contents", () => {
  vi.stubEnv("GOOGLE_SERVICES_JSON", join(folder, "missing.json"));
  expect(config).toThrow("Cannot read GOOGLE_SERVICES_JSON as a Firebase app configuration");
});
