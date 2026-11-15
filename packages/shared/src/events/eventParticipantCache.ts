import type {
  EventParticipantResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import type { QueryKey } from "@tanstack/react-query";
import { filterCommunityPages, mapCommunityCache } from "../community/queryCache";

function filterParticipantPage(
  data: unknown,
  keep: (row: EventParticipantResponse) => boolean,
): unknown {
  if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items))
    return data;
  return { ...data, items: data.items.filter(keep) };
}
/** Negative intent only: never invent replacements, positions, capabilities or epochs. */
export function projectEventParticipantRemoval(
  data: unknown,
  key: QueryKey,
  eventId: string,
  userId: string,
  version: number,
  registrationIds: ReadonlySet<string>,
): unknown {
  if (key[3] === "participants" && key[4] === eventId) {
    const page = (value: unknown) => {
      if (
        value &&
        typeof value === "object" &&
        "eventVersion" in value &&
        typeof value.eventVersion === "number" &&
        value.eventVersion > version
      )
        return value;
      return filterParticipantPage(value, (row) => row.userId !== userId);
    };
    if (data && typeof data === "object" && "pages" in data && Array.isArray(data.pages))
      return { ...data, pages: data.pages.map(page) };
    return page(data);
  }
  if (key[3] === "seats" && key[4] === eventId)
    return filterCommunityPages<TableSeatResponse>(
      data,
      (row) => row.userId !== userId || !registrationIds.has(row.id),
    );
  if (key[3] === "list" || (key[3] === "detail" && key[4] === eventId))
    return mapCommunityCache<PlannedEventResponse>(data, (row) =>
      row.id === eventId &&
      row.version === version &&
      Array.isArray(row.myRegistrations) &&
      typeof row.participantCount === "number"
        ? {
            ...row,
            myRegistrations: row.myRegistrations.filter((entry) => entry.userId !== userId),
            participantCount: Math.max(0, row.participantCount - 1),
            canConfirm: false,
            agreement: undefined,
            canVote:
              row.canVote &&
              row.myRegistrations.some(
                (entry) => entry.userId !== userId && entry.status === "ACCEPTED",
              ),
          }
        : row,
    );
  if (key[3] === "tables" || (key[3] === "table" && key[4] === eventId))
    return mapCommunityCache<PlannedTableResponse>(data, (row) =>
      row.eventId === eventId &&
      row.myRegistration?.userId === userId &&
      registrationIds.has(row.myRegistration.id) &&
      (row.eventVersion ?? 0) <= version
        ? { ...row, myRegistration: null, myPosition: null, canLeave: false, canRespond: false }
        : row,
    );
  return data;
}

/** Group ban cannot erase immutable attendance or a later rejoin/read epoch. */
export function participantGroupVersion(data: unknown, groupId: string): number {
  if (!data || typeof data !== "object") return 0;
  if ("pages" in data && Array.isArray(data.pages))
    return Math.max(0, ...data.pages.map((page) => participantGroupVersion(page, groupId)));
  return "groupId" in data &&
    data.groupId === groupId &&
    "status" in data &&
    (data.status === "PLANNING" || data.status === "CONFIRMED") &&
    "eventVersion" in data &&
    typeof data.eventVersion === "number"
    ? data.eventVersion
    : 0;
}
export function projectGroupParticipantBan(
  data: unknown,
  groupId: string,
  userId: string,
  through: number,
): unknown {
  if (!data || typeof data !== "object") return data;
  if ("pages" in data && Array.isArray(data.pages))
    return {
      ...data,
      pages: data.pages.map((page) => projectGroupParticipantBan(page, groupId, userId, through)),
    };
  const version = participantGroupVersion(data, groupId);
  return version > 0 && version <= through
    ? filterParticipantPage(data, (row) => row.userId !== userId)
    : data;
}
