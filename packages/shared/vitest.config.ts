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
        // Keep each runtime package at 93% independently of the combined report.
        "src/**/*.{ts,tsx,js,jsx}": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "../query/src/**/*.{ts,tsx,js,jsx}": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "../store/src/**/*.{ts,tsx,js,jsx}": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/hooks/useEventTableRoster.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/hooks/useRecordListWindow.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/contacts/contactRelationshipIds.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/contacts/contactRequestContext.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/groups/groupRecordSeed.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/artwork/resourceArtwork.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/invites/inviteLinks.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/invites/invitePolicy.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/games/gameDifficultyColor.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/games/gameBestPlayers.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/common/appVersion.ts": { lines: 93, functions: 93, branches: 93, statements: 93 },
        "src/events/tableSeatOrderDraft.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/notifications/notificationChangesReadAll.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/notifications/{notificationChanges,notificationChangeProjection,notificationChangeReconciliation}.ts":
          { lines: 93, functions: 93, branches: 93, statements: 93 },
        "src/{common/bgo-name-dictionaries,events/eventGameDuration,events/eventPersonalAccessCache,games/gamePickerWindow,games/hooks/useGameListWindow}.ts":
          {
            lines: 93,
            functions: 93,
            branches: 93,
            statements: 93,
          },
        "src/{common/recordUserRoles,events/tablePlayerRating,groups/groupLeaderboardRoles}.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/common/userIdentity.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/profile/activityFeed.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/community/pendingActions.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/{eventTableCard,eventCardIndicators}.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventParticipation.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/notifications/{notificationItemChanges,notificationItemRead,notificationDestination}.ts":
          { lines: 93, functions: 93, branches: 93, statements: 93 },
        "src/notifications/{notificationAttention,notificationAttentionCache,notificationReadOperation}.ts":
          {
            lines: 93,
            functions: 93,
            branches: 93,
            statements: 93,
          },
        "src/events/eventTableSections.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventTableInvitees.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventProposalLabel.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventProposalCache.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventProposalEdit.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventParticipantCache.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventDeletionCache.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/tableTitle.ts": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        "src/{common/optimisticOperation,common/clientMutation,notifications/notificationOptimistic,contacts/hooks/contactOptimistic}.ts":
          {
            lines: 93,
            functions: 93,
            branches: 93,
            statements: 93,
          },
        "src/common/startupQueries.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/{eventRecordForm,tableScoreForm,eventTablePeople,eventVotes,eventTableRoster,eventSchedule,eventJoinAvailability,eventRegistrationCache,eventOptimisticVote,eventOptimisticCreation,eventTablePending,eventConsentVersion}.ts":
          {
            lines: 93,
            functions: 93,
            branches: 93,
            statements: 93,
          },
        "src/{community/logoUpload,groups/groupLogoUpload}.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/groups/{groupDeletionCache,groupAccessCache,groupOptimisticCreation}.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/community/queryCache.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/{events/eventRecordPolicy,groups/groupPolicy,groups/groupBanForm,profile/profileMetrics,profile/activityNarrative}.ts":
          {
            lines: 93,
            functions: 93,
            branches: 93,
            statements: 93,
          },
        "src/{games/gamePlayerBounds,games/hooks/useBggPicker,events/eventRecordVisibility}.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventAgreement.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventSeatAllocation.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/{eventTableSeats,eventTableEditInput}.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventList.ts": { lines: 93, functions: 93, branches: 93, statements: 93 },
        lines: 93,
        functions: 93,
        branches: 93,
        statements: 93,
        "src/community/communityApi.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/community/communityFeedback.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventWizardForm.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventForm.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/matches/matchParticipants.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/organizations/organizationActions.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/organizations/organizationLogoUpload.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/events/eventPolicy.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/contacts/contactConnections.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/contacts/hooks/contactOptimistic.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/matches/matchCard.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/matches/matchContactState.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/matches/matchResults.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/locations/locationAddress.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
        "src/contacts/phoneCountries.ts": {
          lines: 93,
          functions: 93,
          branches: 93,
          statements: 93,
        },
      },
    },
  },
});
