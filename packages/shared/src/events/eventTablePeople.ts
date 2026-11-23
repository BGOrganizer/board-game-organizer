import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
export type EventTablePerson = {
  key: string;
  userId: string;
  name: string;
  email: string | null;
  guestName?: string;
  username?: string | null;
  avatarUrl: string | null;
  profileLoaded: boolean;
  rank?: number | null;
  score?: string | null;
  delta?: number;
  groupDelta?: number;
  registration?: TableSeatResponse;
};
export function eventTablePeople(
  table: Pick<
    PlannedTableResponse,
    | "eventStatus"
    | "results"
    | "resultProfiles"
    | "confirmed"
    | "ratingChanges"
    | "groupRatingChanges"
  >,
  seats: TableSeatResponse[],
): EventTablePerson[] {
  if (table.eventStatus === "TERMINATED")
    return (table.results?.entries ?? [])
      .slice()
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
      .map((row) => {
        const p = table.resultProfiles?.find((p) => p.userId === row.userId);
        const guestName =
          p?.guestName ??
          table.confirmed?.guestPlayers?.find((guest) => guest.participantId === row.userId)?.name;
        return {
          key: row.userId,
          userId: row.userId,
          name: guestName ?? p?.name ?? row.userId,
          guestName,
          email: p?.email ?? null,
          username: p?.username ?? null,
          avatarUrl: p?.avatarUrl ?? null,
          profileLoaded: Boolean(p || guestName),
          rank: row.rank,
          score: row.score,
          delta: table.ratingChanges.find((p) => p.userId === row.userId)?.delta,
          groupDelta: table.groupRatingChanges?.find((p) => p.userId === row.userId)?.delta,
          registration: undefined as TableSeatResponse | undefined,
        };
      });
  return seats.map((row) => ({
    key: row.id,
    userId: row.userId,
    name: row.guestName ?? row.name ?? row.userId,
    guestName: row.guestName,
    email: row.email ?? null,
    username: row.username ?? null,
    avatarUrl: row.avatarUrl,
    profileLoaded: true,
    rank: undefined,
    score: undefined,
    delta: undefined,
    groupDelta: undefined,
    registration: row,
  }));
}
