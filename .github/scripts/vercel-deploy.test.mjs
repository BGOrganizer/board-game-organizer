import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const action = parse(readFileSync(".github/actions/vercel-deploy/action.yml", "utf8"));
const deploy = action.runs.steps.find((step) => step.id === "deploy");

test("remote deployment preserves quoted build/runtime overrides without changing project Secrets", () => {
  const folder = mkdtempSync(join(tmpdir(), "bgo-vercel-source-"));
  const argsFile = join(folder, "args").replaceAll("\\", "/");
  try {
    const run = (overrides = {}) =>
      spawnSync(
        "bash",
        [
          "-c",
          `
      vercel() { printf '%s\\0' "$@" > "$ARGS_FILE"; echo 'https://api-test.vercel.app'; }
      ${deploy.run}`,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            VERCEL_TOKEN: "test-token",
            VERCEL_ENVIRONMENT: "preview",
            PRODUCTION: "false",
            APP_PATH: "apps/api",
            CI_DB_NAME: "bgo_ci_12_1",
            EXTRA_ENV: "",
            ARGS_FILE: argsFile,
            GITHUB_OUTPUT: join(folder, "output").replaceAll("\\", "/"),
            ...overrides,
          },
        },
      );
    const extra =
      'NEXT_PUBLIC_API_URL=https://api-test.vercel.app?token=one=two&other=$literal\nNEXT_PUBLIC_VERCEL_PROTECTION_BYPASS=quotes" spaces';
    let result = run({ EXTRA_ENV: extra });
    assert.equal(result.status, 0, result.stderr);
    let args = readFileSync(argsFile, "utf8").split("\0").filter(Boolean);
    assert.deepEqual(args, [
      "deploy",
      "--yes",
      "--token",
      "test-token",
      "--build-env",
      "BGO_CI_DB_NAME=bgo_ci_12_1",
      "--env",
      "MONGODB_DB_NAME=bgo_ci_12_1",
      ...extra.split("\n").flatMap((value) => ["--build-env", value, "--env", value]),
    ]);
    assert.doesNotMatch(
      JSON.stringify(action.runs.steps),
      /vercel pull|vercel build|--prebuilt|vercel env (?:add|update|rm)/,
    );
    for (const overrides of [
      { CI_DB_NAME: "board-game-organizer" },
      { CI_DB_NAME: "bgo_ci_0_1" },
      { CI_DB_NAME: "bgo_ci_12_0" },
      { CI_DB_NAME: "bgo_ci_12_1;echo unsafe" },
      { APP_PATH: "apps/web" },
      { PRODUCTION: "true", VERCEL_ENVIRONMENT: "production" },
      { PRODUCTION: "false", VERCEL_ENVIRONMENT: "production" },
      { EXTRA_ENV: "MONGODB_DB_NAME=another-database" },
      { EXTRA_ENV: "BGO_CI_DB_NAME=bgo_ci_12_2" },
      { EXTRA_ENV: "NEXT_PUBLIC_API_URL=" },
      { EXTRA_ENV: "NEXT_PUBLIC_API_URL=[SENSITIVE]" },
      { EXTRA_ENV: "not-an-env-assignment" },
    ])
      assert.notEqual(run(overrides).status, 0, JSON.stringify(overrides));
    result = run({
      CI_DB_NAME: "",
      PRODUCTION: "true",
      VERCEL_ENVIRONMENT: "production",
      EXTRA_ENV: "NEXT_PUBLIC_API_URL=https://api.board-game-organizer.com",
    });
    assert.equal(result.status, 0, result.stderr);
    args = readFileSync(argsFile, "utf8").split("\0").filter(Boolean);
    assert.ok(args.includes("--prod"));
    assert.ok(!args.some((arg) => /BGO_CI_DB_NAME|MONGODB_DB_NAME/.test(arg)));
    assert.equal(
      run({ CI_DB_NAME: "" }).status,
      0,
      "Development API keeps Infisical's database without overrides",
    );
    assert.notEqual(
      spawnSync("bash", ["-c", `vercel() { return 42; }; ${deploy.run}`], {
        env: {
          ...process.env,
          VERCEL_TOKEN: "test-token",
          VERCEL_ENVIRONMENT: "preview",
          PRODUCTION: "false",
          APP_PATH: "apps/api",
          CI_DB_NAME: "",
          EXTRA_ENV: "",
        },
      }).status,
      0,
      "Remote build/deploy failure must propagate",
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("remote API build validates real base DB and webhook routing before switching to isolated DB", () => {
  const url = new URL("../../apps/api/next.config.ts", import.meta.url).href;
  const run = (overrides = {}) =>
    spawnSync(
      process.execPath,
      [
        "-e",
        `
    await import(${JSON.stringify(url)});
    if (process.env.BGO_CI_DB_NAME) throw new Error('Build override must be consumed before child workers');
    await import(${JSON.stringify(`${url}?worker`)});
    console.log(process.env.MONGODB_DB_NAME);
  `,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          VERCEL_ENV: "preview",
          BGO_CI_DB_NAME: "bgo_ci_12_1",
          MONGODB_DB_NAME: "bgo_dev",
          CLERK_WEBHOOK_DB_NAME: "bgo_dev",
          ...overrides,
        },
      },
    );
  const valid = run();
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout.trim(), "bgo_ci_12_1");
  for (const overrides of [
    { VERCEL_ENV: "production" },
    { BGO_CI_DB_NAME: "bgo_ci_0_1" },
    { BGO_CI_DB_NAME: "board-game-organizer" },
    { MONGODB_DB_NAME: "", CLERK_WEBHOOK_DB_NAME: "" },
    { MONGODB_DB_NAME: "[SENSITIVE]", CLERK_WEBHOOK_DB_NAME: "[SENSITIVE]" },
    { MONGODB_DB_NAME: "bgo_ci_12_1", CLERK_WEBHOOK_DB_NAME: "bgo_ci_12_1" },
    { CLERK_WEBHOOK_DB_NAME: "" },
    { CLERK_WEBHOOK_DB_NAME: "bgo_other" },
  ]) {
    const result = run(overrides);
    assert.notEqual(result.status, 0, JSON.stringify(overrides));
    assert.match(
      result.stderr,
      /CI database overrides require|Preview CLERK_WEBHOOK_DB_NAME must match/,
    );
    assert.equal(result.stdout, "");
  }
  const unchanged = run({ BGO_CI_DB_NAME: "" });
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.equal(unchanged.stdout.trim(), "bgo_dev");
});
