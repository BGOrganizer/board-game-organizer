import type { RecordUserRole } from "@board-game-organizer/shared";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

/** Web macros own catalog IDs; shared role metadata remains platform-independent. */
export const recordUserRoleMessages = {
  admin: msg`Admin`,
  moderator: msg`Moderator`,
  demonstrator: msg`Demonstrator`,
  invitedPlayer: msg`Player with pending invitation`,
  waitingPlayer: msg`Player on the waiting list`,
  confirmedPlayer: msg`Confirmed player`,
  invitedParticipant: msg`Participant with pending invitation`,
  waitingParticipant: msg`Participant on the waiting list`,
  acceptedParticipant: msg`Accepted participant`,
  requestedMember: msg`Member with pending request`,
  invitedMember: msg`Member with pending invitation`,
  acceptedMember: msg`Accepted member`,
} satisfies Record<RecordUserRole, MessageDescriptor>;
