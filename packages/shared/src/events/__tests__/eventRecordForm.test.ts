import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  eventDateOptionId,
  eventDraft,
  eventDraftInput,
  newTableDraft,
  tableDraft,
} from "../eventRecordForm";
import { eventTablePeople } from "../eventTablePeople";
import { previewTableResults } from "../tableScoreForm";

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
  locations: [{ id, name: "Club venue", address: "Via Roma 1", latitude: 41.9, longitude: 12.5 }],
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
    position: "seated",
  };
  expect(eventTablePeople(table, [row])[0]).toMatchObject({
    key: tableId,
    name: "Guest",
    email: row.email,
    registration: row,
    profileLoaded: true,
  });
  expect(eventTablePeople(table, [{ ...row, name: undefined, email: undefined }])[0]).toMatchObject(
    { name: "guest", email: null },
  );
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

describe("unified unsaved event drafts", () => {
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
  it("copies manual durations, missing metadata and fixed-time walls without converting BGG data to manual", () => {
    expect(tableDraft(table, event.timeZone).games[0]).toMatchObject({
      id: 1,
      manualDurationMinutes: 75,
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
      games: [{ manualDurationMinutes: undefined, name: "Game" }],
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
        tables: [{ id: tableId, games: [{ gameId: 1, manualDurationMinutes: 75 }] }],
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
  it("converts public endpoints to ISO instants including overnight dates, and rejects DST gaps/invalid zones", () => {
    const draft = {
      ...eventDraft({
        ...event,
        endsAt: "2030-06-04T01:00:00Z",
        bookingClosesAt: "2030-06-02T10:00:00Z",
      }),
      tables: [
        {
          ...tableDraft(table, event.timeZone),
          startsWall: "2030-06-03T20:00",
          demonstratorUserId: "demo",
        },
      ],
    };
    expect(draft.endsWall).toBe("2030-06-04T03:00:00");
    const value = eventDraftInput(draft, true);
    expect(value.success).toBe(true);
    if (value.success)
      expect(value.data).toMatchObject({
        endsAt: "2030-06-04T01:00:00.000Z",
        tables: [{ demonstratorUserId: "demo", startsAt: "2030-06-03T18:00:00.000Z" }],
      });
    expect(eventDraftInput({ ...draft, endsWall: "2030-03-31T02:30" }, true).success).toBe(false);
    expect(eventDraftInput({ ...draft, timeZone: "invalid-zone" }, true).success).toBe(false);
    expect(eventDraftInput({ ...draft, version: undefined, tables: [] }, false).success).toBe(
      false,
    );
  });
  it("creates independent defaults and leaves optional demonstrators/durations absent", () => {
    const a = newTableDraft("one"),
      b = newTableDraft("two");
    a.games.push({ id: 1, name: "Game", year: null, imageUrl: null });
    expect(b.games).toEqual([]);
    const input = eventDraftInput(
      {
        ...eventDraft(event),
        tables: [{ ...a, name: "One", startsWall: "2030-06-03T20:00" }],
        endsWall: "2030-06-04T03:00",
        cutoffWall: "2030-06-02T20:00",
      },
      true,
    );
    expect(input.success).toBe(true);
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
