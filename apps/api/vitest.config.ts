import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // Integration tests (testcontainers) run separately via
    // `pnpm test:integration` (vitest.integration.config.ts).
    exclude: ["test/integration/**", "node_modules/**", "dist/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["lcov", "html", "text"],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
        "src/app/api/{blocks,follows,friend-requests,friends,relationships}/**/*.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/app/api/{notifications,push-subscriptions}/**/*.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/app/api/{matches,match-invitations}/**/*.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/app/api/users/search/route.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/app/api/{admin/sync-user,contacts/sync,webhooks/clerk}/route.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/app/lib/{migrate,users.repository}.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/app/lib/{blocks,boardGames.repository,enrichUsers,match-invitations.repository,match.http,match.service,matches.repository,relationship.http,relationship.repository,relationship.service}.ts":
          {
            lines: 100,
            functions: 100,
            branches: 100,
            statements: 100,
          },
      },
    },
  },
});
