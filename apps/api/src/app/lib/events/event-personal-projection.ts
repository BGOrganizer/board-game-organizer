import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableRecord,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { isFrozenTableParticipant } from "@board-game-organizer/shared";
import { sharedEventResults, sharedTableResults } from "./event-results-projection";

/** A personal frozen snapshot is not a route back into the banned Group. */
export function personalEventProjection(
  event: PlannedEventResponse,
  tables: readonly TableRecord[],
  registrations: readonly TableRegistration[],
  userId: string,
): PlannedEventResponse {
  const own = tables.filter(
    (table) => table.eventId === event.id && isFrozenTableParticipant(table, userId),
  );
  return {
    ...sharedEventResults(event, own),
    sharedResultsOnly: false,
    personalAccessOnly: true,
    accessRevokedGroupId: event.groupId ?? undefined,
    shareResultsWithFriends: event.shareResultsWithFriends,
    role: own.some((table) => table.confirmed?.playerIds.includes(userId))
      ? "participant"
      : own.length
        ? "demonstrator"
        : "viewer",
    myRegistrations: registrations
      .filter(
        (row) =>
          row.userId === userId &&
          row.eventId === event.id &&
          own.some(
            (table) =>
              table.id === row.tableId &&
              (table.confirmed?.playerIds.includes(userId) ||
                row.status === "ACCEPTED" ||
                row.status === "PENDING"),
          ),
      )
      .map((row) => ({
        ...row,
        gameVotes: {},
        position: own.some(
          (table) => table.id === row.tableId && table.confirmed?.playerIds.includes(userId),
        )
          ? "FROZEN"
          : "WAITING",
      })),
    myDemonstrator: own.some((table) => table.demonstratorUserId === userId),
    tableCount: own.length,
    participantCount: new Set(own.flatMap((table) => table.confirmed!.playerIds)).size,
  };
}

export function personalTableProjection(
  table: PlannedTableResponse,
  registration: TableRegistration | null,
  userId: string,
): PlannedTableResponse {
  const frozen = Boolean(table.confirmed?.playerIds.includes(userId));
  const own =
    registration &&
    registration.userId === userId &&
    registration.tableId === table.id &&
    registration.eventId === table.eventId &&
    (frozen || registration.status === "ACCEPTED" || registration.status === "PENDING")
      ? registration
      : null;
  return {
    ...sharedTableResults(table),
    sharedResultsOnly: false,
    personalAccessOnly: true,
    accessRevokedGroupId: table.groupId ?? undefined,
    myRegistration: own ? { ...own, gameVotes: {} } : null,
    myPosition: frozen ? "FROZEN" : own ? "WAITING" : null,
    demonstratorUserId: table.demonstratorUserId,
    demonstratorName: table.demonstratorName,
    demonstratorAvatarUrl: table.demonstratorAvatarUrl,
  };
}
