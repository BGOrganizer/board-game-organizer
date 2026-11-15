import type {
  ChangeEventVoteInput,
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { optimisticEventVote } from "../eventOptimisticVote";

const eventId = "11111111-1111-4111-8111-111111111111",
  tableId = "22222222-2222-4222-8222-222222222222",
  dateId = "33333333-3333-4333-8333-333333333333",
  locationId = "44444444-4444-4444-8444-444444444444";
const at = "2030-01-01T12:00:00Z",
  counts = { YES: 1, NO: 0, IF_NEEDED: 0, UNKNOWN: 1 };
const registration: TableSeatResponse = {
  id: dateId,
  eventId,
  tableId,
  userId: "owner",
  kind: "SELF",
  status: "ACCEPTED",
  priorityAt: at,
  sequence: 1,
  version: 5,
  gameVotes: { "1": "YES", "2": "YES" },
  createdAt: at,
  updatedAt: at,
  name: "Owner",
  username: "owner",
  email: null,
  avatarUrl: null,
  position: "SEATED",
};
const event: PlannedEventResponse = {
  id: eventId,
  groupId: dateId,
  adminUserId: "owner",
  name: "Friday games",
  timeZone: "Europe/Rome",
  startTime: "20:00",
  dates: [
    { id: dateId, day: "2030-06-01" },
    { id: tableId, day: "2030-06-02" },
  ],
  locations: [
    {
      id: locationId,
      name: "Club",
      address: "Via Roma 1",
      latitude: 41.9,
      longitude: 12.5,
      timeZone: "Europe/Rome",
    },
    {
      id: tableId,
      name: "Second venue",
      address: "Via Milano 2",
      latitude: 41.91,
      longitude: 12.5,
      timeZone: "Europe/Rome",
    },
  ],
  status: "PLANNING",
  version: 5,
  planningGeneration: 1,
  createdAt: at,
  updatedAt: at,
  groupType: "PRIVATE",
  groupName: "Club group",
  role: "admin",
  tableCount: 1,
  participantCount: 2,
  myRegistrations: [registration],
  myVotes: {
    dateVotes: { [dateId]: "YES", [tableId]: "YES" },
    locationVotes: { [locationId]: "YES", [tableId]: "YES" },
  },
  voteCounts: { dates: { [dateId]: counts }, locations: { [locationId]: counts } },
  canEdit: true,
  canInvite: true,
  canRegister: false,
  canVote: true,
  canConfirm: false,
  canReplan: false,
  canFinalize: false,
};
const table: PlannedTableResponse = {
  id: tableId,
  eventId,
  order: 0,
  name: "First table",
  minPlayers: 2,
  maxPlayers: 4,
  games: [
    { gameId: 1, durationMinutes: 60, durationSource: "BGG" },
    { gameId: 2, durationMinutes: 60, durationSource: "BGG" },
  ],
  rankingEnabled: true,
  createdAt: at,
  updatedAt: at,
  eventName: event.name,
  groupName: event.groupName,
  groupId: event.groupId,
  groupType: "PRIVATE",
  eventStatus: "PLANNING",
  adminUserId: "owner",
  myRegistration: registration,
  myPosition: "SEATED",
  acceptedCount: 2,
  pendingRegistrationCount: 0,
  seatedCount: 2,
  waitingCount: 0,
  pendingCount: 0,
  canRegister: false,
  canRespond: false,
  canLeave: true,
  canInvite: true,
  gamesDetail: [
    { id: 1, name: "Chess", imageUrl: null, year: null },
    { id: 2, name: "Second game", imageUrl: null, year: null },
  ],
  ratingChanges: [],
  groupRatingChanges: [],
  winners: [],
  gameVoteCounts: { "1": counts },
};
const game: ChangeEventVoteInput = { kind: "game", tableId, gameId: 1, vote: "NO" };

describe("field-scoped optimistic ballots", () => {
  it.each(["date", "location"] as const)(
    "rebases %s intent over a new Event version without touching another Event or ballot",
    (kind) => {
      const id = kind === "date" ? dateId : locationId;
      const field = kind === "date" ? "dateVotes" : "locationVotes",
        totals = kind === "date" ? "dates" : "locations";
      const other = { ...event, id: tableId };
      const data = {
        pages: [{ items: [{ ...event, version: 9 }, other], nextCursor: "next" }],
        pageParams: [""],
      };
      const changed = optimisticEventVote(data, eventId, "owner", {
        kind,
        optionId: id,
        vote: "NO",
      }) as typeof data;
      expect(changed.pages[0].items[0].version).toBe(9);
      expect(changed.pages[0].items[0].myVotes?.[field][id]).toBe("NO");
      expect(changed.pages[0].items[0].voteCounts?.[totals][id]).toEqual({
        YES: 0,
        NO: 1,
        IF_NEEDED: 0,
        UNKNOWN: 1,
      });
      expect(changed.pages[0].items[1]).toBe(other);
      expect(changed.pageParams).toEqual([""]);
      expect(event.myVotes?.[field][id]).toBe("YES");
      expect(counts.YES).toBe(1);
    },
  );
  it("creates only the missing own ballot maps, never unavailable totals", () => {
    const input = { kind: "date" as const, optionId: dateId, vote: "YES" as const };
    const changed = optimisticEventVote(
      { ...event, myVotes: undefined, voteCounts: undefined },
      eventId,
      "owner",
      input,
    ) as PlannedEventResponse;
    expect(changed.myVotes).toEqual({ dateVotes: { [dateId]: "YES" }, locationVotes: {} });
    expect(changed.voteCounts).toBeUndefined();
    const sparse = {
      ...event,
      myVotes: { dateVotes: {}, locationVotes: {} },
      voteCounts: { dates: {}, locations: {} },
    };
    expect(
      (optimisticEventVote(sparse, eventId, "owner", input) as PlannedEventResponse).voteCounts,
    ).toEqual(sparse.voteCounts);
  });
  it("does not restore a removed option, frozen Event, denied ballot or unauthenticated intent", () => {
    const input = { kind: "date" as const, optionId: dateId, vote: "YES" as const };
    for (const row of [
      { ...event, id: tableId },
      { ...event, status: "CONFIRMED" as const },
      { ...event, canVote: false },
      { ...event, dates: [{ id: tableId, day: "2030-06-02" }] },
    ])
      expect(optimisticEventVote(row, eventId, "owner", input)).toBe(row);
    for (const actor of [null, undefined, ""])
      expect(optimisticEventVote(event, eventId, actor, input)).toBe(event);
    expect(optimisticEventVote(null, eventId, "owner", input)).toBeNull();
    expect(optimisticEventVote(table, eventId, "owner", input)).toBe(table);
  });
  it("paints the same owned game intent in Event, Table and seat snapshots without manufacturing consent/version/position", () => {
    const parent = optimisticEventVote(event, eventId, "owner", game) as PlannedEventResponse;
    const child = optimisticEventVote(table, eventId, "owner", game) as PlannedTableResponse;
    const seat = optimisticEventVote(registration, eventId, "owner", game) as TableSeatResponse;
    expect(parent.myRegistrations[0].gameVotes).toEqual({ "1": "NO", "2": "YES" });
    expect(child.myRegistration?.gameVotes).toEqual({ "1": "NO", "2": "YES" });
    expect(child.gameVoteCounts?.["1"]).toEqual({ YES: 0, NO: 1, IF_NEEDED: 0, UNKNOWN: 1 });
    expect(seat).toMatchObject({
      gameVotes: { "1": "NO", "2": "YES" },
      status: "ACCEPTED",
      version: 5,
      position: "SEATED",
      sequence: 1,
    });
    expect(parent.myVotes).toBe(event.myVotes);
    expect(parent.voteCounts).toBe(event.voteCounts);
    expect(registration.gameVotes["1"]).toBe("YES");
  });
  it("ignores foreign, nonaccepted or no-longer-known Event game ballots", () => {
    for (const reg of [
      { ...registration, tableId: eventId },
      { ...registration, userId: "other" },
      { ...registration, status: "PENDING" as const },
      { ...registration, gameVotes: { "2": "YES" as const } },
    ]) {
      const row = { ...event, myRegistrations: [reg] };
      expect(
        (optimisticEventVote(row, eventId, "owner", game) as PlannedEventResponse)
          .myRegistrations[0],
      ).toBe(reg);
    }
  });
  it("respects current Table game/status/actor guards and missing count fields", () => {
    const rows = [
      { ...table, id: eventId },
      { ...table, eventId: tableId },
      { ...table, eventStatus: "CONFIRMED" as const },
      { ...table, games: [{ gameId: 2 }] },
      { ...table, myRegistration: null },
      { ...table, myRegistration: { ...registration, userId: "other" } },
      { ...table, myRegistration: { ...registration, status: "PENDING" as const } },
    ];
    for (const row of rows) expect(optimisticEventVote(row, eventId, "owner", game)).toBe(row);
    const legacy = {
      ...table,
      gameVoteCounts: undefined,
      myRegistration: { ...registration, gameVotes: {} },
    };
    const changed = optimisticEventVote(legacy, eventId, "owner", {
      ...game,
      vote: "YES",
    }) as PlannedTableResponse;
    expect(changed.myRegistration?.gameVotes).toEqual({ "1": "YES" });
    expect(changed.gameVoteCounts).toBeUndefined();
    const unknown = optimisticEventVote(
      { ...table, myRegistration: { ...registration, gameVotes: {} } },
      eventId,
      "owner",
      { ...game, vote: "YES" },
    ) as PlannedTableResponse;
    expect(unknown.gameVoteCounts?.["1"]).toEqual({ YES: 2, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 });
  });
  it("never changes another seat or converts a pending invitation into accepted participation", () => {
    for (const row of [
      { ...registration, tableId: eventId },
      { ...registration, eventId: tableId },
      { ...registration, userId: "other" },
      { ...registration, status: "PENDING" as const },
      { ...registration, gameVotes: {} },
    ])
      expect(optimisticEventVote(row, eventId, "owner", game)).toBe(row);
  });
});
