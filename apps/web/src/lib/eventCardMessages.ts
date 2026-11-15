import type { EventExclusionReason, EventPlanningBlocker } from "@board-game-organizer/schemas";
import type { CardParticipationState } from "@board-game-organizer/shared";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const cardStateMessages = {
  PLANNING: msg`Planning`,
  CONFIRMED: msg`Confirmed`,
  EXCLUDED: msg`You are excluded`,
  TABLE_EXCLUDED: msg`Table excluded`,
  DUTY: msg`Confirmed`,
  OBSERVER: msg`Confirmed`,
  UNKNOWN: msg`Confirmed`,
  TERMINATED: msg`Terminated`,
} satisfies Record<CardParticipationState, MessageDescriptor>;

export const cardPlanningMessages = {
  MIN_PLAYERS: msg`Not enough eligible players to reach the minimum.`,
  PENDING_INVITATIONS: msg`Reserved invitations still need to be accepted.`,
  DATE_AGREEMENT: msg`There is no agreement on a date and time.`,
  LOCATION_AGREEMENT: msg`There is no agreement on a location.`,
  GAME_AGREEMENT: msg`There is no agreement on a game.`,
  COMBINED_AGREEMENT: msg`No combination of date, location and game satisfies the same players.`,
} satisfies Record<EventPlanningBlocker, MessageDescriptor>;

export const cardExclusionMessages = {
  TABLE_EXCLUDED: msg`The table was excluded from confirmation.`,
  PENDING_INVITATION: msg`The invitation was not accepted before confirmation.`,
  DATE_AGREEMENT: msg`Your votes do not agree with the chosen date and time.`,
  LOCATION_AGREEMENT: msg`Your votes do not agree with the chosen location.`,
  GAME_AGREEMENT: msg`Your votes do not agree with the chosen game.`,
  NOT_SELECTED: msg`You were not included in the final roster.`,
} satisfies Record<EventExclusionReason, MessageDescriptor>;
