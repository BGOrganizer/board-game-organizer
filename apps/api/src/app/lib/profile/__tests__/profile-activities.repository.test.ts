import type { EventRecord, TableRecord } from "@board-game-organizer/schemas";
import type { Db, Document } from "mongodb";
import { expect, it, vi } from "vitest";
import { COLLECTIONS as C } from "../../db";
import { EventRecordsRepository } from "../../events/event-records.repository";
import { ProfileActivitiesRepository } from "../profile-activities.repository";

const at = "2030-06-03T12:00:00.000Z",
  event = { id: "event", groupId: null, updatedAt: at, status: "TERMINATED" } as EventRecord;
const table = (id: string, order = 0, startsAt = at) =>
  ({
    id,
    eventId: "event",
    name: id,
    order,
    confirmed: { playerIds: ["winner", "loser", "nd"], startsAt, gameId: 7 },
    results: {
      finalizedAt: at,
      entries: [
        { userId: "winner", score: "1", rank: 1 },
        { userId: "loser", score: "-0.5", rank: 2 },
        { userId: "nd", score: null, rank: null },
      ],
    },
  }) as TableRecord;
function setup(wins = 0) {
  const writes = vi.fn(async (_filter: Document, _update: Document, _options?: Document) => ({
      modifiedCount: 1,
    })),
    query = vi.fn((_filter: Document, _options?: unknown) => cursor),
    sort = vi.fn((_sort: Document) => cursor),
    limit = vi.fn((_count: number) => cursor),
    rows: Document[] = [],
    cursor = { sort, limit, toArray: vi.fn(async () => rows) };
  const findEvent = vi.fn(async () => ({ id: "event", status: "CONFIRMED" })),
    replaceEvent = vi.fn(async () => ({ modifiedCount: 1 })),
    locks = vi.fn(async (_filter: Document, _update: Document, _options?: Document) => ({
      matchedCount: 1,
    }));
  const db = {
    collection: (name: string) =>
      name === C.PROFILE_ACTIVITIES
        ? { updateOne: writes, find: query, aggregate: query }
        : name === C.EVENTS
          ? { findOne: findEvent, replaceOne: replaceEvent }
          : name === C.USERS
            ? { updateOne: locks }
            : {
                aggregate: () => ({ toArray: async () => [{ gamesPlayed: wins, gamesWon: wins }] }),
                find: () => cursor,
              },
  } as unknown as Db;
  return { db, writes, query, sort, limit, rows, cursor, findEvent, replaceEvent, locks };
}
it("deduplicates successful domain receipts by user/source/kind in the caller transaction, never stored names/hrefs", async () => {
  const m = setup(),
    session = {} as never,
    repo = new ProfileActivitiesRepository(m.db, session),
    row = {
      source: "source",
      userId: "owner",
      kind: "friendship" as const,
      otherUserId: "other",
      occurredAt: at,
    };
  await repo.record(row);
  await repo.record(row);
  expect(m.writes).toHaveBeenLastCalledWith(
    { userId: "owner", source: "source", kind: "friendship" },
    { $setOnInsert: { ...row, id: expect.stringMatching(/^[\da-f-]{36}$/) } },
    { upsert: true, session },
  );
});
it("records one scored outcome per finisher, excludes ND/outsiders/all-ND/single-finisher tables and avoids retrospective milestones", async () => {
  const m = setup(4),
    repo = new ProfileActivitiesRepository(m.db),
    valid = table("valid"),
    single = table("single"),
    empty = table("empty"),
    planning = { id: "planning", order: 3 } as TableRecord;
  single.results!.entries = [
    { userId: "winner", score: "1", rank: 1 },
    { userId: "nd", score: null, rank: null },
  ];
  empty.results!.entries = [];
  valid.results!.entries.push({ userId: "outside-roster", score: "99", rank: 1 });
  await repo.finalized(event, [valid, single, empty, planning]);
  const rows = m.writes.mock.calls.map((call) => call[1].$setOnInsert);
  expect(rows).toHaveLength(2);
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: "winner", kind: "played", outcome: "won" }),
      expect.objectContaining({ userId: "loser", kind: "played", outcome: "played" }),
    ]),
  );
  expect(rows.every((row) => !row.groupId && !row.milestone)).toBe(true);
});
it("pins crossed milestones to the actual physical win, not a later public table, using frozen start/order", async () => {
  const m = setup(11),
    repo = new ProfileActivitiesRepository(m.db),
    first = table("first", 1),
    second = table("crossing", 2),
    last = table("last", 0, "2030-06-03T14:00:00.000Z");
  await repo.finalized({ ...event, groupId: "private-group" }, [last, second, first]);
  const rows = m.writes.mock.calls.map((call) => call[1].$setOnInsert);
  expect(rows.filter((row) => row.kind === "milestone")).toEqual([
    expect.objectContaining({
      userId: "winner",
      source: "wins:10",
      milestone: 10,
      tableId: "crossing",
      groupId: "private-group",
    }),
  ]);
  expect(rows.filter((row) => row.kind === "played")).toHaveLength(6);
});
it("retains standalone milestone privacy and safely ignores multiple excluded Tables", async () => {
  const m = setup(5),
    repo = new ProfileActivitiesRepository(m.db);
  await repo.finalized(event, [
    { id: "excluded-a", order: 1 },
    { id: "excluded-b", order: 2 },
    table("winner-source"),
  ] as TableRecord[]);
  expect(
    m.writes.mock.calls
      .map((call) => call[1].$setOnInsert)
      .filter((row) => row.kind === "milestone"),
  ).toEqual([expect.objectContaining({ milestone: 5, tableId: "winner-source" })]);
});
it("uses the existing per-user transaction lock in stable order, including unrelated-game/unrated wins", async () => {
  const m = setup(4),
    session = {} as never,
    value = table("tied");
  value.confirmed!.playerIds = ["z-winner", "a-winner"];
  value.results!.entries = [
    { userId: "z-winner", score: "1", rank: 1 },
    { userId: "a-winner", score: "1", rank: 1 },
  ];
  await new ProfileActivitiesRepository(m.db, session).finalized(event, [value]);
  expect(m.locks.mock.calls.map((call) => call[0].clerkId)).toEqual(["a-winner", "z-winner"]);
  expect(m.locks).toHaveBeenCalledWith(
    { clerkId: "a-winner" },
    { $inc: { "community.uploadLock": 1 } },
    { session },
  );
});
it("source-pages fixed chunks with strict descending instant/UUID tie breaks and optional type", async () => {
  const m = setup(),
    repo = new ProfileActivitiesRepository(m.db);
  await repo.page("owner", undefined);
  expect(m.query.mock.calls[0][0]).toContainEqual({ $match: { userId: "owner" } });
  await repo.page("owner", "played", `${at}|id`);
  expect(m.query.mock.calls[1][0]).toContainEqual({
    $match: {
      userId: "owner",
      kind: "played",
      $or: [{ occurredAt: { $lt: at } }, { occurredAt: at, id: { $lt: "id" } }],
    },
  });
  expect(m.query.mock.calls[1][0]).toContainEqual({ $sort: { occurredAt: -1, id: -1 } });
  expect(m.query.mock.calls[1][0]).toContainEqual({ $limit: 50 });
  await repo.networkPage("owner", "all", []);
  expect(m.query).toHaveBeenCalledTimes(3);
});
it("records only the actual CONFIRMED to TERMINATED transition, never historical terminated reads/saves", async () => {
  const m = setup();
  m.rows.push(table("outcome"));
  const repo = new EventRecordsRepository(m.db);
  await repo.save(event);
  expect(m.writes).toHaveBeenCalledTimes(2);
  m.writes.mockClear();
  m.findEvent.mockResolvedValue({ id: "event", status: "TERMINATED" });
  await repo.save(event);
  expect(m.writes).not.toHaveBeenCalled();
  await repo.save({ ...event, status: "PLANNING" });
  expect(m.findEvent).toHaveBeenCalledTimes(2);
});
