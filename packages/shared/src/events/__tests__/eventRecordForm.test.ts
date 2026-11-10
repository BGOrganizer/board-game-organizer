import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import {
  changeEventDraftGroup,
  eventDateOptionId,
  eventDraft,
  eventDraftInput,
  eventDraftStepIssues,
  eventGroupChangeNeedsConfirmation,
  newTableDraft,
  patchEventDraft,
  patchTableDraft,
  tableDraft,
} from "../eventRecordForm";
import { eventTablePeople } from "../eventTablePeople";
import { previewTableResults } from "../tableScoreForm";

it.each([
  [3, 5, 2, 4, 3, 4],
  [2, 4, 3, 6, 3, 4],
  [8, 10, 2, 4, 4, 4],
  [1, 1, 2, 4, 2, 2],
  [3, 4, 2, 6, 3, 4],
  [6, 3, 2, 6, 6, 6],
  [1, 4, 1, 4, 2, 4],
])(
  "clamps only out-of-range draft counts %s/%s for BGG %s/%s",
  (min, max, gameMin, gameMax, expectedMin, expectedMax) => {
    const row = { ...newTableDraft("table"), minPlayers: min, maxPlayers: max };
    const game = {
      id: 1,
      name: "Known game",
      year: null,
      imageUrl: null,
      minPlayers: gameMin,
      maxPlayers: gameMax,
    };
    const next = patchTableDraft(row, { games: [game] });
    expect(next).toMatchObject({ minPlayers: expectedMin, maxPlayers: expectedMax, games: [game] });
    expect(row).toMatchObject({ minPlayers: min, maxPlayers: max, games: [] });
  },
);
it("recomputes the known envelope on game add, removal and metadata replacement without changing other fields", () => {
  const first = { id: 1, name: "First", year: null, imageUrl: null, minPlayers: 2, maxPlayers: 4 };
  const second = { ...first, id: 2, name: "Second", minPlayers: 3, maxPlayers: 6 };
  const row = {
    ...newTableDraft("existing"),
    id: "persisted",
    name: "My table",
    minPlayers: 3,
    maxPlayers: 5,
    games: [first, second],
  };
  expect(patchTableDraft(row, { games: row.games })).toEqual(row);
  const removed = patchTableDraft(row, { games: [first] });
  expect(removed).toEqual({ ...row, games: [first], maxPlayers: 4 });
  const updated = patchTableDraft(removed, { games: [{ ...first, minPlayers: 5, maxPlayers: 8 }] });
  expect(updated).toMatchObject({
    key: row.key,
    id: row.id,
    name: row.name,
    minPlayers: 5,
    maxPlayers: 5,
    rankingEnabled: true,
  });
  expect(patchTableDraft(updated, { games: [] })).toEqual({ ...updated, games: [] });
  expect(patchTableDraft(row, { name: "Renamed" })).toEqual({ ...row, name: "Renamed" });
  const unknown = { id: 3, name: "Unknown", year: null, imageUrl: null };
  expect(patchTableDraft(row, { games: [unknown] })).toEqual({ ...row, games: [unknown] });
  expect(patchTableDraft(row, { games: [unknown, first] })).toMatchObject({
    minPlayers: 3,
    maxPlayers: 4,
  });
});
it("keeps solo-only games invalid instead of reducing the Table minimum or weakening validation", () => {
  const games = [{ id: 1, name: "Solo", year: null, imageUrl: null, minPlayers: 1, maxPlayers: 1 }];
  const row = patchTableDraft({ ...newTableDraft("solo"), name: "Solo table" }, { games });
  expect(row).toMatchObject({ minPlayers: 2, maxPlayers: 2 });
  expect(eventDraftStepIssues({ ...eventDraft(event), tables: [row] }, false, 2)).toContain(
    "tables.0.maxPlayers",
  );
});

it("validates known game bounds in drafts without inventing limits for unknown games", () => {
  const draft = { ...eventDraft(event), tables: [tableDraft(table, event.timeZone)] };
  draft.tables[0].games[0] = { ...draft.tables[0].games[0], minPlayers: 3, maxPlayers: 6 };
  draft.tables[0].minPlayers = 2;
  draft.tables[0].maxPlayers = 7;
  expect(eventDraftStepIssues(draft, false, 2)).toEqual(
    expect.arrayContaining(["tables.0.minPlayers", "tables.0.maxPlayers"]),
  );
  draft.tables[0].minPlayers = 3;
  draft.tables[0].maxPlayers = 6;
  expect(eventDraftStepIssues(draft, false, 2)).toEqual([]);
  expect(eventDraftInput(draft, false).success).toBe(true);
});

const id = "11111111-1111-4111-8111-111111111111",
  tableId = "22222222-2222-4222-8222-222222222222",
  dateId = "00000000-0000-4000-8000-000000000001";
const event: PlannedEventResponse = {
  id,
  groupId: null,
  adminUserId: "owner",
  name: "Friday games",
  timeZone: "Europe/Rome",
  startTime: "20:00",
  status: "PLANNING",
  dates: [{ id: dateId, day: "2030-06-03" }],
  locations: [
    {
      id,
      name: "Club venue",
      address: "Via Roma 1",
      latitude: 41.9,
      longitude: 12.5,
      timeZone: "Europe/Rome",
    },
  ],
  version: 2,
  planningGeneration: 1,
  createdAt: "2030-06-01T10:00:00.000Z",
  updatedAt: "2030-06-01T10:00:00.000Z",
  role: "admin",
  groupName: null,
  groupType: null,
  tableCount: 1,
  participantCount: 0,
  myRegistrations: [],
  canEdit: true,
  canInvite: true,
  canRegister: true,
  canVote: false,
  canConfirm: false,
  canReplan: false,
  canFinalize: false,
};
const table: PlannedTableResponse = {
  id: tableId,
  eventId: id,
  name: "Table one",
  order: 0,
  minPlayers: 2,
  maxPlayers: 4,
  rankingEnabled: true,
  games: [{ gameId: 1, durationMinutes: 75, durationSource: "MANUAL" }],
  gamesDetail: [],
  eventName: event.name,
  eventStatus: "PLANNING",
  groupId: null,
  groupType: null,
  adminUserId: "owner",
  myRegistration: null,
  myPosition: null,
  seatedCount: 0,
  waitingCount: 0,
  pendingCount: 0,
  canRegister: true,
  canRespond: false,
  canLeave: false,
  canInvite: true,
  ratingChanges: [],
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
};
it("retains opt-in proposal fields for standalone and private Group drafts and defaults historical data off", () => {
  expect(eventDraft(event)).toMatchObject({
    allowParticipantDates: false,
    allowParticipantLocations: false,
  });
  expect(tableDraft(table, event.timeZone).allowParticipantGames).toBe(false);
  const source = {
    ...event,
    groupId: id,
    groupType: "PRIVATE" as const,
    allowParticipantDates: true,
    allowParticipantLocations: true,
  };
  const draft = {
    ...eventDraft(source),
    tables: [tableDraft({ ...table, allowParticipantGames: true }, event.timeZone)],
  };
  expect(eventDraftInput(draft, false)).toMatchObject({
    success: true,
    data: {
      allowParticipantDates: true,
      allowParticipantLocations: true,
      tables: [{ allowParticipantGames: true }],
    },
  });
  const standalone = eventDraftInput({ ...draft, groupId: null }, false);
  expect(standalone).toMatchObject({
    success: true,
    data: {
      allowParticipantDates: true,
      allowParticipantLocations: true,
      tables: [{ allowParticipantGames: true }],
    },
  });
  const publicDraft = {
    ...draft,
    endsWall: "2030-06-03T23:00",
    cutoffWall: "2030-06-02T20:00",
    tables: draft.tables.map((row) => ({ ...row, startsWall: "2030-06-03T20:00" })),
  };
  expect(eventDraftInput(publicDraft, true)).toMatchObject({
    success: true,
    data: {
      allowParticipantDates: false,
      allowParticipantLocations: false,
      tables: [{ allowParticipantGames: false }],
    },
  });
});
it("projects live seats with optional name/email and immutable ND order without inventing profiles", () => {
  const row: TableSeatResponse = {
    id: tableId,
    eventId: id,
    tableId,
    userId: "guest",
    kind: "SELF",
    status: "ACCEPTED",
    priorityAt: event.createdAt,
    sequence: 1,
    version: 1,
    gameVotes: {},
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    name: "Guest",
    email: "guest@example.test",
    avatarUrl: null,
    username: null,
    position: "SEATED",
  };
  expect(eventTablePeople(table, [row])[0]).toMatchObject({
    key: tableId,
    name: "Guest",
    email: row.email,
    registration: row,
    profileLoaded: true,
  });
  expect(eventTablePeople(table, [{ ...row, name: null, email: undefined }])[0]).toMatchObject({
    name: "guest",
    email: null,
  });
  expect(
    eventTablePeople(
      {
        ...table,
        eventStatus: "TERMINATED",
        results: {
          lowerWins: false,
          entries: [
            { userId: "guest", score: null, rank: null },
            { userId: "owner", score: "10", rank: 1 },
          ],
          tieBreaks: [],
          finalizedAt: event.createdAt,
        },
      },
      [],
    ).map((p) => p.userId),
  ).toEqual(["owner", "guest"]);
});

it("validates private date/time and location proposals, rejects duplicate or invalid combinations and preserves independent clock identities", () => {
  const draft = {
    ...eventDraft({ ...event, groupId: id }),
    tables: [tableDraft(table, event.timeZone)],
  };
  draft.dates = [
    { id: dateId, day: "2030-06-03", startTime: "18:15" },
    { id, day: "2030-06-03", startTime: "21:30" },
  ];
  draft.locations.push({
    ...draft.locations[0],
    id: tableId,
    latitude: 40.71,
    longitude: -74.01,
    timeZone: "America/New_York",
  });
  expect(eventDraftInput(draft, false).success).toBe(true);
  expect(eventDraftStepIssues(draft, false, 1)).toEqual([]);
  expect(eventDraftStepIssues({ ...draft, groupId: null }, false, 1)).toEqual([]);
  expect(eventDraftStepIssues(draft, true, 1)).toEqual(
    expect.arrayContaining(["dates", "locations"]),
  );
  expect(
    eventDraftInput({ ...draft, dates: [draft.dates[0], { ...draft.dates[0], id }] }, false)
      .success,
  ).toBe(false);
  const gap = { ...draft, dates: [{ id: dateId, day: "2030-03-31", startTime: "02:30" }] };
  expect(eventDraftStepIssues(gap, false, 1)).toContain("dates");
  const moved = patchEventDraft(draft, { locations: draft.locations.slice(1) }, [], true);
  expect(moved.dates).toEqual(draft.dates);
  const loaded = eventDraft({
    ...event,
    groupId: id,
    groupType: "PRIVATE",
    timeZone: "America/New_York",
    dates: draft.dates,
  });
  expect(loaded.dates).toEqual(draft.dates);
  const editedClock = patchEventDraft(
    draft,
    { dates: [draft.dates[0], { ...draft.dates[1], startTime: "22:00" }] },
    [],
    true,
  );
  expect(editedClock.dates[0].id).toBe(draft.dates[0].id);
  expect(editedClock.dates[1].id).not.toBe(draft.dates[1].id);
  const changedDefault = patchEventDraft(draft, { startTime: "22:00" });
  expect(changedDefault.dates).toEqual(draft.dates);
  const legacy = { ...draft, dates: [{ id: dateId, day: "2030-06-03" }, draft.dates[1]] };
  const changedLegacy = patchEventDraft(legacy, { startTime: "22:00" });
  expect(changedLegacy.dates[0].id).not.toBe(dateId);
  expect(changedLegacy.dates[1].id).toBe(draft.dates[1].id);
});
describe("unified unsaved event drafts", () => {
  it("preserves flexible options across private/standalone groups and never publishes on group selection", () => {
    const draft = {
      ...eventDraft(event),
      visibility: "PUBLIC" as const,
      dates: [...event.dates, { id: tableId, day: "2030-06-04" }],
      locations: [...event.locations, { ...event.locations[0], id: tableId }],
      allowParticipantDates: true,
      allowParticipantLocations: true,
      tables: [{ ...tableDraft(table, event.timeZone), allowParticipantGames: true }],
    };
    expect(eventGroupChangeNeedsConfirmation(draft, false)).toBe(false);
    expect(eventGroupChangeNeedsConfirmation(draft, true)).toBe(true);
    const privateDraft = changeEventDraftGroup(draft, id, "PRIVATE");
    expect(privateDraft).toMatchObject({ ...draft, groupId: id, visibility: "PRIVATE" });
    expect(changeEventDraftGroup(privateDraft, null, null)).toMatchObject({
      ...privateDraft,
      groupId: null,
      visibility: "PRIVATE",
    });
    const publicDraft = changeEventDraftGroup(draft, id, "PUBLIC");
    expect(publicDraft).toMatchObject({
      groupId: id,
      visibility: "PRIVATE",
      dates: [draft.dates[0]],
      locations: [draft.locations[0]],
      allowParticipantDates: false,
      allowParticipantLocations: false,
      tables: [{ ...draft.tables[0], allowParticipantGames: false }],
    });
    expect(eventGroupChangeNeedsConfirmation(publicDraft, true)).toBe(false);
    expect(changeEventDraftGroup(publicDraft, id, "PUBLIC")).toBe(publicDraft);
    expect(draft.dates).toHaveLength(2);
    expect(draft.allowParticipantDates).toBe(true);
    for (const flag of ["allowParticipantDates", "allowParticipantLocations"] as const)
      expect(eventGroupChangeNeedsConfirmation({ ...eventDraft(event), [flag]: true }, true)).toBe(
        true,
      );
    expect(
      eventGroupChangeNeedsConfirmation(
        {
          ...eventDraft(event),
          tables: [{ ...tableDraft(table, event.timeZone), allowParticipantGames: true }],
        },
        true,
      ),
    ).toBe(true);
  });
  it("allocates only per-event option identities and preserves stable dates and snapshots", () => {
    expect(eventDateOptionId([])).toBe(dateId);
    expect(eventDateOptionId([{ id: dateId }])).toBe("00000000-0000-4000-8000-000000000002");
    expect(eventDraft(event)).toMatchObject({
      version: 2,
      dates: event.dates,
      locations: event.locations,
    });
    expect(eventDraft(undefined, id).groupId).toBe(id);
    expect(eventDraft().groupId).toBeNull();
  });
  it("copies saved historical durations and fixed-time walls without manufacturing manual inputs", () => {
    expect(tableDraft(table, event.timeZone).games[0]).toMatchObject({
      id: 1,
      durationMinutes: 75,
      year: null,
    });
    expect(
      tableDraft(
        {
          ...table,
          startsAt: "2030-06-03T18:00:00Z",
          games: [{ gameId: 1, durationSource: "BGG", durationMinutes: 60 }],
          gamesDetail: [{ id: 1, name: "Game", imageUrl: null, year: 2000, maxPlayMinutes: 60 }],
        },
        event.timeZone,
      ),
    ).toMatchObject({
      startsWall: "2030-06-03T20:00:00",
      games: [{ durationMinutes: 60, name: "Game" }],
    });
  });
  it("validates creation and explicit partial edits, never deleting unloaded tables", () => {
    const draft = {
      ...eventDraft(event),
      tables: [tableDraft(table, event.timeZone)],
      removedTableIds: [id],
    };
    const edited = eventDraftInput(draft, false);
    expect(edited.success).toBe(true);
    if (edited.success)
      expect(edited.data).toMatchObject({
        version: 2,
        removedTableIds: [id],
        tables: [{ id: tableId, games: [{ gameId: 1 }] }],
      });
    const created = eventDraftInput(
      {
        ...draft,
        version: undefined,
        tables: [
          {
            ...newTableDraft("new"),
            name: "Second",
            games: [{ id: 1, name: "Game", year: null, imageUrl: null }],
          },
        ],
      },
      false,
    );
    expect(created.success).toBe(true);
    if (created.success) expect("id" in created.data.tables[0]).toBe(false);
  });
  it("reads historical overnight instants but only writes same-day public ends, and rejects DST gaps/invalid zones", () => {
    const draft = {
      ...eventDraft({
        ...event,
        endsAt: "2030-06-04T01:00:00Z",
        bookingClosesAt: "2030-06-02T10:00:00Z",
      }),
      tables: [
        {
          ...tableDraft(table, event.timeZone),
          startsWall: "2030-06-03T20:01",
          demonstratorUserId: "demo",
        },
      ],
    };
    expect(draft.endsWall).toBe("2030-06-04T03:00:00");
    expect(eventDraftInput(draft, true).success).toBe(false);
    const value = eventDraftInput({ ...draft, endsWall: "2030-06-03T23:00" }, true);
    expect(value.success).toBe(true);
    if (value.success)
      expect(value.data).toMatchObject({
        endsAt: "2030-06-03T21:00:00.000Z",
        tables: [{ demonstratorUserId: "demo", startsAt: "2030-06-03T18:01:00.000Z" }],
      });
    expect(eventDraftInput({ ...draft, endsWall: "2030-03-31T02:30" }, true).success).toBe(false);
    expect(
      eventDraftInput({ ...draft, endsWall: "2030-06-03T23:00", timeZone: "invalid-zone" }, true)
        .success,
    ).toBe(true);
    expect(
      eventDraftInput(
        { ...draft, locations: [{ ...event.locations[0], timeZone: "invalid-zone" }] },
        true,
      ).success,
    ).toBe(false);
    expect(eventDraftInput({ ...draft, version: undefined, tables: [] }, false).success).toBe(
      false,
    );
  });
  it("creates independent defaults and leaves optional demonstrators/durations absent", () => {
    const a = newTableDraft("one"),
      b = newTableDraft("two");
    a.games.push({ id: 1, name: "Game", year: null, imageUrl: null, maxPlayMinutes: 60 });
    expect(b.games).toEqual([]);
    const input = eventDraftInput(
      {
        ...eventDraft(event),
        tables: [{ ...a, name: "One", startsWall: "2030-06-03T20:01" }],
        endsWall: "2030-06-03T23:00",
        cutoffWall: "2030-06-02T20:00",
      },
      true,
    );
    expect(input.success).toBe(true);
  });
});
describe("location-owned schedule and staged validation", () => {
  const valid = () => ({
    ...eventDraft({
      ...event,
      endsAt: "2030-06-03T21:00:00Z",
      bookingClosesAt: "2030-06-02T10:00:00Z",
    }),
    tables: [{ ...tableDraft(table, event.timeZone), startsWall: "2030-06-03T20:01" }],
  });
  it("validates schedule independently from tables and reports exact field paths", () => {
    const draft = valid();
    expect(eventDraftStepIssues({ ...draft, tables: [] }, false, 1)).toEqual([]);
    expect(eventDraftStepIssues(draft, true, 1)).toEqual([]);
    expect(eventDraftStepIssues(draft, true, 2)).toEqual([]);
    expect(
      eventDraftStepIssues({ ...draft, name: "", dates: [], locations: [] }, false, 1),
    ).toEqual(expect.arrayContaining(["dates", "locations", "timeZone"]));
    expect(
      eventDraftStepIssues({ ...draft, name: "", dates: [], locations: [] }, false, 0),
    ).toEqual(["name"]);
    expect(eventDraftStepIssues(draft, true, 3)).toEqual([]);
    expect(eventDraftStepIssues({ ...draft, version: undefined, tables: [] }, false, 2)).toEqual([
      "tables",
    ]);
    expect(eventDraftStepIssues({ ...draft, tables: [] }, false, 2)).toEqual([]);
    expect(
      eventDraftStepIssues(
        {
          ...draft,
          tables: [{ ...draft.tables[0], name: "", minPlayers: 1, maxPlayers: 1, games: [] }],
        },
        false,
        2,
      ),
    ).toEqual(
      expect.arrayContaining([
        "tables.0.name",
        "tables.0.minPlayers",
        "tables.0.maxPlayers",
        "tables.0.games",
      ]),
    );
    expect(
      eventDraftStepIssues(
        { ...draft, tables: [{ ...draft.tables[0], minPlayers: 3, maxPlayers: 2 }] },
        false,
        2,
      ),
    ).toContain("tables.0.maxPlayers");
    expect(
      eventDraftStepIssues(
        {
          ...draft,
          dates: [...draft.dates, { id: tableId, day: "2030-06-04" }],
          locations: [...draft.locations, { ...draft.locations[0], id: tableId }],
        },
        true,
        1,
      ),
    ).toEqual(expect.arrayContaining(["dates", "locations"]));
  });
  it("uses verified venue metadata instead of a device or caller zone and renews only changed date identities", () => {
    expect(eventDraft().timeZone).toBe("UTC");
    const legacy = { ...event, timeZone: "UTC" };
    const draft = eventDraft(legacy);
    expect(draft.timeZone).toBe("Europe/Rome");
    expect(draft.dates[0].id).not.toBe(dateId);
    expect(legacy.dates[0].id).toBe(dateId);
    expect(eventDraft({ ...event, locations: [] }).timeZone).toBe("Europe/Rome");
    const named = patchEventDraft(draft, { name: "Another game night" });
    expect(named.dates).toBe(draft.dates);
    expect(patchEventDraft(draft, { timeZone: "invalid" }).timeZone).toBe("Europe/Rome");
    const moved = patchEventDraft(
      draft,
      { locations: [{ ...draft.locations[0], timeZone: "Asia/Tokyo" }] },
      event.dates,
    );
    expect(moved.timeZone).toBe("Asia/Tokyo");
    expect(moved.dates[0].id).not.toBe(draft.dates[0].id);
    expect(moved.dates[0].id).not.toBe(dateId);
    const changed = patchEventDraft(draft, { startTime: "21:00" }, event.dates);
    expect(changed.dates[0].id).not.toBe(draft.dates[0].id);
    expect(patchEventDraft(draft, { locations: [] }).timeZone).toBe("Europe/Rome");
    expect(eventDraftInput({ ...valid(), timeZone: "Pacific/Honolulu" }, false).success).toBe(true);
    expect(
      eventDraftInput(
        { ...valid(), locations: [{ ...event.locations[0], timeZone: undefined }] },
        false,
      ).success,
    ).toBe(false);
  });
  it.each([
    { endsWall: "", cutoffWall: "2030-06-02T12:00", field: "endsAt" },
    { endsWall: "2030-06-03T19:00", cutoffWall: "2030-06-02T12:00", field: "endsAt" },
    { endsWall: "2030-06-04T03:00", cutoffWall: "", field: "bookingClosesAt" },
    { endsWall: "2030-06-04T03:00", cutoffWall: "2030-06-03T20:00", field: "bookingClosesAt" },
    { endsWall: "2030-06-03T23:00", cutoffWall: "2030-06-03T19:59", field: "bookingClosesAt" },
  ])("requires public endpoints and correct order: $field", ({ endsWall, cutoffWall, field }) => {
    const draft = { ...valid(), endsWall, cutoffWall };
    expect(eventDraftStepIssues(draft, true, 1)).toContain(field);
    expect(eventDraftInput(draft, true).success).toBe(false);
  });
  it("refuses nonexistent local starts, while private events do not require public endpoints", () => {
    const draft = { ...valid(), dates: [{ id: dateId, day: "2030-03-31" }], startTime: "02:30" };
    expect(eventDraftStepIssues(draft, false, 1)).toContain("startTime");
    expect(eventDraftInput(draft, false).success).toBe(false);
    expect(eventDraftStepIssues({ ...valid(), endsWall: "", cutoffWall: "" }, false, 1)).toEqual(
      [],
    );
    expect(eventDraftStepIssues({ ...valid(), locations: [] }, true, 1)).toContain("timeZone");
    expect(eventDraftStepIssues({ ...valid(), dates: [] }, true, 1)).toContain("dates");
  });
  it("requires future cutoffs for creation but preserves existing historical clocks", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-06-02T11:00:00Z"));
    try {
      const draft = { ...valid(), version: undefined };
      expect(eventDraftStepIssues(draft, true, 1)).toContain("bookingClosesAt");
      expect(eventDraftStepIssues(valid(), true, 1)).not.toContain("bookingClosesAt");
    } finally {
      clock.mockRestore();
    }
  });
  it.each(["", "2030-06-03T19:00", "2030-06-04T03:00", "2030-06-04T02:30"])(
    "requires table starts and complete durations inside public event: %s",
    (startsWall) => {
      const draft = valid();
      draft.tables[0].startsWall = startsWall;
      expect(eventDraftStepIssues(draft, true, 2)).toContain("tables.0.startsAt");
    },
  );
  it.each(["2030-06-03T20:00", "2030-06-03T22:00"])(
    "accepts inclusive table start bounds while keeping the full duration inside: %s",
    (startsWall) => {
      const draft = valid();
      draft.tables[0].startsWall = startsWall;
      draft.tables[0].games[0] = {
        ...draft.tables[0].games[0],
        durationMinutes: undefined,
        maxPlayMinutes: 60,
      };
      expect(eventDraftStepIssues(draft, true, 2)).toEqual([]);
      expect(eventDraftInput(draft, true).success).toBe(true);
    },
  );
  it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "uses automatic 120-minute fallback for invalid/missing catalog duration, preserving full-duration bounds: %s",
    (duration) => {
      const draft = valid();
      draft.tables[0].games[0] = {
        ...draft.tables[0].games[0],
        durationMinutes: undefined,
        maxPlayMinutes: duration,
      };
      draft.tables[0].startsWall = "2030-06-03T21:00";
      expect(eventDraftStepIssues(draft, true, 2)).toEqual([]);
      expect(eventDraftInput(draft, true).success).toBe(true);
      draft.tables[0].startsWall = "2030-06-03T21:01";
      expect(eventDraftStepIssues(draft, true, 2)).toContain("tables.0.startsAt");
      expect(eventDraftInput(draft, true).success).toBe(false);
    },
  );
  it("accepts BGG durations without manufacturing manual overrides, and reports each timing error once", () => {
    const draft = valid();
    draft.tables[0].games[0] = {
      ...draft.tables[0].games[0],
      maxPlayMinutes: 60,
      manualDurationMinutes: undefined,
    };
    expect(eventDraftStepIssues(draft, true, 2)).toEqual([]);
    expect(eventDraftInput(draft, true).success).toBe(true);
    draft.tables[0].startsWall = "2030-06-04T04:00";
    expect(
      eventDraftStepIssues(draft, true, 2).filter((path) => path === "tables.0.startsAt"),
    ).toHaveLength(1);
    expect(
      eventDraftStepIssues({ ...draft, endsWall: "", dates: [], locations: [] }, true, 2),
    ).toContain("tables.0.startsAt");
    expect(eventDraftStepIssues({ ...valid(), endsWall: "" }, true, 2)).toEqual([]);
  });
});
it("allows all-ND physical tables but never incomplete or empty score drafts, retaining exact tied decimals", () => {
  expect(previewTableResults([], false, []).valid).toBe(false);
  expect(
    previewTableResults([{ userId: "a", rawScore: "", notParticipated: false }], false, []).valid,
  ).toBe(false);
  expect(
    previewTableResults([{ userId: "a", rawScore: "", notParticipated: true }], false, []).valid,
  ).toBe(true);
  const result = previewTableResults(
    [
      { userId: "a", rawScore: "-1,50", notParticipated: false },
      { userId: "b", rawScore: "-1.5", notParticipated: false },
    ],
    true,
    [{ score: "-1.5", orderedUserIds: ["b", "a"] }],
  );
  expect(result.ranked.map((row) => row.userId)).toEqual(["b", "a"]);
});
it("projects immutable result ranks/profiles/deltas separately from paginated active registration rows", () => {
  expect(eventTablePeople(table, [])).toEqual([]);
  expect(eventTablePeople({ ...table, eventStatus: "TERMINATED" }, [])).toEqual([]);
  const rows = eventTablePeople(
    {
      ...table,
      eventStatus: "TERMINATED",
      results: {
        lowerWins: false,
        finalizedAt: event.createdAt,
        tieBreaks: [],
        entries: [
          { userId: "a", rank: 2, score: "1" },
          { userId: "b", rank: 1, score: "2" },
          { userId: "c", rank: null, score: null },
        ],
      },
      resultProfiles: [{ userId: "b", name: "Bob", email: "bob@example.test", avatarUrl: null }],
      ratingChanges: [{ userId: "b", score: 500, delta: 5, provisional: true }],
      groupRatingChanges: [{ userId: "b", score: 500, delta: 3, provisional: true }],
    },
    [],
  );
  expect(rows[0]).toMatchObject({
    userId: "b",
    name: "Bob",
    delta: 5,
    groupDelta: 3,
    profileLoaded: true,
  });
  expect(rows[2]).toMatchObject({ userId: "c", profileLoaded: false });
});
