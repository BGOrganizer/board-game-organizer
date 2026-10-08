import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["lcov", "html", "text"],
      include: [
        "src/contactConnections.ts",
        "src/eventPolicy.ts",
        "src/communityApi.ts",
        "src/communityFeedback.ts",
        "src/organizationActions.ts",
        "src/eventForm.ts",
        "src/matchParticipants.ts",
        "src/organizationLogoUpload.ts",
        "src/hooks/contactOptimistic.ts",
        "src/matchCard.ts",
        "src/locationAddress.ts",
        "src/matchContactState.ts",
        "src/matchResults.ts",
        "src/phoneCountries.ts",
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
        "src/{communityApi,communityFeedback,organizationActions,eventForm,matchParticipants,organizationLogoUpload}.ts":
          {
            lines: 100,
            functions: 100,
            branches: 100,
            statements: 100,
          },
        "src/eventPolicy.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/contactConnections.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/hooks/contactOptimistic.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/matchCard.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/matchContactState.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/matchResults.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/locationAddress.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/phoneCountries.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
      },
    },
  },
});
