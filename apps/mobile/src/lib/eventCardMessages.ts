import type { CardParticipationState } from "@board-game-organizer/shared";

export const cardStateMessages = {
  PLANNING: "Planning",
  CONFIRMED: "Confirmed",
  EXCLUDED: "You are excluded",
  TABLE_EXCLUDED: "Table excluded",
  DUTY: "Confirmed",
  OBSERVER: "Confirmed",
  UNKNOWN: "Confirmed",
  TERMINATED: "Terminated",
} satisfies Record<CardParticipationState, string>;
