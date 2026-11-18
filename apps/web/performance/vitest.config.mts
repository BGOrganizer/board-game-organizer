import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import webConfig from "../vitest.config";

export default mergeConfig(
  webConfig,
  defineConfig({
    root: fileURLToPath(new URL("..", import.meta.url)),
    test: {
      include: ["performance/**/*.perf.tsx"],
      globalSetup: ["./performance/global-setup.ts"],
      env: {
        REASSURE_OUTPUT_FILE: fileURLToPath(new URL("../.reassure/current.perf", import.meta.url)),
      },
      pool: "forks",
      setupFiles: ["../../scripts/performance/verify-worker.mjs"],
      execArgv: [
        "--expose-gc",
        "--no-concurrent-sweeping",
        "--max-old-space-size=1024",
        "--max-opt=1",
      ],
      maxWorkers: 1,
      fileParallelism: false,
      testTimeout: 60000,
      coverage: { enabled: false },
    },
  }),
);
