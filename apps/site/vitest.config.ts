import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    maxWorkers: 1,
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/__tests__/**"],
      reporter: ["text", "json", "json-summary", "lcov"],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 98,
        statements: 98,
        "src/lib/links.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
