import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("web Sentry environment follows the deployment target, not production compilation", () => {
  const url = new URL("../../../apps/web/next.config.ts", import.meta.url).href;
  for (const [platform, expected] of [
    ["preview", "development"],
    ["production", "production"],
    ["", "development"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const {default:config}=await import(${JSON.stringify(url)});console.log(config.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT);`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
          VERCEL: "",
          VERCEL_ENV: platform,
          NEXT_PUBLIC_SENTRY_ENVIRONMENT: "ignored-stale-value",
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
});
