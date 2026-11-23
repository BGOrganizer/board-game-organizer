import type { PlannedTableResponse, TableCardSummary } from "@board-game-organizer/schemas";

type TableTitleSource = Pick<TableCardSummary, "order" | "confirmedGameName"> &
  Partial<Pick<PlannedTableResponse, "eventStatus" | "gamesDetail">> & {
    confirmed?: PlannedTableResponse["confirmed"] | boolean;
  };

export function tableTitle(table: TableTitleSource, fallback: (number?: number) => string): string {
  if (table.eventStatus !== "PLANNING") {
    if (table.confirmedGameName) return table.confirmedGameName;
    const gameId = typeof table.confirmed === "object" ? table.confirmed.gameId : undefined;
    const game = table.gamesDetail?.find((candidate) => candidate.id === gameId);
    if (game?.name) return game.name;
  }
  return fallback(table.order === undefined ? undefined : table.order + 1);
}
