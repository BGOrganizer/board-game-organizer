import { fileURLToPath } from "node:url";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    lingui(),
    // Applies the Lingui macro transform (t / Trans / useLingui) in tests.
    babel({ presets: [linguiTransformerBabelPreset()] }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  esbuild: {
    // Automatic JSX runtime (no React in scope needed), like @vitejs/plugin-react.
    jsx: "automatic",
  },
  // The shared LinguiJS catalogs live at the repo root (../.. from apps/web):
  // allow Vite to serve/import them in tests.
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // E2E specs (Playwright) live in ./e2e — keep them out of unit tests.
    exclude: ["e2e/**", "node_modules/**", "dist/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["lcov", "html", "text"],
      // Entry points / tooling files are not unit-tested (configs, E2E setup).
      exclude: [
        "e2e/**",
        "next.config.ts",
        "playwright.config.ts",
        "postcss.config.mjs",
        ".next/**",
        "coverage/**",
        "**/__tests__/**",
        "**/*.test.*",
        "test-utils.tsx",
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
});
