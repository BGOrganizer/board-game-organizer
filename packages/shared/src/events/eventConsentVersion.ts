import type {
  JoinTableInput,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";

type EventPlan = Pick<
  PlannedEventResponse,
  | "id"
  | "groupId"
  | "groupType"
  | "groupName"
  | "adminUserId"
  | "name"
  | "status"
  | "planningGeneration"
  | "timeZone"
  | "startTime"
  | "endsAt"
  | "bookingClosesAt"
  | "dates"
  | "locations"
  | "version"
>;
type TablePlan = Pick<
  PlannedTableResponse,
  | "id"
  | "eventId"
  | "eventStatus"
  | "name"
  | "minPlayers"
  | "maxPlayers"
  | "rankingEnabled"
  | "startsAt"
  | "demonstratorUserId"
  | "games"
>;
export type EventConsentSnapshot = {
  eventId: string;
  tableId: string;
  version: number;
  plan: string;
};
function plan(event: EventPlan, table: TablePlan) {
  // Only immutable consent/definition inputs, not ballots, counters, positions or inferred permissions.
  return JSON.stringify([
    event.id,
    event.groupId,
    event.groupType,
    event.groupName,
    event.adminUserId,
    event.name,
    event.status,
    event.planningGeneration,
    event.timeZone,
    event.startTime,
    event.endsAt ?? null,
    event.bookingClosesAt ?? null,
    event.dates.map((date) => [date.id, date.day, date.startTime ?? event.startTime]),
    event.locations.map((location) => [
      location.id,
      location.name,
      location.address,
      location.latitude,
      location.longitude,
      location.timeZone ?? event.timeZone,
    ]),
    table.id,
    table.eventId,
    table.eventStatus,
    table.name,
    table.minPlayers,
    table.maxPlayers,
    table.rankingEnabled,
    table.startsAt ?? null,
    table.demonstratorUserId ?? null,
    table.games.map((game) => [
      game.gameId,
      game.durationMinutes ?? null,
      game.durationSource ?? null,
    ]),
  ]);
}

export function captureEventConsent(
  input: JoinTableInput,
  event: EventPlan | undefined,
  table: TablePlan | undefined,
): EventConsentSnapshot | undefined {
  if (
    !event ||
    !table ||
    event.id !== table.eventId ||
    event.status !== "PLANNING" ||
    table.eventStatus !== "PLANNING" ||
    event.version !== input.version ||
    (input.availability && input.availability.version !== input.version)
  )
    return undefined;
  return { eventId: event.id, tableId: table.id, version: event.version, plan: plan(event, table) };
}

/** Rebase only a not-yet-sent, originally current consent over a preceding owned ACK.
 * Never refresh arbitrary stale input, change choices, infer seating or retry a write. */
export function rebaseEventConsent(
  input: JoinTableInput,
  snapshot: EventConsentSnapshot | undefined,
  event: EventPlan | undefined,
  table: TablePlan | undefined,
  ownedAcknowledgedVersion: number | undefined,
): JoinTableInput {
  if (
    !snapshot ||
    !event ||
    !table ||
    input.version !== snapshot.version ||
    (input.availability && input.availability.version !== snapshot.version) ||
    event.id !== snapshot.eventId ||
    table.id !== snapshot.tableId ||
    table.eventId !== event.id ||
    event.version <= snapshot.version ||
    ownedAcknowledgedVersion !== event.version ||
    plan(event, table) !== snapshot.plan
  )
    return input;
  return {
    ...input,
    version: event.version,
    ...(input.availability
      ? { availability: { ...input.availability, version: event.version } }
      : {}),
  };
}
