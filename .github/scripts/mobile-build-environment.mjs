import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Keep Development's fingerprinted eas.json intact; Production APK and OTA use identical config. */
export async function withProductionBuildEnvironment(project, env, run) {
  if (env.APP_VARIANT !== "production") return run();
  if (env.MOBILE_BUILD_PROFILE !== "internal")
    throw new Error("Production APK environment requires the internal profile");
  const path = join(project, "eas.json");
  const original = readFileSync(path);
  const config = JSON.parse(original.toString());
  const profile = config.build?.internal;
  if (!profile || typeof profile !== "object" || Array.isArray(profile))
    throw new Error("The internal APK build profile is required");
  profile.environment = "production";
  try {
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    return await run();
  } finally {
    writeFileSync(path, original);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await withProductionBuildEnvironment(process.cwd(), process.env, () => {
      const result = spawnSync("eas", ["build", ...process.argv.slice(2)], {
        stdio: "inherit",
        env: process.env,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error("Local APK build failed");
    });
  } catch {
    console.error("APK build failed; Production environment selection remains mandatory.");
    process.exitCode = 1;
  }
}
