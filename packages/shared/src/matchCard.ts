import type { MatchResponse } from "@board-game-organizer/schemas";

export type MatchCardStatus = MatchResponse["status"] | "IN_PROGRESS" | "FINISHED" | "CANCELLED";

export const matchCardStatusColor: Record<
  MatchCardStatus,
  "warning" | "success" | "accent" | "default" | "danger"
> = {
  PLANNING: "warning",
  CREATED: "success",
  IN_PROGRESS: "accent",
  FINISHED: "default",
  CANCELLED: "danger",
};

export function matchCardData(match: MatchResponse) {
  const planning = match.status === "PLANNING";
  return {
    dates: planning || !match.selectedDate ? match.dates : [match.selectedDate],
    players: planning
      ? match.minPlayers
      : 1 + match.invitations.filter((invitation) => invitation.status === "ACCEPTED").length,
    maxPlayers: match.maxPlayers,
    gameCount: planning ? match.gameIds.length : undefined,
    selectedGameName: planning ? undefined : match.selectedGameName,
  };
}
