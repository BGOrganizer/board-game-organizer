import type { MatchDetailResponse, MatchResponse } from "@board-game-organizer/schemas";
/** Event seats are explicit bookings, never an implicit administrator seat. */
export function matchParticipants(data: MatchDetailResponse) {
  const invited = data.invitedPlayers
    .filter((player) => !data.match.eventTable || player.invitation.status === "ACCEPTED")
    .map((player) => ({
      ...player,
      status: player.invitation.status,
      isAdministrator: false as const,
    }));
  return data.match.eventTable
    ? invited
    : [
        { ...data.administrator, status: "ACCEPTED" as const, isAdministrator: true as const },
        ...invited,
      ];
}
export function canRegisterMatchResults(match: MatchResponse, userId: string | null | undefined) {
  return (
    Boolean(userId) &&
    match.status === "CREATED" &&
    (match.adminUserId === userId || match.eventTable?.demonstratorUserId === userId)
  );
}
