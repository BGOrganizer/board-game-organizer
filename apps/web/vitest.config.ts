import { fileURLToPath } from "node:url";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

const webSources = fileURLToPath(new URL("./src/**/*.{ts,tsx,js,jsx}", import.meta.url)).replaceAll(
  "\\",
  "/",
);
const notificationWorker = fileURLToPath(
  new URL("./public/firebase-messaging-sw.js", import.meta.url),
).replaceAll("\\", "/");

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
  oxc: { jsx: { runtime: "automatic" } },
  // The shared LinguiJS catalogs live at the repo root (../.. from apps/web):
  // allow Vite to serve/import them in tests.
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
  test: {
    globals: true,
    // Functional journeys use real HeroUI; render budgets live in the separate benchmarks.
    testTimeout: 15_000,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // E2E specs (Playwright) live in ./e2e — keep them out of unit tests.
    exclude: ["e2e/**", "node_modules/**", "dist/**", ".next/**"],
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
      allowExternal: true,
      include: [
        notificationWorker,
        webSources,
        fileURLToPath(new URL("../api/src/app/invite/layout.tsx", import.meta.url)),
        fileURLToPath(new URL("../api/src/app/invite/*/InviteProviders.tsx", import.meta.url)),
        fileURLToPath(
          new URL(
            "../api/src/app/invite/*/{claim,page,InviteLanding,InviteVotes,InviteShell,TableInviteClaim,InviteAppLink,inviteMessages}.{ts,tsx}",
            import.meta.url,
          ),
        ),
        ...[
          "common/hooks/useListSearch.ts",
          "invites/hooks/useInvites.ts",
          "invites/hooks/useInviteClaim.ts",
          "invites/hooks/useTableInviteForm.ts",
          "games/hooks/useBggCollectionFilters.ts",
          "organizations/hooks/useOrganizationPeople.ts",
          "organizations/hooks/useOrganizationSocialActions.ts",
          "community/hooks/usePeopleSocialActions.ts",
          "groups/hooks/useGroupSocialActions.ts",
          "events/hooks/useEvents.ts",
          "events/hooks/useEventWindow.ts",
          "events/hooks/useRecordListWindow.ts",
          "events/hooks/useEventTableContext.ts",
          "events/hooks/useEventTableParticipation.ts",
          "events/hooks/useEventTableMatch.ts",
          "events/hooks/useTableLeaderboard.ts",
          "events/hooks/useEventJoinForm.ts",
          "profile/hooks/usePreferredLanguageSync.ts",
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
      // Exclude only test support and tooling; application entry points remain included.
      exclude: [
        "e2e/**",
        "next.config.ts",
        "playwright.config.ts",
        "postcss.config.mjs",
        ".next/**",
        fileURLToPath(new URL("./coverage/**", import.meta.url)).replaceAll("\\", "/"),
        "**/__tests__/**",
        "**/*.{test,spec}.{js,cjs,mjs,jsx,ts,cts,mts,tsx}",
        "test-utils.tsx",
        "src/test-fixtures/**",
      ],
      thresholds: {
        "public/firebase-messaging-sw.js": {
          lines: 98,
          functions: 98,
          branches: 98,
          statements: 98,
        },
        // Shared hook coverage must not conceal gaps in the web application's own sources.
        "src/**/*.{ts,tsx,js,jsx}": {
          lines: 98,
          functions: 98,
          branches: 98,
          statements: 98,
        },
        "src/components/events/TableScoreEditor.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/ListSearchFilters.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/EventVisibilityPicker.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/NameInput.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../api/src/app/invite/layout.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/TableInviteLinkRow.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/invites/hooks/{useInvites,useInviteClaim,useTableInviteForm}.ts":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "../api/src/app/invite/*/InviteProviders.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../api/src/app/invite/*/{claim,page,InviteLanding,InviteVotes,InviteShell,TableInviteClaim,InviteAppLink,inviteMessages}.{ts,tsx}":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/components/profile/{ProfileIdentity,ProfileVersion}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/{EventRolePopover,EventCardTableSummaries,EventSchedulePopover}.tsx":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "../../packages/shared/src/events/hooks/useRecordListWindow.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/layout/floatingActionStyles.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/notifications/NotificationChangesPopover.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/WindowedList.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/lib/windowed-list.ts": { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/components/common/ui/{IconBadge,UserAvatar,UserRelationshipBadge,UserRoleBadge}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/ratings/ScoreIdentity.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/events/hooks/useEventProposalSection.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/{lib/sentry,instrumentation,instrumentation-client,sentry.server.config,sentry.edge.config}.ts":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/app/global-error.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/EventPlayerRatingPopover.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/{events/EventCardIndicators,events/EventTableGamesPopover,events/EventTableCardIndicators,events/EventTableSchedulePopover,groups/GroupIdentityCard,groups/GroupCard,groups/GroupCardIndicators,groups/GroupArtwork,groups/GroupVisibilityPicker,groups/GroupLogoPicker}.tsx":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "../../packages/shared/src/games/hooks/useBggCollectionFilters.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/community/*.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/{activities/ActivityRow,profile/ProfileRatingChart,profile/ProfileStats}.tsx":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/components/notifications/NotificationTabBadge.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/{NotificationUnreadDot,ArtworkStatusPopover,ClientRecordBadge,ListCardCoverContent,ListCardBody,LinkedListCard}.tsx":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/components/common/providers/ThemeScript.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/profile/hooks/usePreferredLanguageSync.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/{EventResults,EventFinalizeAction}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/{EventResultTableCard,EventTableResults,EventPlayerCard,EventJoinSheet}.tsx":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "../../packages/shared/src/events/hooks/{useTableLeaderboard,useEventJoinForm}.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/{PendingArtworkBadge,InvitationActions}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/{EventTableCard,EventTableInvitationActions}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/{EventDetailsCard,EventTableInfo,EventTableScheduleCard,EventVoteLegend}.tsx":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/components/events/{EventDraftTableCard,EventTableRatingInfo}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/groups/{GroupInvitationCard,GroupJoinRequest}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/{community/hooks/usePeopleSocialActions,groups/hooks/useGroupSocialActions}.ts":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/components/common/ui/{AnimatedDicebearArtwork,DateTimeInfo}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/{games/GameListRow,locations/LocationListRow,matches/MatchPlayerLimits}.tsx":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/lib/events/eventWizardBackHref.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/{EventTableHeading,EventTablePlayers,EventTableOverview,EventTableEditAction,EventTableEdit,EventTable}.tsx":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/components/organizations/OrganizationMemberPicker.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/events/hooks/{useEventTableContext,useEventTableParticipation,useEventTableMatch}.ts":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "src/components/common/ui/ContactConfirmDialog.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/WizardSteps.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/{ListCard,RecordIdentityCard,EmptyList}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/{EventTableCardBody,EventTableCard,EventTableInvitationActions,EventTableRatingInfo,EventTableInfo,EventTableSeats,EventVoteButtons,OptionVoteVoters,VoteResultSheet,EventDetail}.tsx":
          {
            lines: 90,
            functions: 90,
            branches: 90,
            statements: 90,
          },
        "src/components/common/layout/HeaderActions.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/FloatingActions.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/matches/MatchListLegend.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/EventCard.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/organizations/OrganizationDetailsCard.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/EventWizardSummary.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/EventDraftTableCard.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/events/EventDateTimeField.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/organizations/OrganizationInvitationResponse.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/organizations/hooks/{useOrganizationPeople,useOrganizationSocialActions}.ts":
          { lines: 90, functions: 90, branches: 90, statements: 90 },
        "../../packages/shared/src/common/hooks/useListSearch.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/{SearchInput,FilterChips,HelpPopover,SearchHelpLabel}.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/common/ui/ListSearch.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/events/hooks/useEventWindow.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/events/hooks/useEvents.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/groups/hooks/usePublicGroups.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/organizations/hooks/useOrganizations.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/locations/hooks/useCurrentLocationAddress.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "../../packages/shared/src/locations/hooks/useFavoriteLocations.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/contacts/ContactLegend.tsx": {
          lines: 90,
          branches: 90,
          functions: 90,
          statements: 90,
        },
        "src/components/locations/LocationFavoriteButton.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        lines: 98,
        functions: 98,
        branches: 98,
        statements: 98,
        "src/app/mobile-number/page.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/auth/MobileNumberGate.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/lib/notifications/webPush.ts": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
        "src/components/contacts/UserMenu.tsx": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
