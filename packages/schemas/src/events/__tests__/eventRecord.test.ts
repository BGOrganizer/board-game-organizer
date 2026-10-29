import { describe, expect, it } from "vitest";
import {
  changeEventStateSchema,
  changeEventVoteSchema,
  createPlannedEventSchema,
  decideTableRegistrationSchema,
  editPlannedEventSchema,
  finalizeEventSchema,
  joinTableSchema,
  plannedTableInputSchema,
} from "../dto/eventRecords";
import {
  eventRecordSchema,
  tableRecordSchema,
  tableRegistrationSchema,
} from "../models/eventRecord";

const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const location = {
  id,
  name: "Verified venue",
  address: "Via Roma 1, Roma, Italia",
  latitude: 41.9,
  longitude: 12.5,
};
const table = {
  id,
  name: "Table one",
  minPlayers: 2,
  maxPlayers: 4,
  games: [{ gameId: 1 }],
  rankingEnabled: true,
};
const input = {
  groupId: null,
  name: "Evening event",
  dates: [{ id, day: "2027-01-03" }],
  locations: [location],
  timeZone: "Europe/Rome",
  startTime: "09:00",
  tables: [table],
};
const at = "2027-01-01T00:00:00Z";
describe("unified event request boundaries", () => {
  it("accepts bounded private proposals including distinct times on one day, with strict optional clocks for legacy compatibility", () => {
    const proposed = {
      ...input,
      groupId: other,
      dates: [
        { id, day: "2027-01-03", startTime: "09:00" },
        { id: other, day: "2027-01-03", startTime: "20:30" },
      ],
      locations: [location, { ...location, id: other }],
    };
    expect(createPlannedEventSchema.parse(proposed).dates[1].startTime).toBe("20:30");
    const { groupId: _group, ...fields } = proposed;
    expect(
      editPlannedEventSchema.safeParse({ ...fields, version: 1, removedTableIds: [] }).success,
    ).toBe(true);
    for (const startTime of ["24:00", "12:60", "9:00", "09:00:00"])
      expect(
        createPlannedEventSchema.safeParse({
          ...proposed,
          dates: [{ ...proposed.dates[0], startTime }],
        }).success,
      ).toBe(false);
    expect(
      createPlannedEventSchema.safeParse({
        ...proposed,
        dates: [{ ...proposed.dates[0], extra: true }],
      }).success,
    ).toBe(false);
    expect(
      createPlannedEventSchema.safeParse({
        ...proposed,
        dates: [proposed.dates[0], { ...proposed.dates[0], id: other }],
      }).success,
    ).toBe(false);
  });
  it("supports group or standalone creation, explicit seats and manual duration when needed", () => {
    expect(createPlannedEventSchema.parse(input).groupId).toBeNull();
    expect(createPlannedEventSchema.safeParse({ ...input, groupId: id }).success).toBe(true);
    expect(
      plannedTableInputSchema.safeParse({
        ...table,
        id: undefined,
        games: [{ gameId: 1, manualDurationMinutes: 45 }],
      }).success,
    ).toBe(true);
    expect(
      createPlannedEventSchema.safeParse({ ...input, tables: [{ ...table, id: undefined }] })
        .success,
    ).toBe(true);
    expect(
      plannedTableInputSchema.safeParse({ ...table, minPlayers: 4, maxPlayers: 2 }).success,
    ).toBe(false);
    for (const value of [0, -1, 1.5, NaN])
      expect(
        plannedTableInputSchema.safeParse({
          ...table,
          games: [{ gameId: 1, manualDurationMinutes: value }],
        }).success,
      ).toBe(false);
  });
  it("rejects bad dates/time zones, duplicate options and attempts to smuggle lifecycle/identity", () => {
    for (const patch of [
      { timeZone: "invalid/timezone" },
      { startTime: "24:00" },
      { dates: [{ id, day: "2027-02-30" }] },
      { dates: [input.dates[0], { id, day: "2027-01-04" }] },
      { dates: [input.dates[0], { id: other, day: "2027-01-03" }] },
      { locations: [location, location] },
      { tables: [table, table] },
      { tables: [{ ...table, games: [{ gameId: 1 }, { gameId: 1 }] }] },
      { status: "CONFIRMED" },
      { adminUserId: "attacker" },
      { planningGeneration: 99 },
      { tables: [] },
    ])
      expect(createPlannedEventSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("bounds proposed options and allows equal player limits; service enforces authoritative Group mode", () => {
    for (const groupId of [null, id]) {
      const base = { ...input, groupId };
      for (const patch of [
        { dates: [] },
        { locations: [] },
        {
          dates: Array.from({ length: 21 }, (_, n) => ({
            id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
            day: `2027-01-${String(n + 1).padStart(2, "0")}`,
          })),
        },
        {
          locations: Array.from({ length: 21 }, (_, n) => ({
            ...location,
            id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
          })),
        },
      ]) {
        expect(createPlannedEventSchema.safeParse({ ...base, ...patch }).success).toBe(false);
        const { groupId: _group, ...edited } = base;
        expect(
          editPlannedEventSchema.safeParse({ ...edited, ...patch, version: 1, removedTableIds: [] })
            .success,
        ).toBe(false);
      }
    }
    expect(
      plannedTableInputSchema.safeParse({ ...table, minPlayers: 2, maxPlayers: 2 }).success,
    ).toBe(true);
    expect(
      plannedTableInputSchema.safeParse({ ...table, minPlayers: 1, maxPlayers: 2 }).success,
    ).toBe(false);
    expect(
      plannedTableInputSchema.safeParse({ ...table, minPlayers: 2, maxPlayers: 3 }).success,
    ).toBe(true);
  });
  it("editing upserts only supplied tables and requires EXPLICIT removals, never deleting unloaded pages", () => {
    const { groupId: _group, ...editable } = input;
    expect(
      editPlannedEventSchema.safeParse({ ...editable, version: 1, tables: [], removedTableIds: [] })
        .success,
    ).toBe(true);
    expect(
      editPlannedEventSchema.safeParse({
        ...editable,
        version: 1,
        tables: [{ ...table, id: undefined }],
        removedTableIds: [other],
      }).success,
    ).toBe(true);
    expect(
      editPlannedEventSchema.safeParse({ ...editable, version: 1, removedTableIds: [id, id] })
        .success,
    ).toBe(false);
    expect(
      editPlannedEventSchema.safeParse({
        ...editable,
        version: 1,
        tables: [table, table],
        removedTableIds: [],
      }).success,
    ).toBe(false);
    expect(
      editPlannedEventSchema.safeParse({
        ...editable,
        version: 1,
        removedTableIds: [],
        groupId: id,
      }).success,
    ).toBe(false);
  });
  it("does not let clients select a confirmation roster, accept through a vote, or bring cancellation/drafts back", () => {
    expect(changeEventStateSchema.safeParse({ version: 1, action: "confirm" }).success).toBe(true);
    expect(changeEventStateSchema.safeParse({ version: 1, action: "replan" }).success).toBe(true);
    for (const action of ["cancel", "draft", "terminate"])
      expect(changeEventStateSchema.safeParse({ version: 1, action }).success).toBe(false);
    expect(
      changeEventStateSchema.safeParse({ version: 1, action: "confirm", playerIds: ["attacker"] })
        .success,
    ).toBe(false);
    expect(
      changeEventVoteSchema.safeParse({ kind: "date", optionId: id, vote: "YES" }).success,
    ).toBe(true);
    expect(
      changeEventVoteSchema.safeParse({ kind: "location", optionId: id, vote: "IF_NEEDED" })
        .success,
    ).toBe(true);
    expect(
      changeEventVoteSchema.safeParse({ kind: "game", tableId: id, gameId: 1, vote: "NO" }).success,
    ).toBe(true);
    expect(
      changeEventVoteSchema.safeParse({ kind: "date", optionId: id, vote: "YES", accepted: true })
        .success,
    ).toBe(false);
    for (const action of ["decline", "cancel", "remove"])
      expect(decideTableRegistrationSchema.safeParse({ version: 1, action }).success).toBe(true);
  });
  it("requires a strict versioned participation payload only when accepting an invitation", () => {
    const participation = {
      version: 2,
      gameVotes: { "1": "YES" },
      availability: {
        version: 2,
        dateVotes: { [id]: "YES" },
        locationVotes: { [other]: "IF_NEEDED" },
      },
    };
    const accept = { action: "accept", version: 1, participation };
    expect(decideTableRegistrationSchema.parse(accept)).toEqual(accept);
    for (const invalid of [
      { action: "accept", version: 1 },
      { ...accept, participation: { ...participation, gameVotes: { "1": "UNKNOWN" } } },
      { ...accept, participation: { ...participation, version: 0 } },
      { ...accept, participation: { ...participation, accepted: true } },
      {
        ...accept,
        participation: {
          ...participation,
          availability: { ...participation.availability, accepted: true },
        },
      },
      {
        ...accept,
        participation: {
          ...participation,
          availability: { ...participation.availability, dateVotes: { invalid: "YES" } },
        },
      },
      ...["decline", "cancel", "remove"].map((action) => ({ action, version: 1, participation })),
    ])
      expect(decideTableRegistrationSchema.safeParse(invalid).success).toBe(false);
  });
  it("requires bounded explicit game choices for joins and rejects UNKNOWN in every new vote", () => {
    const choices = { version: 1, gameVotes: { "1": "YES", "2": "IF_NEEDED" } };
    expect(joinTableSchema.parse(choices)).toEqual(choices);
    for (const body of [
      {},
      { ...choices, version: 0 },
      { ...choices, gameVotes: { "01": "YES" } },
      { ...choices, gameVotes: { "9007199254740992": "YES" } },
      { ...choices, gameVotes: { "10000000000000000": "YES" } },
      { ...choices, gameVotes: { "1": "UNKNOWN" } },
      {
        ...choices,
        gameVotes: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [String(i + 1), "YES"])),
      },
      { ...choices, userId: "forged" },
    ])
      expect(joinTableSchema.safeParse(body).success).toBe(false);
    for (const vote of [
      { kind: "date", optionId: id, vote: "UNKNOWN" },
      { kind: "location", optionId: id, vote: "UNKNOWN" },
      { kind: "game", tableId: id, gameId: 1, vote: "UNKNOWN" },
    ])
      expect(changeEventVoteSchema.safeParse(vote).success).toBe(false);
  });
  it("permits all-ND exact results and forbids malformed score payloads", () => {
    const result = {
      tableId: id,
      entries: [
        { userId: "user_one", score: null },
        { userId: "user_two", score: null },
      ],
      lowerWins: false,
      tieBreaks: [],
    };
    expect(finalizeEventSchema.safeParse({ version: 1, results: [result] }).success).toBe(true);
    expect(
      finalizeEventSchema.safeParse({
        version: 1,
        results: [
          { ...result, entries: [{ userId: "user_one", score: "-12345678901234567890.125" }] },
        ],
      }).success,
    ).toBe(true);
    expect(
      finalizeEventSchema.safeParse({
        version: 1,
        results: [{ ...result, entries: [{ userId: "user_one", score: "1e99" }] }],
      }).success,
    ).toBe(false);
  });
});
it("stores only the new lifecycle and table/registration data, not independent operational Matches", () => {
  const { tables: _tables, ...fields } = input;
  const record = {
    ...fields,
    id,
    adminUserId: "user_owner",
    status: "PLANNING",
    version: 1,
    planningGeneration: 1,
    nextPriority: 0,
    nextTableOrder: 1,
    createdAt: at,
    updatedAt: at,
  };
  expect(eventRecordSchema.safeParse(record).success).toBe(true);
  expect(
    eventRecordSchema.safeParse({
      ...record,
      dates: [...record.dates, { id: other, day: "2027-01-04" }],
      locations: [...record.locations, { ...location, id: other }],
    }).success,
  ).toBe(true);
  expect(
    tableRecordSchema.safeParse({
      ...table,
      minPlayers: 2,
      maxPlayers: 2,
      eventId: id,
      order: 0,
      createdAt: at,
      updatedAt: at,
    }).success,
  ).toBe(true);
  for (const status of ["DRAFT", "PUBLISHED", "CANCELLED", "CREATED"])
    expect(eventRecordSchema.safeParse({ ...record, status }).success).toBe(false);
  expect(
    tableRecordSchema.safeParse({ ...table, eventId: id, order: 0, createdAt: at, updatedAt: at })
      .success,
  ).toBe(true);
  expect(
    tableRegistrationSchema.safeParse({
      id,
      eventId: id,
      tableId: id,
      userId: "user_guest",
      kind: "INVITATION",
      status: "PENDING",
      priorityAt: at,
      sequence: 0,
      version: 1,
      gameVotes: {},
      createdAt: at,
      updatedAt: at,
    }).success,
  ).toBe(true);
});
