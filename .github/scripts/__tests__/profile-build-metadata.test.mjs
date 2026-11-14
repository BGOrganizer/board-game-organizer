import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

test("APK labels use the verified checkout and distinguish PR production APKs from Main releases", () => {
  const action = parse(readFileSync(".github/actions/mobile-build/action.yml", "utf8"));
  const build = action.runs.steps.find((step) => step.name.includes("APK (eas build"));
  assert.equal(
    build.env.EXPO_PUBLIC_APP_PRERELEASE,
    "${{ github.ref != 'refs/heads/main' && 'true' || 'false' }}",
  );
  assert.match(build.run, /export EXPO_PUBLIC_BUILD_SHA="\$\(git rev-parse HEAD\)"/);
  assert(
    build.run.indexOf("export EXPO_PUBLIC_BUILD_SHA") <
      build.run.indexOf("node ../../.github/scripts/mobile-build-environment.mjs"),
  );
});

test("profile build metadata is JavaScript-only, without changing the native Expo configuration", () => {
  const config = readFileSync("apps/mobile/app.config.js", "utf8");
  assert(!config.includes("EXPO_PUBLIC_BUILD_SHA"));
  assert(!config.includes("EXPO_PUBLIC_APP_PRERELEASE"));
  const web = readFileSync("apps/web/next.config.ts", "utf8");
  assert.match(
    web,
    /NEXT_PUBLIC_BUILD_SHA:[\s\S]*?process.env.NEXT_PUBLIC_BUILD_SHA\s*\?\?\s*process.env.VERCEL_GIT_COMMIT_SHA/,
  );
  const deploy = parse(readFileSync(".github/actions/vercel-deploy/action.yml", "utf8"));
  const step = deploy.runs.steps.find((step) => step.id === "deploy");
  assert.match(step.run, /if \[ "\$APP_PATH" = 'apps\/web' \]/);
  assert.match(step.run, /build_sha="\$\(git rev-parse HEAD\)"/);
  assert.match(step.run, /flags\+=\(--build-env "NEXT_PUBLIC_BUILD_SHA=\$build_sha"\)/);
  assert.match(step.run, /test "\$key" != 'NEXT_PUBLIC_BUILD_SHA'/);
});
