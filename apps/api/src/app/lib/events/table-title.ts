import type { EventRecord, TableRecord } from "@board-game-organizer/schemas";

export function confirmedTableGameId(
  status: EventRecord["status"],
  table: Pick<TableRecord, "confirmed">,
) {
  // Replanning can retain a previous confirmation snapshot.
  return status === "PLANNING" ? undefined : table.confirmed?.gameId;
}

export function numberedTableTitle(order: number) {
  return `Table #${order + 1}`;
}

export function tableTitleProjection(order: number, confirmedGameName?: string) {
  return confirmedGameName
    ? { name: confirmedGameName, confirmedGameName }
    : { name: numberedTableTitle(order) };
}
