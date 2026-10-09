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
      allowExternal: true,
      include: [
        ...[
          "common/hooks/useListSearch.ts",
          "organizations/hooks/useOrganizationPeople.ts",
          "organizations/hooks/useOrganizationSocialActions.ts",
          "events/hooks/useEvents.ts",
          "events/hooks/useEventWindow.ts",
          "groups/hooks/usePublicGroups.ts",
        ].map((file) =>
          fileURLToPath(new URL(`../../packages/shared/src/${file}`, import.meta.url)).replaceAll(
            "\\",
            "/",
          ),
        ),
        fileURLToPath(
          new URL(
            "../../packages/shared/src/organizations/hooks/useOrganizations.ts",
            import.meta.url,
          ),
        ).replaceAll("\\", "/"),
        fileURLToPath(new URL("./src/**/*.{ts,tsx}", import.meta.url)).replaceAll("\\", "/"),
        fileURLToPath(
          new URL(
            "../../packages/shared/src/locations/hooks/useFavoriteLocations.ts",
            import.meta.url,
          ),
        ).replaceAll("\\", "/"),
        fileURLToPath(
          new URL(
            "../../packages/shared/src/locations/hooks/useCurrentLocationAddress.ts",
            import.meta.url,
          ),
        ).replaceAll("\\", "/"),
      ],
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
        "src/components/common/ui/WizardSteps.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/events/EventDraftTableCard.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/events/EventDateTimeField.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/organizations/OrganizationInvitationResponse.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "../../packages/shared/src/organizations/hooks/{useOrganizationPeople,useOrganizationSocialActions}.ts":
          { lines: 100, functions: 100, branches: 100, statements: 100 },
        "../../packages/shared/src/common/hooks/useListSearch.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/common/ui/{SearchInput,FilterChips,HelpPopover,SearchHelpLabel}.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/common/ui/ListSearch.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "../../packages/shared/src/events/hooks/useEventWindow.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "../../packages/shared/src/events/hooks/useEvents.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "../../packages/shared/src/groups/hooks/usePublicGroups.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "../../packages/shared/src/organizations/hooks/useOrganizations.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "../../packages/shared/src/locations/hooks/useCurrentLocationAddress.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "../../packages/shared/src/locations/hooks/useFavoriteLocations.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/contacts/ContactLegend.tsx": {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
        "src/components/locations/LocationFavoriteButton.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
        "src/app/mobile-number/page.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/auth/MobileNumberGate.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/lib/notifications/webPush.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/components/contacts/UserMenu.tsx": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
