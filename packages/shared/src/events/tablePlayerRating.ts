import type { PlannedTableResponse, TableLeaderboardPlayer } from "@board-game-organizer/schemas";

export type TablePlayerRatingRow = {
  scope: "GLOBAL" | "GROUP";
  state: "current" | "recorded" | "notUpdated" | "unavailable";
  after?: number;
  before?: number;
  delta?: number;
  provisional?: boolean;
};

/** Current reads never replace the immutable history of a finished physical Table. */
export function tablePlayerRatingRows(
  table: PlannedTableResponse,
  userId: string,
  current?: TableLeaderboardPlayer,
): TablePlayerRatingRow[] {
  const scopes =
    table.groupId && !table.sharedResultsOnly
      ? (["GLOBAL", "GROUP"] as const)
      : (["GLOBAL"] as const);
  return scopes.map((scope): TablePlayerRatingRow => {
    if (table.eventStatus !== "TERMINATED") {
      const rating =
        scope === "GLOBAL"
          ? (current?.globalRating ?? (!table.groupId ? current : undefined))
          : (current?.groupRating ?? current);
      return rating
        ? { scope, state: "current", after: rating.score, provisional: rating.provisional }
        : { scope, state: "unavailable" };
    }
    if (table.rankingEnabled === false) return { scope, state: "notUpdated" };
    if (!table.results || table.rankingEnabled !== true) return { scope, state: "unavailable" };
    if (table.results.entries.filter((row) => row.score !== null).length < 2)
      return { scope, state: "notUpdated" };
    const rating = (scope === "GLOBAL" ? table.ratingChanges : table.groupRatingChanges)?.find(
      (row) => row.userId === userId,
    );
    if (!rating) return { scope, state: "unavailable" };
    return {
      scope,
      state: "recorded",
      before: rating.score - rating.delta,
      after: rating.score,
      delta: rating.delta,
      provisional: rating.provisional,
    };
  });
}
