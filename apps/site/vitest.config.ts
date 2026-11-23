import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    maxWorkers: 1,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**"],
      reporter: [
        "text",
        "json-summary",
        ["lcov", { projectRoot: fileURLToPath(new URL("../..", import.meta.url)) }],
      ],
      thresholds: {
        lines: 93,
        functions: 93,
        branches: 93,
        statements: 93,
        "src/lib/links.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
