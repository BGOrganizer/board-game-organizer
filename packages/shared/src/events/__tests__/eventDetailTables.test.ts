import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { filterEventDetailTables } from "../eventDetailTables";

function row(order: number, extra: Partial<PlannedTableResponse> = {}): PlannedTableResponse {
  return {
    id: String(order),
    order,
    eventStatus: "PLANNING",
    groupType: "PRIVATE",
    ...extra,
  } as PlannedTableResponse;
}

const title = (table: PlannedTableResponse) => table.confirmedGameName ?? `Tavolo #${table.order}`;
const queryRows = (
  rows: PlannedTableResponse[],
  sort: "name" | "participants",
  direction: "asc" | "desc",
  query = "",
) => filterEventDetailTables(rows, query, { sort, direction }, title, "it").map(({ id }) => id);

describe("Event detail Tables", () => {
  it("matches displayed titles case-insensitively, including one character and finished game names", () => {
    const rows = [row(10), row(2), row(4, { confirmedGameName: "Puerto Rico" })];
    expect(queryRows(rows, "name", "asc")).toEqual(["4", "2", "10"]);
    expect(queryRows(rows, "name", "desc", "T")).toEqual(["10", "2", "4"]);
    expect(queryRows(rows, "name", "asc", "RICO")).toEqual(["4"]);
    expect(queryRows(rows, "name", "asc", "missing")).toEqual([]);
    expect(rows.map(({ id }) => id)).toEqual(["10", "2", "4"]);
  });

  it("sorts by seated players with stable table-number ties and tolerates old projections", () => {
    const rows = [
      row(3, { seatedCount: 2 }),
      row(2, { seatedCount: 2 }),
      row(4, { seatedCount: 3 }),
      row(1),
    ];
    expect(queryRows(rows, "participants", "desc")).toEqual(["4", "2", "3", "1"]);
    expect(queryRows([...rows].reverse(), "participants", "asc")).toEqual(["1", "2", "3", "4"]);
  });
});
