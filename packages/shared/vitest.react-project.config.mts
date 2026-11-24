import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";
import web from "../../apps/web/vitest.config";

const { coverage: _coverage, ...test } = web.test;

export default defineProject({
  ...web,
  test: {
    ...test,
    root: fileURLToPath(new URL("../../apps/web", import.meta.url)),
    name: "shared-react",
    // Reuse actual React/Query/HTTP hook drivers and form journeys from the Web workspace.
    include: [
      "src/components/{contacts,events,games,groups,invites,locations,notifications,profile}/__tests__/use*.test.tsx",
      "src/components/{events,groups}/__tests__/optimistic-*.test.tsx",
      "src/lib/__tests__/useClientMutationDraft.test.tsx",
      "src/components/events/__tests__/{EventWizard,EventWizard.interactions,EventJoinSheet,event-proposals,EventPlanningControls,EventResults}.test.tsx",
      "src/components/invites/__tests__/TableInviteClaim.test.tsx",
      "src/components/events/__tests__/EventFormFields.interactions.test.tsx",
      "src/components/events/__tests__/EventProposalEditor.flows.test.tsx",
      "src/components/events/__tests__/EventProposalSection.decisions.test.tsx",
      "src/components/contacts/__tests__/Contacts.additional-actions.test.tsx",
      "src/components/profile/__tests__/ProfileAccessTransitions.test.tsx",
      "src/components/profile/__tests__/ProfileCollection.pagination.test.tsx",
      "src/components/notifications/__tests__/NotificationsPage.requests.test.tsx",
      "src/components/groups/__tests__/GroupMembers.test.tsx",
      "src/components/groups/__tests__/GroupMembers.management.test.tsx",
      "src/components/events/__tests__/EventParticipants.test.tsx",
      "src/components/events/__tests__/EventTableLeaderboard.test.tsx",
      "src/components/events/__tests__/EventTableResults.current.test.tsx",
      "src/components/events/__tests__/{EventGuestVoteEditor,EventInvitationPicker}.test.tsx",
      "src/components/groups/__tests__/{GroupDetail,GroupWizard,GroupWizard.interactions}.test.tsx",
      "src/components/contacts/__tests__/Contacts.session.test.tsx",
    ],
    exclude: [
      ...test.exclude,
      // Its controlled Shared dependencies remain covered by the ordinary Web suite.
      "src/components/events/__tests__/useEventProposalSection.test.tsx",
    ],
  },
});
