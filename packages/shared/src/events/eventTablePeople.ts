import type { PlannedTableResponse, TableSeatResponse } from "@board-game-organizer/schemas";
export type EventTablePerson = {
  key: string;
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  profileLoaded: boolean;
  rank?: number | null;
  score?: string | null;
  delta?: number;
  groupDelta?: number;
  registration?: TableSeatResponse;
};
export function eventTablePeople(
  table: PlannedTableResponse,
  seats: TableSeatResponse[],
): EventTablePerson[] {
  if (table.eventStatus === "TERMINATED")
    return (table.results?.entries ?? [])
      .slice()
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
      .map((row) => {
        const p = table.resultProfiles?.find((p) => p.userId === row.userId);
        return {
          key: row.userId,
          userId: row.userId,
          name: p?.name ?? row.userId,
          email: p?.email ?? null,
          avatarUrl: p?.avatarUrl ?? null,
          profileLoaded: Boolean(p),
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
    name: row.name ?? row.userId,
    email: row.email ?? null,
    avatarUrl: row.avatarUrl,
    profileLoaded: true,
    rank: undefined,
    score: undefined,
    delta: undefined,
    groupDelta: undefined,
    registration: row,
  }));
}
