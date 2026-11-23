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
      reporter: ["lcov", "text", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.d.ts"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        "src/developmentGateway.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/server.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
