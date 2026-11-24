import { fileURLToPath } from "node:url";
import { configDefaults, coverageConfigDefaults, defineConfig } from "vitest/config";

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
    projects: [
      {
        extends: true,
        test: {
          name: "logic",
          exclude: [...configDefaults.exclude, "**/*.native.test.tsx", "performance/**"],
        },
      },
      "./vitest.native.config.mts",
    ],
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      reporter: [
        ["lcov", { projectRoot: fileURLToPath(new URL("../..", import.meta.url)) }],
        "html",
        "text",
        "json",
        "json-summary",
      ],
      // Both logic and actual native component projects contribute to this source-wide report.
      // JavaScript coverage and React benchmarks do not prove Android frame timing.
      include: [
        "index.js",
        "src/**/*.{ts,tsx,js,jsx}",
        "src/app/+native-intent.tsx",
        "app.config.js",
        "fingerprint.config.js",
        "src/lib/**",
        "src/hooks/**",
        "src/store/**",
        "src/components/common/ui/RetainedTabPanel.tsx",
      ],
      // Test providers and private fixtures have no application callers. Runtime components stay included.
      exclude: [
        ...coverageConfigDefaults.exclude,
        "src/test/**",
        "**/__tests__/**",
        "**/*.{test,spec}.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
      ],
      thresholds: {
        "index.js": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "{src/lib/listActivity.ts,src/components/common/ui/RetainedTabPanel.tsx}": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/contacts/useContactTab.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/tabBarGeometry.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/app/+native-intent.tsx": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "{fingerprint.config.js,src/lib/otaUpdates.ts,src/lib/appRestartGuard.ts}": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "app.config.js": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/{inputScrollOffset,artworkLayout,resourceArtworkLayers,resourceArtworkFrames,resourceArtworkMotion}.ts":
          {
            lines: 93,
            functions: 93,
            branches: 93,
            statements: 93,
          },
        "src/lib/navigationColors.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/locations/map-location.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/events/goBackFromEventWizard.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/locations/user-location.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/useOptionalHeaderHeight.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/useFloatingActionLayout.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/user-list.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/floating-actions.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        lines: 98,
        functions: 98,
        branches: 98,
        statements: 98,
        "src/lib/cache/queryPersistence.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/cache/mobileQueryStorage.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/inviteLinks.ts": { lines: 93, functions: 93, branches: 93, statements: 93 },
        "src/lib/startup.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/contacts/unregisteredContacts.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/contacts/contacts.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/notifications/push-notifications.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/lib/contacts/user-actions.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
      },
    },
  },
});
