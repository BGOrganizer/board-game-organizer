import type {
  EditPlannedEventInput,
  EventProposalPayload,
  EventRecord,
  TableRecord,
} from "@board-game-organizer/schemas";
import { MAX_EVENT_OPTIONS } from "@board-game-organizer/schemas";
import { eventDateWall } from "./eventRecordPolicy";
/** Canonical configuration edit only. No ballots, registrations or role changes. */
export function eventProposalEdit(
  event: EventRecord,
  tables: readonly TableRecord[],
  payload: EventProposalPayload,
  optionId: string,
): { input: EditPlannedEventInput | null; optionId: string } {
  const input: EditPlannedEventInput = {
    name: event.name,
    timeZone: event.timeZone,
    startTime: event.startTime,
    dates: event.dates,
    locations: event.locations,
    version: event.version,
    tables: [],
    removedTableIds: [],
  };
  if (payload.kind === "date") {
    const old = event.dates.find(
      (date) => eventDateWall(event, date) === `${payload.day}T${payload.startTime}`,
    );
    if (old) return { input: null, optionId: old.id };
    if (event.dates.length >= MAX_EVENT_OPTIONS) throw new Error("PROPOSAL_OPTION_LIMIT");
    return {
      input: {
        ...input,
        dates: [...event.dates, { id: optionId, day: payload.day, startTime: payload.startTime }],
      },
      optionId,
    };
  }
  if (payload.kind === "location") {
    const old = event.locations.find(
      (l) =>
        l.address === payload.location.address &&
        l.latitude === payload.location.latitude &&
        l.longitude === payload.location.longitude,
    );
    if (old) return { input: null, optionId: old.id };
    if (event.locations.length >= MAX_EVENT_OPTIONS) throw new Error("PROPOSAL_OPTION_LIMIT");
    return {
      input: { ...input, locations: [...event.locations, { ...payload.location, id: optionId }] },
      optionId,
    };
  }
  const table = tables.find((t) => t.id === payload.tableId && !t.removedAt);
  if (!table) throw new Error("TABLE_NOT_FOUND");
  if (table.games.some((g) => g.gameId === payload.gameId))
    return { input: null, optionId: String(payload.gameId) };
  return {
    input: {
      ...input,
      tables: [
        {
          id: table.id,
          name: table.name,
          minPlayers: table.minPlayers,
          maxPlayers: table.maxPlayers,
          rankingEnabled: table.rankingEnabled,
          allowParticipantGames: table.allowParticipantGames,
          startsAt: table.startsAt,
          demonstratorUserId: table.demonstratorUserId,
          games: [
            ...table.games.map((g) => ({
              gameId: g.gameId,
              ...(g.durationSource === "MANUAL"
                ? { manualDurationMinutes: g.durationMinutes }
                : {}),
            })),
            { gameId: payload.gameId },
          ],
        },
      ],
    },
    optionId: String(payload.gameId),
  };
}
