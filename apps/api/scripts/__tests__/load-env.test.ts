import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const apiDirectory = fileURLToPath(new URL("../../", import.meta.url));
const loaderPath = join(apiDirectory, "scripts/load-env.ts");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each([
  { mode: "development", local: false, exported: false, expected: "base" },
  { mode: "development", local: true, exported: false, expected: "local" },
  { mode: "production", local: true, exported: false, expected: "production-local" },
  { mode: "development", local: true, exported: true, expected: "exported" },
] as const)(
  "loads env files: $mode, local=$local, exported=$exported",
  ({ mode, local, exported, expected }) => {
    const directory = mkdtempSync(join(tmpdir(), "bgo-script-env-"));
    directories.push(directory);
    writeFileSync(join(directory, ".env"), "MONGODB_URI=mongodb://base\nMONGODB_DB_NAME=fixture\n");
    if (local) writeFileSync(join(directory, ".env.local"), "MONGODB_URI=mongodb://local\n");
    writeFileSync(
      join(directory, ".env.production.local"),
      "MONGODB_URI=mongodb://production-local\n",
    );

    // A fresh process avoids @next/env's process-wide cache and never connects to MongoDB.
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: mode };
    delete env.__NEXT_PROCESSED_ENV;
    delete env.MONGODB_URI;
    delete env.MONGODB_DB_NAME;
    if (exported) env.MONGODB_URI = "mongodb://exported";
    const result = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--eval",
        `const { loadApiEnv } = require(${JSON.stringify(loaderPath)});
       loadApiEnv(${JSON.stringify(directory)});
       process.stdout.write(JSON.stringify({ uri: process.env.MONGODB_URI, db: process.env.MONGODB_DB_NAME }));`,
      ],
      { cwd: apiDirectory, env, encoding: "utf8" },
    );
    expect(JSON.parse(result)).toEqual({ uri: `mongodb://${expected}`, db: "fixture" });
  },
);
