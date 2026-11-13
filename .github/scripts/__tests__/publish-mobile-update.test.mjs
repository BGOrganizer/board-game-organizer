import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mobileBuildInputs } from "../mobile-build-inputs.mjs";
import { publishMobileUpdate } from "../publish-mobile-update.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const source = "a".repeat(40);
const runtime = "b".repeat(40);
function hbc(version = 98) {
  const data = Buffer.alloc(20);
  Buffer.from("c61fbc03c103191f", "hex").copy(data);
  data.writeUInt32LE(version, 8);
  return data;
}
function fixture(production = false, fault) {
  const folder = mkdtempSync(join(tmpdir(), "bgo-ota-test-"));
  const env = {
    OTA_ARTIFACT_DIR: folder,
    OTA_SOURCE_SHA: source,
    APP_VARIANT: production ? "production" : "development",
    EXPO_UPDATE_CHANNEL: production ? "production" : "development-pr-22",
    MOBILE_BUILD_PROFILE: "internal",
    EXPO_TOKEN: "private-expo",
    PR_NUMBER: "22",
    EXPO_PUBLIC_API_URL: production
      ? "https://api.board-game-organizer.com"
      : "https://api-development-pr-22-board-game-organizers-projects.vercel.app",
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: production ? "pk_live_fixture" : "pk_test_fixture",
    EXPO_PUBLIC_MAPTILER_API_KEY: "public-map",
    EXPO_PUBLIC_SENTRY_DSN: "public-mobile-dsn",
    EXPO_PUBLIC_VERCEL_PROTECTION_BYPASS: production ? "" : "private-bypass",
    GOOGLE_SERVICES_JSON_CONTENT: "private-firebase-json",
  };
  const apk = Buffer.from("owned APK fixture");
  const files = {
    "fixture.apk": apk,
    "apk.sha256": `${createHash("sha256").update(apk).digest("hex")}  fixture.apk\n`,
    "source-head.txt": source,
    "api-url.txt": env.EXPO_PUBLIC_API_URL,
    "update-channel.txt": env.EXPO_UPDATE_CHANNEL,
    "build-inputs.sha256": mobileBuildInputs(env),
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(folder, name), content);
  const calls = [];
  let firebaseFile;
  const run = async (tool, args, options = {}) => {
    calls.push({ tool, args, options });
    if (tool === "git")
      return fault === "checkout" || (fault === "stale-main" && args[1] === "origin/main")
        ? "c".repeat(40)
        : source;
    if (tool === "eas") {
      if (args[0] === "--version")
        return fault === "cli" ? "eas-cli/27.9.0 linux-x64" : "eas-cli/27.7.2 linux-x64";
      if (args[0] === "update" && fault === "upload") throw new Error("provider quota exhausted");
      return "{}";
    }
    if (tool === "unzip") {
      if (args[2] === "assets/fingerprint") return runtime;
      if (args[2] === "assets/index.android.bundle") return hbc();
      return JSON.stringify({
        updates: {
          checkAutomatically: fault === "policy" ? "ON_LOAD" : "NEVER",
          url: "https://u.expo.dev/f19004af-2669-49ca-8c46-2697b66841b6",
          requestHeaders: {
            "expo-channel-name": fault === "channel" ? "other" : env.EXPO_UPDATE_CHANNEL,
          },
        },
        extra: {
          apiUrl: env.EXPO_PUBLIC_API_URL,
          eas: { projectId: "f19004af-2669-49ca-8c46-2697b66841b6" },
        },
      });
    }
    assert.equal(options.env.EXPO_NO_DOTENV, "1");
    assert.equal(options.env.SENTRY_DISABLE_AUTO_UPLOAD, "true");
    assert.equal(options.env.NODE_ENV, "production");
    if (args.includes("export")) {
      if (fault === "export") throw new Error("export failed");
      if (env.GOOGLE_SERVICES_JSON_CONTENT) {
        firebaseFile = options.env.GOOGLE_SERVICES_JSON;
        assert.equal(readFileSync(firebaseFile, "utf8"), env.GOOGLE_SERVICES_JSON_CONTENT);
        assert.equal(statSync(firebaseFile).mode & 0o777, 0o600);
      } else assert.equal(options.env.GOOGLE_SERVICES_JSON, undefined);
      const dist = args[args.indexOf("--output-dir") + 1];
      mkdirSync(dist);
      writeFileSync(
        join(dist, "metadata.json"),
        JSON.stringify({ fileMetadata: { android: { bundle: "index.hbc" } } }),
      );
      writeFileSync(
        join(dist, "index.hbc"),
        fault === "javascript"
          ? Buffer.from("console.log('plain JS')")
          : hbc(fault === "bytecode" ? 99 : 98),
      );
      return "exported";
    }
    if (args.includes("runtimeversion:resolve"))
      return JSON.stringify({ runtimeVersion: fault === "runtime" ? "c".repeat(40) : runtime });
    throw new Error("Unexpected test command");
  };
  return { folder, env, calls, run, firebaseFile: () => firebaseFile };
}

for (const production of [false, true])
  test(`publishes only verified ${production ? "Production" : "Development"} Android bytecode after freshness`, async () => {
    const f = fixture(production);
    try {
      await publishMobileUpdate(f.env, {
        root,
        run: f.run,
        merged: true,
        current: () => f.calls.push({ tool: "current" }),
      });
      const update = f.calls.at(-1);
      assert.equal(update.tool, "eas");
      assert.equal(update.args[0], "update");
      assert.equal(
        update.args[update.args.indexOf("--environment") + 1],
        production ? "production" : "preview",
      );
      assert.equal(update.args[update.args.indexOf("--channel") + 1], f.env.EXPO_UPDATE_CHANNEL);
      assert(update.args.includes("--skip-bundler"));
      assert(!update.args.includes("--no-bytecode"));
      assert.equal(f.calls.at(-2).tool, "current");
      assert(!existsSync(f.firebaseFile()));
    } finally {
      rmSync(f.folder, { recursive: true, force: true });
    }
  });

test("outer command selects the pinned CLI and delegates to the merged EAS environment without publishing", async () => {
  const f = fixture();
  try {
    await publishMobileUpdate(f.env, { root, run: f.run });
    assert.deepEqual(f.calls.at(-1).args.slice(0, 2), ["env:exec", "preview"]);
    assert(f.calls.at(-1).args[2].endsWith("--merged"));
    assert(!f.calls.some((call) => call.args?.[0] === "update"));
  } finally {
    rmSync(f.folder, { recursive: true, force: true });
  }
});

test("a moving EAS CLI version cannot enter the publication environment", async () => {
  const f = fixture(false, "cli");
  try {
    await assert.rejects(publishMobileUpdate(f.env, { root, run: f.run }), /Pinned EAS CLI/);
    assert(!f.calls.some((call) => call.args?.[0] === "env:exec"));
  } finally {
    rmSync(f.folder, { recursive: true, force: true });
  }
});

test("Production rereads current main after export, and superseded releases never upload", async () => {
  for (const fault of [undefined, "stale-main"]) {
    const f = fixture(true, fault);
    try {
      const operation = publishMobileUpdate(f.env, { root, run: f.run, merged: true });
      if (fault) await assert.rejects(operation, /superseded/);
      else await operation;
      const fetchIndex = f.calls.findIndex(
        (call) => call.tool === "git" && call.args[0] === "fetch",
      );
      const runtimeIndex = f.calls.findIndex((call) =>
        call.args?.includes("runtimeversion:resolve"),
      );
      assert(fetchIndex > runtimeIndex);
      assert.equal(
        f.calls.some((call) => call.args?.[0] === "update"),
        !fault,
      );
    } finally {
      rmSync(f.folder, { recursive: true, force: true });
    }
  }
});

test("APKs without optional Firebase configuration still publish without fabricating a file", async () => {
  const f = fixture();
  try {
    f.env.GOOGLE_SERVICES_JSON_CONTENT = "";
    writeFileSync(join(f.folder, "build-inputs.sha256"), mobileBuildInputs(f.env));
    await publishMobileUpdate(f.env, { root, run: f.run, merged: true, current() {} });
    assert.equal(f.firebaseFile(), undefined);
  } finally {
    rmSync(f.folder, { recursive: true, force: true });
  }
});

for (const fault of [
  "checkout",
  "channel",
  "policy",
  "export",
  "javascript",
  "bytecode",
  "runtime",
  "stale",
  "upload",
])
  test(`${fault} fails closed and cleans temporary Firebase configuration`, async () => {
    const f = fixture(false, fault);
    try {
      await assert.rejects(
        publishMobileUpdate(f.env, {
          root,
          run: f.run,
          merged: true,
          current: () => {
            if (fault === "stale") throw new Error("superseded");
          },
        }),
      );
      if (fault !== "upload") assert(!f.calls.some((call) => call.args?.[0] === "update"));
      if (f.firebaseFile()) assert(!existsSync(f.firebaseFile()));
    } finally {
      rmSync(f.folder, { recursive: true, force: true });
    }
  });

for (const file of [
  "fixture.apk",
  "apk.sha256",
  "source-head.txt",
  "api-url.txt",
  "update-channel.txt",
  "build-inputs.sha256",
])
  test(`modified ${file} prevents all EAS upload/export operations`, async () => {
    const f = fixture();
    try {
      writeFileSync(join(f.folder, file), "tampered");
      await assert.rejects(publishMobileUpdate(f.env, { root, run: f.run, merged: true }));
      assert(!f.calls.some((call) => call.tool === "eas" || call.tool === process.execPath));
    } finally {
      rmSync(f.folder, { recursive: true, force: true });
    }
  });

test("environment drift, a CI channel and cross-environment keys cannot publish", async () => {
  const f = fixture();
  try {
    for (const change of [
      { EXPO_UPDATE_CHANNEL: "ci-pr-22" },
      { APP_VARIANT: "production" },
      { EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture" },
      { EXPO_PUBLIC_MAPTILER_API_KEY: "changed-on-EAS" },
      { EXPO_PUBLIC_API_URL: "https://api.board-game-organizer.com" },
    ])
      await assert.rejects(
        publishMobileUpdate({ ...f.env, ...change }, { root, run: f.run, merged: true }),
      );
    assert(!f.calls.some((call) => call.tool === "eas"));
  } finally {
    rmSync(f.folder, { recursive: true, force: true });
  }
});
