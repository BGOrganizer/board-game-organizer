import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      // Keep test modules and private fixtures out of selective coverage reports.
      exclude: ["**/__tests__/**", "**/*.{test,spec}.{js,cjs,mjs,jsx,ts,cts,mts,tsx}"],
      include: ["src/**/*.{ts,tsx}"],
      reporter: [
        ["lcov", { projectRoot: fileURLToPath(new URL("../..", import.meta.url)) }],
        "html",
        "text",
        "json",
        "json-summary",
      ],
      thresholds: {
        "src/groups/dto/groupLeaderboard.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/common/dto/common.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/invites/{dto,models}/invites.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/games/models/playerPoll.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/notifications/dto/notificationChanges.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/notifications/notificationItems.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/notifications/dto/notificationAttention.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/{groups/models/groupRecord,groups/models/groupAssets,groups/dto/groupRecords,events/models/eventRecord,events/dto/eventRecords,games/dto/boardGames,profile/dto/profileView}.ts":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/{games/models/boardGames,locations/models/locations,ratings/models/results}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/dto/eventList.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/organizations/dto/organizationList.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/dto/events.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/organizations/dto/organizations.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/models/events.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/organizations/models/organizations.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/locations/dto/locationFavorites.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        lines: 98,
        functions: 98,
        branches: 98,
        statements: 98,
        "src/notifications/dto/notifications.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/matches/dto/matches.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/matches/models/matches.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/profile/models/users.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/contacts/dto/contacts.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
