import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
      reporter: ["lcov", "html", "text"],
    },
  },
});
