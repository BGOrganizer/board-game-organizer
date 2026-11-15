import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import type { QueryKey } from "@tanstack/react-query";
import { filterCommunityPages, mapCommunityCache } from "../community/queryCache";

/** Local removal intent only; canonical capabilities/versions are never granted or advanced. */
export function projectEventRemoval(
  data: unknown,
  key: QueryKey,
  eventId: string,
  version: number,
  tableId?: string,
): unknown {
  if (key[3] === "list")
    return tableId
      ? mapCommunityCache<PlannedEventResponse>(data, (row) =>
          row.id === eventId && row.version === version
            ? { ...row, tableCount: Math.max(1, row.tableCount - 1), canConfirm: false }
            : row,
        )
      : filterCommunityPages<PlannedEventResponse>(
          data,
          (row) => row.id !== eventId || row.version > version,
        );
  if (key[3] === "tables")
    return filterCommunityPages<PlannedTableResponse>(
      data,
      (row) => row.eventId !== eventId || Boolean(tableId && row.id !== tableId),
    );
  if (key[3] === "detail" && key[4] === eventId)
    return mapCommunityCache<PlannedEventResponse>(data, (row) =>
      row.version !== version
        ? row
        : tableId
          ? { ...row, tableCount: Math.max(1, row.tableCount - 1), canConfirm: false }
          : {
              ...row,
              canEdit: false,
              canRegister: false,
              canInvite: false,
              canVote: false,
              canConfirm: false,
            },
    );
  if (key[3] === "table" && key[4] === eventId && (!tableId || key[5] === tableId))
    return mapCommunityCache<PlannedTableResponse>(data, (row) => ({
      ...row,
      canRegister: false,
      canRespond: false,
      canLeave: false,
      canInvite: false,
    }));
  return data;
}
