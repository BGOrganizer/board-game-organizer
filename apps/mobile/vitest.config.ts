import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
      // ponytail: RN components cannot be unit-tested under vitest — RN 0.86
      // ships CJS with Flow syntax, and node's native CJS loader bypasses the
      // Vite transform pipeline (jest-expo is the official path for that, but
      // would add a second test framework for one app). Mobile UI behaviour is
      // covered by retained Maestro flows under the current CI acceptance policy;
      // unit coverage here targets pure logic, not native frame/touch evidence.
      include: [
        "app.config.js",
        "fingerprint.config.js",
        "src/lib/**",
        "src/hooks/**",
        "src/store/**",
      ],
      thresholds: {
        "{fingerprint.config.js,src/lib/otaUpdates.ts,src/lib/appRestartGuard.ts}": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "app.config.js": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/{inputScrollOffset,artworkLayout}.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/navigationColors.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/locations/map-location.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/events/goBackFromEventWizard.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/locations/user-location.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/useOptionalHeaderHeight.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/useFloatingActionLayout.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/user-list.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/floating-actions.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
        "src/lib/cache/queryPersistence.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/cache/mobileQueryStorage.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/startup.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/contacts/unregisteredContacts.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/contacts/contacts.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/notifications/push-notifications.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/contacts/user-actions.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
