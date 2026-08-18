import { fileURLToPath } from "node:url";
import lingui from "@lingui/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [lingui()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // The shared LinguiJS catalogs live at the repo root (../.. from apps/mobile):
  // allow Vite to serve/import them in tests.
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["lcov", "html", "text"],
      // ponytail: RN components cannot be unit-tested under vitest — RN 0.85
      // ships CJS with Flow syntax, and node's native CJS loader bypasses the
      // Vite transform pipeline (jest-expo is the official path for that, but
      // would add a second test framework for one app). Mobile UI behaviour is
      // covered by the Maestro E2E flows in pr-ci/main-ci; unit coverage here
      // targets the pure logic (i18n, and Phase 3: hooks/store/schemas).
      include: ["src/lib/**", "src/hooks/**", "src/store/**"],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
});
