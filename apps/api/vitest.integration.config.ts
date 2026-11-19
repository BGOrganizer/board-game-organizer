import { fileURLToPath } from "node:url";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

// Integration tests: run against real containers (testcontainers).
// Docker is required on the runner (available on GitHub-hosted runners).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    // Provider-backed cases install their own mocks; never inherit a local BGG credential.
    env: { BGG_TOKEN: "" },
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      include: ["src/**/*.{js,cjs,mjs,ts,cts,mts,tsx,jsx}"],
      // API-hosted invitation UI is exercised and 90%-gated by the web jsdom suite.
      // An unexecuted Node report otherwise invents misses for erased types/imports.
      exclude: [...coverageConfigDefaults.exclude, "src/app/invite/**"],
      reporter: [
        ["lcov", { projectRoot: fileURLToPath(new URL("../..", import.meta.url)) }],
        "html",
        "text",
        "json",
        "json-summary",
      ],
    },
  },
});
