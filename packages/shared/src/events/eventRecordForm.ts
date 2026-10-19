import {
  type BggSearchItem,
  createPlannedEventSchema,
  editPlannedEventSchema,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { eventLocalDateTime, eventLocalToIso } from "./eventForm";
export type EventTableDraft = {
  key: string;
  id?: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  rankingEnabled: boolean;
  startsWall: string;
  demonstratorUserId?: string;
  demonstratorName?: string | null;
  games: Array<BggSearchItem & { manualDurationMinutes?: number }>;
};
export type EventRecordDraft = {
  name: string;
  groupId: string | null;
  timeZone: string;
  startTime: string;
  endsWall: string;
  cutoffWall: string;
  dates: Array<{ id: string; day: string }>;
  locations: PlannedEventResponse["locations"];
  tables: EventTableDraft[];
  removedTableIds: string[];
  version?: number;
};
/** Option IDs are scoped to one event, not credentials or global record identities. */
export function eventDateOptionId(dates: readonly { id: string }[]) {
  let n = 1;
  while (true) {
    const id = `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`;
    if (!dates.some((row) => row.id === id)) return id;
  }
}
export function tableDraft(row: PlannedTableResponse, timeZone: string): EventTableDraft {
  return {
    key: row.id,
    id: row.id,
    name: row.name,
    minPlayers: row.minPlayers,
    maxPlayers: row.maxPlayers,
    rankingEnabled: row.rankingEnabled,
    startsWall: row.startsAt ? eventLocalDateTime(row.startsAt, timeZone) : "",
    demonstratorUserId: row.demonstratorUserId,
    demonstratorName: row.demonstratorName,
    games: row.games.map((game) => ({
      ...(row.gamesDetail.find((item) => item.id === game.gameId) ?? {
        id: game.gameId,
        name: String(game.gameId),
        year: null,
        imageUrl: null,
      }),
      manualDurationMinutes: game.durationSource === "MANUAL" ? game.durationMinutes : undefined,
    })),
  };
}
export function eventDraft(data?: PlannedEventResponse, groupId?: string): EventRecordDraft {
  const zone = data?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    name: data?.name ?? "",
    groupId: data?.groupId ?? groupId ?? null,
    timeZone: zone,
    startTime: data?.startTime ?? "20:00",
    endsWall: data?.endsAt ? eventLocalDateTime(data.endsAt, zone) : "",
    cutoffWall: data?.bookingClosesAt ? eventLocalDateTime(data.bookingClosesAt, zone) : "",
    dates: data?.dates.map((d) => ({ ...d })) ?? [],
    locations: data?.locations.map((l) => ({ ...l })) ?? [],
    tables: [],
    removedTableIds: [],
    version: data?.version,
  };
}
export function eventDraftInput(draft: EventRecordDraft, publicGroup: boolean) {
  try {
    const base = {
      name: draft.name,
      timeZone: draft.timeZone,
      startTime: draft.startTime,
      dates: draft.dates,
      locations: draft.locations,
      ...(publicGroup
        ? {
            endsAt: eventLocalToIso(draft.endsWall, draft.timeZone),
            bookingClosesAt: eventLocalToIso(draft.cutoffWall, draft.timeZone),
          }
        : {}),
      tables: draft.tables.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        name: row.name,
        minPlayers: row.minPlayers,
        maxPlayers: row.maxPlayers,
        rankingEnabled: row.rankingEnabled,
        games: row.games.map((game) => ({
          gameId: game.id,
          ...(game.manualDurationMinutes
            ? { manualDurationMinutes: game.manualDurationMinutes }
            : {}),
        })),
        ...(publicGroup
          ? {
              startsAt: eventLocalToIso(row.startsWall, draft.timeZone),
              ...(row.demonstratorUserId ? { demonstratorUserId: row.demonstratorUserId } : {}),
            }
          : {}),
      })),
    };
    if (draft.version === undefined)
      return createPlannedEventSchema.safeParse({ ...base, groupId: draft.groupId });
    return editPlannedEventSchema.safeParse({
      ...base,
      version: draft.version,
      removedTableIds: draft.removedTableIds,
    });
  } catch {
    return createPlannedEventSchema.safeParse({});
  }
}
export function newTableDraft(key: string): EventTableDraft {
  return {
    key,
    name: "",
    minPlayers: 2,
    maxPlayers: 4,
    rankingEnabled: true,
    startsWall: "",
    games: [],
  };
}
