import type {
  EventCardSummary,
  EventExclusionReason,
  EventPlanningBlocker,
  EventRecord,
  EventVoter,
  TableCardSummary,
  TableRecord,
  TableRegistration,
} from "@board-game-organizer/schemas";
import {
  allocateReservedPlaces,
  type EventAgreement,
  type EventAgreementInput,
  planningSeatCapacity,
} from "@board-game-organizer/shared";
import { tableTitleProjection } from "./table-title";

const positive = (vote: string | undefined) => vote === "YES" || vote === "IF_NEEDED";

/** Votes freeze outside Planning; these are factual incompatibilities, never optimizer guesses. */
function personalExclusionReasons(
  event: EventRecord,
  table: TableRecord,
  registration: TableRegistration,
  availability: Pick<EventVoter, "dateVotes" | "locationVotes"> | null | undefined,
): EventExclusionReason[] {
  if (!table.confirmed) return ["TABLE_EXCLUDED"];
  if (registration.status === "PENDING") return ["PENDING_INVITATION"];
  const reasons: EventExclusionReason[] = [];
  if (availability !== undefined && event.confirmed) {
    if (event.dates.length > 1 && !positive(availability?.dateVotes[event.confirmed.dateId]))
      reasons.push("DATE_AGREEMENT");
    if (
      event.locations.length > 1 &&
      !positive(availability?.locationVotes[event.confirmed.locationId])
    )
      reasons.push("LOCATION_AGREEMENT");
  }
  if (table.games.length > 1 && !positive(registration.gameVotes[String(table.confirmed.gameId)]))
    reasons.push("GAME_AGREEMENT");
  return reasons.length ? reasons : ["NOT_SELECTED"];
}

/** Explain definite independent blockers; coupled constraints retain a truthful combined reason. */
export function tablePlanningBlockers(
  input: EventAgreementInput,
  agreement: EventAgreement,
  tableId: string,
): EventPlanningBlocker[] {
  if (agreement.agreed && agreement.includedTables.some((table) => table.tableId === tableId))
    return [];
  const table = input.tables.find((row) => row.id === tableId);
  if (!table) return ["COMBINED_AGREEMENT"];
  if (!table.gameIds.length) return ["GAME_AGREEMENT"];
  const rows = input.registrations.filter((row) => row.tableId === tableId);
  const manual = input.planningMode === "MANUAL" || Boolean(table.preserveSeatAllocation);
  const capacity = planningSeatCapacity(table, input.planningMode);
  const { seated, waiting } = allocateReservedPlaces(rows, capacity, manual);
  const accepted = seated.filter((row) => row.status === "ACCEPTED");
  const pending = seated.filter((row) => row.status === "PENDING");
  const candidates = manual
    ? accepted
    : [...accepted, ...waiting.filter((row) => row.status === "ACCEPTED")];
  const minimum = Math.max(
    table.minPlayers,
    Math.min(
      ...table.gameIds.map((id) => table.gamePlayerBounds?.[id]?.minPlayers ?? table.minPlayers),
    ),
  );
  const blockers: EventPlanningBlocker[] = [];
  if (candidates.length < minimum) blockers.push("MIN_PLAYERS");
  if (pending.length && capacity - pending.length < minimum) blockers.push("PENDING_INVITATIONS");
  // Lack of accepted players alone is not evidence of a voting disagreement.
  if (blockers.length) return blockers;
  const agrees = (
    ids: readonly (string | number)[],
    vote: (userId: string, id: string) => string | undefined,
  ) =>
    ids.length === 1 ||
    ids.some((id) => {
      const eligible = candidates.filter((row) => positive(vote(row.userId, String(id))));
      return (
        eligible.length >= minimum &&
        accepted.every((row) => !(manual || row.locked) || eligible.includes(row))
      );
    });
  if (!input.fixedDateAndLocation) {
    if (!agrees(input.dateIds, (userId, id) => input.dateVotes[userId]?.[id]))
      blockers.push("DATE_AGREEMENT");
    if (!agrees(input.locationIds, (userId, id) => input.locationVotes[userId]?.[id]))
      blockers.push("LOCATION_AGREEMENT");
  }
  if (!agrees(table.gameIds, (userId, id) => input.gameVotes[tableId]?.[userId]?.[id]))
    blockers.push("GAME_AGREEMENT");
  return blockers.length ? blockers : ["COMBINED_AGREEMENT"];
}

export function tableCardSummary(
  event: EventRecord,
  table: TableRecord,
  userId: string,
  registration: TableRegistration | null,
  winners: TableCardSummary["winners"],
  planning?: { input: EventAgreementInput; agreement: EventAgreement },
  availability?: Pick<EventVoter, "dateVotes" | "locationVotes"> | null,
  confirmedGameName?: string,
): TableCardSummary {
  const confirmed = Boolean(table.confirmed);
  const participated = Boolean(table.confirmed?.playerIds.includes(userId));
  const excluded =
    event.status !== "PLANNING" &&
    !participated &&
    (registration?.status === "PENDING" || registration?.status === "ACCEPTED");
  return {
    tableId: table.id,
    order: table.order,
    ...tableTitleProjection(table.order, confirmedGameName),
    confirmed,
    ready: planning
      ? planning.agreement.agreed &&
        planning.agreement.includedTables.some((row) => row.tableId === table.id)
      : confirmed,
    blockers: planning ? tablePlanningBlockers(planning.input, planning.agreement, table.id) : [],
    myParticipation: participated ? "CONFIRMED" : excluded ? "EXCLUDED" : "NONE",
    exclusionReasons:
      excluded && registration
        ? personalExclusionReasons(event, table, registration, availability)
        : [],
    winners,
  };
}

export function eventCardSummary(ready: boolean, tables: TableCardSummary[]): EventCardSummary {
  return { ready, tables };
}
