import {
  type BggSearchItem,
  createPlannedEventSchema,
  editPlannedEventSchema,
  type PlannedEventResponse,
  type PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { eventLocalDateTime, eventLocalToIso } from "./eventForm";
import { eventDateWall } from "./eventRecordPolicy";
import { publicEventEndIsValid } from "./eventSchedule";
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
  demonstratorAvatarUrl?: string | null;
  games: Array<BggSearchItem & { manualDurationMinutes?: number }>;
};
export type EventRecordDraft = {
  name: string;
  groupId: string | null;
  timeZone: string;
  startTime: string;
  endsWall: string;
  cutoffWall: string;
  dates: PlannedEventResponse["dates"];
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
    demonstratorAvatarUrl: row.demonstratorAvatarUrl,
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
  const zone = data?.locations[0]?.timeZone ?? data?.timeZone ?? "UTC";
  const used = [...(data?.dates ?? [])];
  const dates = (data?.dates ?? []).map((date) => {
    if (
      !data ||
      data.timeZone === zone ||
      (data.groupType === "PRIVATE" && date.startTime !== undefined)
    )
      return { ...date };
    const id = eventDateOptionId(used);
    used.push({ ...date, id });
    return { ...date, id };
  });
  return {
    name: data?.name ?? "",
    groupId: data?.groupId ?? groupId ?? null,
    timeZone: zone,
    startTime: data?.startTime ?? "20:00",
    endsWall: data?.endsAt ? eventLocalDateTime(data.endsAt, zone) : "",
    cutoffWall: data?.bookingClosesAt ? eventLocalDateTime(data.bookingClosesAt, zone) : "",
    dates,
    locations: data?.locations.map((l) => ({ ...l })) ?? [],
    tables: [],
    removedTableIds: [],
    version: data?.version,
  };
}
function draftIso(wall: string, zone: string) {
  try {
    return eventLocalToIso(wall, zone);
  } catch {
    return undefined;
  }
}
function draftPayload(draft: EventRecordDraft, publicGroup: boolean) {
  const zone = draft.locations[0]?.timeZone ?? "";
  return {
    name: draft.name,
    timeZone: zone,
    startTime: draft.startTime,
    dates: draft.dates,
    locations: draft.locations,
    ...(publicGroup
      ? {
          endsAt: draftIso(draft.endsWall, zone),
          bookingClosesAt: draftIso(draft.cutoffWall, zone),
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
            startsAt: draftIso(row.startsWall, zone),
            ...(row.demonstratorUserId ? { demonstratorUserId: row.demonstratorUserId } : {}),
          }
        : {}),
    })),
  };
}
function draftPolicyErrors(
  draft: EventRecordDraft,
  publicGroup: boolean,
): Array<Array<string | number>> {
  const errors: Array<Array<string | number>> = [];
  const zone = draft.locations[0]?.timeZone;
  const day = draft.dates[0]?.day;
  const start = zone && day ? draftIso(eventDateWall(draft, draft.dates[0]), zone) : undefined;
  const flexible = Boolean(draft.groupId && !publicGroup);
  if (!flexible && draft.dates.length !== 1) errors.push(["dates"]);
  if (!flexible && draft.locations.length !== 1) errors.push(["locations"]);
  if (new Set(draft.dates.map((date) => eventDateWall(draft, date))).size !== draft.dates.length)
    errors.push(["dates"]);
  for (const date of draft.dates)
    for (const location of draft.locations)
      if (!location.timeZone || !draftIso(eventDateWall(draft, date), location.timeZone))
        errors.push(["dates"]);
  if (zone && day && !start) errors.push(["startTime"]);
  if (!publicGroup) return errors;
  const end = zone ? draftIso(draft.endsWall, zone) : undefined;
  const cutoff = zone ? draftIso(draft.cutoffWall, zone) : undefined;
  if (
    !end ||
    (start && !publicEventEndIsValid(eventDateWall(draft, draft.dates[0]), draft.endsWall))
  )
    errors.push(["endsAt"]);
  if (
    !cutoff ||
    (start &&
      (Date.parse(cutoff) >= Date.parse(start) ||
        draft.cutoffWall.slice(0, 10) >= draft.dates[0].day)) ||
    (draft.version === undefined && Date.parse(cutoff) <= Date.now())
  )
    errors.push(["bookingClosesAt"]);
  draft.tables.forEach((row, index) => {
    const at = zone ? draftIso(row.startsWall, zone) : undefined;
    if (
      !at ||
      (start && Date.parse(at) < Date.parse(start)) ||
      (end && Date.parse(at) >= Date.parse(end))
    )
      errors.push(["tables", index, "startsAt"]);
    row.games.forEach((game, gameIndex) => {
      const duration = game.maxPlayMinutes ?? game.manualDurationMinutes;
      if (!duration || !Number.isSafeInteger(duration) || duration < 1)
        errors.push(["tables", index, "games", gameIndex, "manualDurationMinutes"]);
      else if (at && end && Date.parse(at) + duration * 60_000 > Date.parse(end))
        errors.push(["tables", index, "startsAt"]);
    });
  });
  return errors;
}
/** Stage-specific validation reuses the write DTOs without inventing placeholder tables. */
export function eventDraftStepIssues(
  draft: EventRecordDraft,
  publicGroup: boolean,
  step: number,
): string[] {
  const { tables, ...schedule } = draftPayload(draft, publicGroup);
  const result =
    step === 0
      ? createPlannedEventSchema
          .omit({ tables: true })
          .safeParse({ ...schedule, groupId: draft.groupId })
      : (draft.version === undefined
          ? createPlannedEventSchema
          : editPlannedEventSchema
        ).shape.tables.safeParse(tables);
  const paths = result.success
    ? []
    : result.error.issues.map((issue) =>
        (step === 0 ? issue.path : ["tables", ...issue.path]).join("."),
      );
  return [
    ...new Set([
      ...paths,
      ...draftPolicyErrors(draft, publicGroup)
        .filter((path) => (path[0] === "tables") === (step !== 0))
        .map((path) => path.join(".")),
    ]),
  ];
}
export function eventDraftInput(draft: EventRecordDraft, publicGroup: boolean) {
  const base = draftPayload(draft, publicGroup);
  const policy = draftPolicyErrors(draft, publicGroup);
  const schema = draft.version === undefined ? createPlannedEventSchema : editPlannedEventSchema;
  return schema
    .superRefine((_, context) => {
      for (const path of policy)
        context.addIssue({
          code: "custom",
          path,
          message: "Check the event schedule and duration.",
        });
    })
    .safeParse(
      draft.version === undefined
        ? { ...base, groupId: draft.groupId }
        : { ...base, version: draft.version, removedTableIds: draft.removedTableIds },
    );
}
export function patchEventDraft(
  old: EventRecordDraft,
  change: Partial<EventRecordDraft>,
  originalDates: readonly { id: string }[] = [],
  privateGroup = false,
): EventRecordDraft {
  const next = { ...old, ...change };
  next.timeZone = next.locations[0]?.timeZone ?? old.timeZone;
  if (
    next.startTime !== old.startTime ||
    next.timeZone !== old.timeZone ||
    next.dates !== old.dates
  ) {
    const used = [...originalDates, ...old.dates, ...next.dates];
    next.dates = next.dates.map((row) => {
      const previous = old.dates.find((date) => date.id === row.id);
      if (
        !previous ||
        (eventDateWall(old, previous) === eventDateWall(next, row) &&
          (next.timeZone === old.timeZone ||
            (privateGroup && previous.startTime !== undefined && row.startTime !== undefined)))
      )
        return row;
      const id = eventDateOptionId(used);
      used.push({ id });
      return { ...row, id };
    });
  }
  return next;
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
