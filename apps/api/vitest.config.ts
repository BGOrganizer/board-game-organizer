import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Integration tests (testcontainers) run separately via
    // `pnpm test:integration` (vitest.integration.config.ts).
    exclude: ["test/integration/**", "node_modules/**", "dist/**", ".next/**"],
  },
});
