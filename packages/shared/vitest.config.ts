import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    projects: [{ extends: true, test: { name: "logic" } }, "./vitest.react-project.config.mts"],
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      // Keep test modules and private fixtures out of selective coverage reports.
      exclude: ["**/__tests__/**", "**/*.{test,spec}.{js,cjs,mjs,jsx,ts,cts,mts,tsx}"],
      reporter: [
        ["lcov", { projectRoot: fileURLToPath(new URL("../..", import.meta.url)) }],
        "html",
        "text",
        "json",
        "json-summary",
      ],
      allowExternal: true,
      // Exact package owners: browser projects supply drivers, never a smaller source set.
      include: [
        "./src/**/*.{ts,tsx,js,jsx}",
        "../query/src/**/*.{ts,tsx,js,jsx}",
        "../store/src/**/*.{ts,tsx,js,jsx}",
      ].map((pattern) => fileURLToPath(new URL(pattern, import.meta.url)).replaceAll("\\", "/")),
      thresholds: {
        // Keep each runtime package at 90% independently of the combined report.
        "src/**/*.{ts,tsx,js,jsx}": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../query/src/**/*.{ts,tsx,js,jsx}": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../store/src/**/*.{ts,tsx,js,jsx}": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/hooks/useEventTableRoster.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/hooks/useRecordListWindow.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/contacts/contactRelationshipIds.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/contacts/contactRequestContext.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/groups/groupRecordSeed.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/artwork/resourceArtwork.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/invites/inviteLinks.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/invites/invitePolicy.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/games/gameDifficultyColor.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/games/gameBestPlayers.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/common/appVersion.ts": { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/events/tableSeatOrderDraft.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/notifications/notificationChangesReadAll.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/notifications/{notificationChanges,notificationChangeProjection,notificationChangeReconciliation}.ts":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/{common/bgo-name-dictionaries,events/eventGameDuration,events/eventPersonalAccessCache,games/gamePickerWindow,games/hooks/useGameListWindow}.ts":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/{common/recordUserRoles,events/tablePlayerRating,groups/groupLeaderboardRoles}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/common/userIdentity.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/profile/activityFeed.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/community/pendingActions.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/{eventTableCard,eventCardIndicators}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventParticipation.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/notifications/{notificationItemChanges,notificationItemRead,notificationDestination}.ts":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/notifications/{notificationAttention,notificationAttentionCache,notificationReadOperation}.ts":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/events/eventTableSections.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventTableInvitees.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventProposalLabel.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventProposalCache.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventProposalEdit.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventParticipantCache.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventDeletionCache.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/{common/optimisticOperation,common/clientMutation,notifications/notificationOptimistic,contacts/hooks/contactOptimistic}.ts":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/common/startupQueries.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/{eventRecordForm,tableScoreForm,eventTablePeople,eventVotes,eventTableRoster,eventSchedule,eventJoinAvailability,eventRegistrationCache,eventOptimisticVote,eventOptimisticCreation,eventTablePending,eventConsentVersion}.ts":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/{community/logoUpload,groups/groupLogoUpload}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/groups/{groupDeletionCache,groupAccessCache,groupOptimisticCreation}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/community/queryCache.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/{events/eventRecordPolicy,groups/groupPolicy,groups/groupBanForm,profile/profileMetrics,profile/activityNarrative}.ts":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/{games/gamePlayerBounds,games/hooks/useBggPicker,events/eventRecordVisibility}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventAgreement.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventSeatAllocation.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/{eventTableSeats,eventTableEditInput}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventList.ts": { lines: 90, functions: 90, branches: 90, statements: 90 },
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        "src/community/communityApi.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/community/communityFeedback.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventWizardForm.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventForm.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/matches/matchParticipants.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/organizations/organizationActions.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/organizations/organizationLogoUpload.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/events/eventPolicy.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/contacts/contactConnections.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/contacts/hooks/contactOptimistic.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/matches/matchCard.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/matches/matchContactState.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/matches/matchResults.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/locations/locationAddress.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/contacts/phoneCountries.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
