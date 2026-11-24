import { fileURLToPath } from "node:url";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [lingui(), babel({ presets: [linguiTransformerBabelPreset()] })],
  resolve: { alias: { "@": fileURLToPath(new URL("../web/src", import.meta.url)) } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      reporter: [
        ["lcov", { projectRoot: fileURLToPath(new URL("../..", import.meta.url)) }],
        "text",
        "json",
        "json-summary",
      ],
      include: ["src/**/*.{ts,tsx}", "development-gateway.mts", "netlify-gateway.mts"],
      exclude: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.d.ts"],
      thresholds: {
        lines: 98,
        functions: 98,
        branches: 98,
        statements: 98,
        "development-gateway.mts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "netlify-gateway.mts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/developmentGateway.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/server.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/ui/widgetRoutes.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
