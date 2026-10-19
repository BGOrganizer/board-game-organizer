import { describe, expect, it } from "vitest";
import {
  changeEventStateSchema,
  changeEventVoteSchema,
  createPlannedEventSchema,
  decideTableRegistrationSchema,
  editPlannedEventSchema,
  finalizeEventSchema,
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
    for (const action of ["accept", "decline", "cancel", "remove"])
      expect(decideTableRegistrationSchema.safeParse({ version: 1, action }).success).toBe(true);
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
