import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireCurrentPr } from "./ci-current-pr.mjs";
import { requireClerkTarget } from "./clerk-target.mjs";
import { developmentApiUrl } from "./development-api-alias.mjs";
import { mobileBuildInputs } from "./mobile-build-inputs.mjs";

function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: options.binary ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
    cwd: options.cwd,
    env: options.env,
  });
  if (result.status !== 0) throw new Error(`OTA ${basename(executable)} command failed`);
  return result.stdout;
}

function bytecodeVersion(value) {
  const buffer = Buffer.from(value);
  if (buffer.length < 12 || buffer.subarray(0, 8).toString("hex") !== "c61fbc03c103191f")
    throw new Error("Verified Hermes bytecode required");
  return buffer.readUInt32LE(8);
}

export async function publishMobileUpdate(
  env,
  { root = process.cwd(), run = command, merged = false, current } = {},
) {
  const production = env.APP_VARIANT === "production";
  const channel = env.EXPO_UPDATE_CHANNEL;
  const source = env.OTA_SOURCE_SHA;
  if (
    !["production", "development"].includes(env.APP_VARIANT) ||
    !/^[a-f0-9]{40}$/.test(source ?? "") ||
    !env.EXPO_TOKEN ||
    env.MOBILE_BUILD_PROFILE !== "internal" ||
    (production
      ? channel !== "production" ||
        env.EXPO_PUBLIC_API_URL !== "https://api.board-game-organizer.com"
      : channel !== "development" || env.EXPO_PUBLIC_API_URL !== developmentApiUrl(env.PR_NUMBER))
  )
    throw new Error("Verified OTA publication target required");
  requireClerkTarget(
    production ? "production" : "preview",
    env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    "pk",
  );
  if (String(await run("git", ["rev-parse", "HEAD"], { cwd: root })).trim() !== source)
    throw new Error("OTA checkout does not match its verified source");
  const artifact = resolve(env.OTA_ARTIFACT_DIR);
  const text = (name) => readFileSync(join(artifact, name), "utf8").trim();
  const names = readdirSync(artifact).filter((name) => name.endsWith(".apk"));
  const checksum = text("apk.sha256").match(/^([a-f0-9]{64}) [ *]([^/\\]+\.apk)$/);
  if (
    names.length !== 1 ||
    !checksum ||
    checksum[2] !== names[0] ||
    text("source-head.txt") !== source ||
    text("api-url.txt") !== env.EXPO_PUBLIC_API_URL ||
    text("update-channel.txt") !== channel ||
    text("build-inputs.sha256") !== mobileBuildInputs(env)
  )
    throw new Error("OTA APK provenance/configuration mismatch");
  const apk = join(artifact, names[0]);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(apk)) hash.update(chunk);
  if (hash.digest("hex") !== checksum[1]) throw new Error("OTA APK checksum mismatch");
  const project = join(root, "apps/mobile");
  const environment = production ? "production" : "preview";
  const childEnv = {
    ...env,
    NODE_ENV: "production",
    EXPO_NO_DOTENV: "1",
    SENTRY_DISABLE_AUTO_UPLOAD: "true",
  };
  if (!merged) {
    if (
      !String(await run("eas", ["--version"], { cwd: project, env: childEnv })).includes(
        "eas-cli/27.7.2 ",
      )
    )
      throw new Error("Pinned EAS CLI 27.7.2 required");
    const script = join(root, ".github/scripts/publish-mobile-update.mjs");
    const quoted = `'${script.replaceAll("'", "'\\''")}'`;
    await run("eas", ["env:exec", environment, `node ${quoted} --merged`, "--non-interactive"], {
      cwd: project,
      env: childEnv,
    });
    return;
  }
  const readApk = (name, binary = false) => run("unzip", ["-p", apk, `assets/${name}`], { binary });
  const runtime = String(await readApk("fingerprint")).trim();
  const config = JSON.parse(String(await readApk("app.config")));
  if (
    !/^[a-f0-9]{40}$/.test(runtime) ||
    config.updates?.checkAutomatically !== "NEVER" ||
    config.updates?.requestHeaders?.["expo-channel-name"] !== channel ||
    config.updates?.url !== "https://u.expo.dev/f19004af-2669-49ca-8c46-2697b66841b6" ||
    config.extra?.eas?.projectId !== "f19004af-2669-49ca-8c46-2697b66841b6" ||
    config.extra?.apiUrl !== env.EXPO_PUBLIC_API_URL
  )
    throw new Error("OTA APK project/channel/runtime mismatch");
  const expectedBytecode = bytecodeVersion(await readApk("index.android.bundle", true));
  const folder = mkdtempSync(join(tmpdir(), "bgo-ota-publication-"));
  try {
    if (env.GOOGLE_SERVICES_JSON_CONTENT) {
      childEnv.GOOGLE_SERVICES_JSON = join(folder, "google-services.json");
      writeFileSync(childEnv.GOOGLE_SERVICES_JSON, env.GOOGLE_SERVICES_JSON_CONTENT, {
        mode: 0o600,
      });
    }
    const require = createRequire(join(project, "package.json"));
    const dist = join(folder, "dist");
    await run(
      process.execPath,
      [
        require.resolve("expo/bin/cli"),
        "export",
        "--platform",
        "android",
        "--output-dir",
        dist,
        "--dump-assetmap",
        "--source-maps",
        "--clear",
      ],
      {
        cwd: project,
        env: childEnv,
      },
    );
    const metadata = JSON.parse(readFileSync(join(dist, "metadata.json"), "utf8"));
    const bundlePath = metadata.fileMetadata?.android?.bundle;
    if (typeof bundlePath !== "string" || !resolve(dist, bundlePath).startsWith(`${dist}/`))
      throw new Error("OTA Android bundle metadata required");
    if (bytecodeVersion(readFileSync(join(dist, bundlePath))) !== expectedBytecode)
      throw new Error("OTA Hermes bytecode/runtime mismatch");
    const resolvedRuntime = JSON.parse(
      String(
        await run(
          process.execPath,
          [
            require.resolve("expo-updates/bin/cli.js"),
            "runtimeversion:resolve",
            "--platform",
            "android",
            "--workflow",
            "managed",
          ],
          { cwd: project, env: childEnv },
        ),
      ),
    );
    if (resolvedRuntime.runtimeVersion !== runtime) throw new Error("OTA native runtime mismatch");
    if (current) await current();
    else if (production) {
      await run("git", ["fetch", "--no-tags", "origin", "main"], { cwd: root, env: childEnv });
      if (String(await run("git", ["rev-parse", "origin/main"], { cwd: root })).trim() !== source)
        throw new Error("Production release superseded before OTA publication");
    } else {
      await requireCurrentPr({
        repository: env.GITHUB_REPOSITORY,
        number: env.PR_NUMBER,
        headSha: env.PR_HEAD_SHA,
        token: env.GH_TOKEN,
        runId: env.GITHUB_RUN_ID,
        attempt: env.GITHUB_RUN_ATTEMPT,
      });
    }
    // EAS configuration must stay unchanged during this step: the CLI rereads its environment.
    await run(
      "eas",
      [
        "update",
        "--skip-bundler",
        "--input-dir",
        dist,
        "--platform",
        "android",
        "--channel",
        channel,
        "--environment",
        environment,
        "--message",
        `CI ${source}`,
        "--non-interactive",
        "--json",
      ],
      { cwd: project, env: childEnv },
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    await publishMobileUpdate(process.env, { root, merged: process.argv.includes("--merged") });
    console.log("Verified Android OTA publication completed.");
  } catch {
    console.error("OTA publication failed; build/configuration/runtime checks remain mandatory.");
    process.exitCode = 1;
  }
}
