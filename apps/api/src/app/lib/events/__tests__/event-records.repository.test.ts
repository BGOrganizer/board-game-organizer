import type {
  EventRecord,
  EventVoter,
  TableRecord,
  TableRegistration,
} from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { EventRecordsRepository } from "../event-records.repository";

const id = "00000000-0000-4000-8000-000000000001";
const tableId = "00000000-0000-4000-8000-000000000002";
const otherId = "00000000-0000-4000-8000-000000000003";
const at = "2026-11-18T12:00:00.000Z";
const event: EventRecord = {
  id,
  groupId: null,
  name: "Event night",
  adminUserId: "user_admin",
  status: "PLANNING",
  timeZone: "Europe/Rome",
  startTime: "12:00",
  dates: [{ id, day: "2026-11-18" }],
  locations: [
    { id, name: "Venue", address: "Via Roma 1, Roma, Italia", latitude: 41.9, longitude: 12.5 },
  ],
  version: 1,
  planningGeneration: 1,
  nextPriority: 0,
  nextTableOrder: 1,
  createdAt: at,
  updatedAt: at,
};
const table: TableRecord = {
  id: tableId,
  eventId: id,
  name: "Table night",
  order: 0,
  minPlayers: 2,
  maxPlayers: 4,
  games: [{ gameId: 42 }],
  rankingEnabled: true,
  createdAt: at,
  updatedAt: at,
};
const registration: TableRegistration = {
  id: otherId,
  eventId: id,
  tableId,
  userId: "user_player",
  kind: "INVITATION",
  status: "ACCEPTED",
  priorityAt: at,
  sequence: 2,
  seatIndex: 0,
  version: 3,
  gameVotes: { 42: "YES" },
  createdAt: at,
  updatedAt: at,
};
const voter: EventVoter = {
  eventId: id,
  userId: "user_player",
  dateVotes: { [id]: "YES" },
  locationVotes: { [id]: "IF_NEEDED" },
  updatedAt: at,
};

function collection() {
  const rows: Document[][] = [];
  const aggregateRows: Document[][] = [];
  const cursor = {
    sort: vi.fn((_sort: Document) => cursor),
    limit: vi.fn((_limit: number) => cursor),
    toArray: vi.fn(async () => rows.shift() ?? []),
  };
  return {
    rows,
    aggregateRows,
    cursor,
    findOne: vi.fn(async (_filter: Document, _options: Document): Promise<Document | null> => null),
    findOneAndUpdate: vi.fn(
      async (_filter: Document, _update: Document, _options: Document): Promise<Document | null> =>
        null,
    ),
    find: vi.fn((_filter: Document, _options: Document) => cursor),
    aggregate: vi.fn((_pipeline: Document[], _options: Document) => ({
      toArray: async () => aggregateRows.shift() ?? [],
    })),
    distinct: vi.fn(
      async (_field: string, _filter: Document, _options: Document): Promise<unknown[]> => [],
    ),
    deleteMany: vi.fn(async (_filter: Document, _options: Document) => ({ deletedCount: 1 })),
    insertOne: vi.fn(async (_row: Document, _options: Document) => ({ acknowledged: true })),
    replaceOne: vi.fn(async (_filter: Document, _row: Document, _options: Document) => ({
      modifiedCount: 1,
    })),
    updateOne: vi.fn(
      async (_filter: Document, _update: Document | Document[], _options: Document) => ({
        modifiedCount: 1,
      }),
    ),
    updateMany: vi.fn(
      async (_filter: Document, _update: Document | Document[], _options: Document) => ({
        modifiedCount: 1,
      }),
    ),
  };
}
function setup(session?: ClientSession) {
  const collections = new Map<string, ReturnType<typeof collection>>();
  const get = (name: string) => {
    const existing = collections.get(name);
    if (existing) return existing;
    const value = collection();
    collections.set(name, value);
    return value;
  };
  const db = { collection: vi.fn(get) };
  return { get, db, repo: new EventRecordsRepository(db as unknown as Db, session) };
}

describe("EventRecordsRepository actual table, registration and vote writes", () => {
  it.each([false, true])(
    "keeps unified Event read/lock/create/save filters and session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const opts = session ? { session } : {};
      const fixture = setup(session);
      const events = fixture.get(COLLECTIONS.EVENTS);
      events.findOne.mockResolvedValueOnce(event);
      events.findOneAndUpdate.mockResolvedValueOnce(event);
      await expect(fixture.repo.find(id)).resolves.toBe(event);
      await expect(fixture.repo.lock(id)).resolves.toBe(event);
      const filter = { id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } };
      expect(events.findOne).toHaveBeenCalledExactlyOnceWith(filter, {
        ...opts,
        projection: { _id: 0, transactionLock: 0 },
      });
      expect(events.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
        filter,
        { $inc: { transactionLock: 1 } },
        { ...opts, returnDocument: "after", projection: { _id: 0, transactionLock: 0 } },
      );
      await expect(fixture.repo.create(event)).resolves.toBe(event);
      expect(events.insertOne).toHaveBeenCalledExactlyOnceWith(event, opts);
      await expect(fixture.repo.save(event)).resolves.toBe(event);
      expect(events.replaceOne).toHaveBeenCalledExactlyOnceWith(filter, event, opts);
      expect(events.findOne).toHaveBeenCalledTimes(1);
    },
  );

  it("distinguishes stored historical tables from active readers and orders active tables", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const tables = fixture.get(COLLECTIONS.EVENT_TABLES);
    tables.findOne.mockResolvedValueOnce({ ...table, removedAt: at });
    await expect(fixture.repo.storedTable(tableId)).resolves.toMatchObject({ removedAt: at });
    await expect(fixture.repo.table(tableId)).resolves.toBeNull();
    expect(tables.findOne.mock.calls).toEqual([
      [{ id: tableId }, { session, projection: { _id: 0 } }],
      [
        { id: tableId, removedAt: { $exists: false } },
        { session, projection: { _id: 0 } },
      ],
    ]);
    tables.rows.push([table]);
    await expect(fixture.repo.allTables(id)).resolves.toEqual([table]);
    expect(tables.find).toHaveBeenCalledExactlyOnceWith(
      { eventId: id, removedAt: { $exists: false } },
      { session, projection: { _id: 0 } },
    );
    expect(tables.cursor.sort).toHaveBeenCalledExactlyOnceWith({ order: 1 });
    await expect(fixture.repo.saveTable(table)).resolves.toBe(table);
    expect(tables.replaceOne).toHaveBeenCalledExactlyOnceWith({ id: tableId }, table, {
      session,
      upsert: true,
    });
  });

  it("soft-removes only tables without immutable results, cancelling active registrations with a version increment", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    await fixture.repo.removeTable(tableId, at);
    expect(
      fixture.get(COLLECTIONS.TABLE_GUEST_CONTACTS).deleteMany,
    ).toHaveBeenCalledExactlyOnceWith({ tableId }, { session });
    expect(fixture.get(COLLECTIONS.EVENT_TABLES).updateOne).toHaveBeenCalledExactlyOnceWith(
      { id: tableId, results: { $exists: false } },
      { $set: { removedAt: at, updatedAt: at } },
      { session },
    );
    expect(fixture.get(COLLECTIONS.TABLE_REGISTRATIONS).updateMany).toHaveBeenCalledExactlyOnceWith(
      { tableId, status: { $in: ["PENDING", "ACCEPTED"] } },
      { $set: { status: "CANCELLED", updatedAt: at }, $inc: { version: 1 } },
      { session },
    );
  });

  it("does not cancel registrations when the table-removal driver operation fails", async () => {
    const fixture = setup();
    const error = new Error("write conflict");
    fixture.get(COLLECTIONS.EVENT_TABLES).updateOne.mockRejectedValueOnce(error);
    await expect(fixture.repo.removeTable(tableId, at)).rejects.toBe(error);
    expect(fixture.get(COLLECTIONS.TABLE_REGISTRATIONS).updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["PENDING", null, false],
    ["ACCEPTED", null, true],
    ["ACCEPTED", { status: "PENDING" }, true],
    ["ACCEPTED", { status: "ACCEPTED" }, false],
  ] as const)(
    "records participation once when registration becomes %s from %j",
    async (status, previous, joining) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      const registrations = fixture.get(COLLECTIONS.TABLE_REGISTRATIONS);
      const activities = fixture.get(COLLECTIONS.PROFILE_ACTIVITIES);
      registrations.findOne.mockResolvedValueOnce(previous);
      const row = { ...registration, status };
      await expect(fixture.repo.saveRegistration(row)).resolves.toBe(row);
      expect(registrations.replaceOne).toHaveBeenCalledExactlyOnceWith(
        { tableId, userId: "user_player" },
        row,
        { session, upsert: true },
      );
      expect(registrations.findOne).toHaveBeenCalledTimes(status === "ACCEPTED" ? 1 : 0);
      if (status === "ACCEPTED")
        expect(registrations.findOne).toHaveBeenCalledWith(
          { tableId, userId: "user_player" },
          { session, projection: { _id: 0 } },
        );
      expect(activities.updateOne).toHaveBeenCalledTimes(joining ? 2 : 0);
      if (joining) {
        expect(activities.updateOne.mock.calls.map(([filter]) => filter)).toEqual([
          {
            source: `registration:${registration.id}:3`,
            userId: "user_player",
            kind: "table_join",
          },
          { source: `event:${id}`, userId: "user_player", kind: "event_join" },
        ]);
        expect(activities.updateOne.mock.calls[0][1]).toEqual({
          $setOnInsert: {
            id: expect.stringMatching(/^[a-f\d-]{36}$/),
            source: `registration:${registration.id}:3`,
            userId: "user_player",
            kind: "table_join",
            occurredAt: at,
            eventId: id,
            tableId,
          },
        });
        expect(
          activities.updateOne.mock.calls.every(
            ([, , options]) => options.session === session && options.upsert === true,
          ),
        ).toBe(true);
      }
    },
  );

  it("keeps guest contact details in the same transaction and outside the roster", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const row = {
      ...registration,
      kind: "GUEST" as const,
      userId: `guest:${otherId}`,
      status: "ACCEPTED" as const,
      guestName: "Carla",
    };
    const email = "carla@example.test";
    const roster = fixture.get(COLLECTIONS.TABLE_REGISTRATIONS);
    const contacts = fixture.get(COLLECTIONS.TABLE_GUEST_CONTACTS);
    await expect(fixture.repo.saveRegistration(row, email)).resolves.toBe(row);
    expect(roster.replaceOne).toHaveBeenCalledExactlyOnceWith(
      { tableId, userId: row.userId },
      row,
      { session, upsert: true },
    );
    expect(contacts.insertOne).toHaveBeenCalledExactlyOnceWith(
      { _id: row.id, eventId: row.eventId, tableId, email },
      { session },
    );
    await fixture.repo.saveRegistration({ ...row, version: 4 });
    expect(contacts.insertOne).toHaveBeenCalledOnce();
    expect(roster.findOne).not.toHaveBeenCalled();
    expect(fixture.get(COLLECTIONS.PROFILE_ACTIVITIES).updateOne).not.toHaveBeenCalled();
  });

  it("does not record a participation receipt after the registration write fails", async () => {
    const fixture = setup();
    const error = new Error("registration conflict");
    fixture.get(COLLECTIONS.TABLE_REGISTRATIONS).replaceOne.mockRejectedValueOnce(error);
    await expect(fixture.repo.saveRegistration(registration)).rejects.toBe(error);
    expect(fixture.get(COLLECTIONS.PROFILE_ACTIVITIES).updateOne).not.toHaveBeenCalled();
  });

  it("preserves the registration identity, active-status filters and stable priority ordering", async () => {
    const fixture = setup();
    const registrations = fixture.get(COLLECTIONS.TABLE_REGISTRATIONS);
    registrations.rows.push([registration], [registration]);
    await expect(fixture.repo.allRegistrations(id)).resolves.toEqual([registration]);
    await expect(fixture.repo.userRegistrations(id, "user_player")).resolves.toEqual([
      registration,
    ]);
    expect(registrations.find.mock.calls).toEqual([
      [{ eventId: id, status: { $in: ["PENDING", "ACCEPTED"] } }, { projection: { _id: 0 } }],
      [
        { eventId: id, userId: "user_player", status: { $in: ["PENDING", "ACCEPTED"] } },
        { projection: { _id: 0 } },
      ],
    ]);
    expect(registrations.cursor.sort).toHaveBeenCalledExactlyOnceWith({
      priorityAt: 1,
      sequence: 1,
    });
    registrations.findOne.mockResolvedValueOnce(registration);
    await expect(fixture.repo.registration(otherId)).resolves.toBe(registration);
    expect(registrations.findOne).toHaveBeenCalledWith({ id: otherId }, { projection: { _id: 0 } });
    registrations.distinct.mockResolvedValueOnce(["user_player"]);
    await expect(fixture.repo.acceptedTableUsers(tableId)).resolves.toEqual(["user_player"]);
    expect(registrations.distinct).toHaveBeenCalledExactlyOnceWith(
      "userId",
      { tableId, status: "ACCEPTED", kind: { $ne: "GUEST" } },
      {},
    );
  });

  it("cancels only the selected user's active registrations or the event's pending invitations and increments versions", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    await fixture.repo.cancelUser(id, "user_player", at);
    await fixture.repo.cancelPending(id, at);
    expect(fixture.get(COLLECTIONS.TABLE_REGISTRATIONS).updateMany.mock.calls).toEqual([
      [
        { eventId: id, userId: "user_player", status: { $in: ["PENDING", "ACCEPTED"] } },
        { $set: { status: "CANCELLED", updatedAt: at }, $inc: { version: 1 } },
        { session },
      ],
      [
        { eventId: id, status: "PENDING" },
        { $set: { status: "CANCELLED", updatedAt: at }, $inc: { version: 1 } },
        { session },
      ],
    ]);
  });

  it("reads/upserts event-owned votes and removes only deleted choice keys using the actual Mongo pipeline", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const votes = fixture.get(COLLECTIONS.EVENT_VOTES);
    votes.rows.push([voter]);
    votes.findOne.mockResolvedValueOnce(voter);
    await expect(fixture.repo.allVotes(id)).resolves.toEqual([voter]);
    await expect(fixture.repo.voter(id, "user_player")).resolves.toBe(voter);
    expect(votes.find).toHaveBeenCalledExactlyOnceWith(
      { eventId: id },
      { session, projection: { _id: 0 } },
    );
    expect(votes.findOne).toHaveBeenCalledExactlyOnceWith(
      { eventId: id, userId: "user_player" },
      { session, projection: { _id: 0 } },
    );
    await expect(fixture.repo.saveVoter(voter)).resolves.toBe(voter);
    expect(votes.replaceOne).toHaveBeenCalledExactlyOnceWith(
      { eventId: id, userId: "user_player" },
      voter,
      { session, upsert: true },
    );
    await fixture.repo.retainChoiceVotes(id, [id], []);
    expect(votes.updateMany).toHaveBeenCalledExactlyOnceWith(
      { eventId: id },
      [
        {
          $set: {
            dateVotes: {
              $arrayToObject: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ["$dateVotes", {}] } },
                  as: "vote",
                  cond: { $in: ["$$vote.k", [id]] },
                },
              },
            },
            locationVotes: {
              $arrayToObject: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ["$locationVotes", {}] } },
                  as: "vote",
                  cond: { $in: ["$$vote.k", []] },
                },
              },
            },
          },
        },
      ],
      { session },
    );
    await fixture.repo.retainGameVotes(tableId, [42, 7]);
    expect(fixture.get(COLLECTIONS.TABLE_REGISTRATIONS).updateMany).toHaveBeenCalledExactlyOnceWith(
      { tableId },
      [
        {
          $set: {
            gameVotes: {
              $arrayToObject: {
                $filter: {
                  input: { $objectToArray: { $ifNull: ["$gameVotes", {}] } },
                  as: "vote",
                  cond: { $in: ["$$vote.k", ["42", "7"]] },
                },
              },
            },
          },
        },
      ],
      { session },
    );
  });

  it("counts distinct planning participants at source and returns zero for an empty aggregate", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const registrations = fixture.get(COLLECTIONS.TABLE_REGISTRATIONS);
    registrations.aggregateRows.push([{ count: 3 }]);
    await expect(fixture.repo.counts(event, [table])).resolves.toEqual({
      tableCount: 1,
      participantCount: 3,
    });
    await expect(fixture.repo.counts(event, [])).resolves.toEqual({
      tableCount: 0,
      participantCount: 0,
    });
    expect(registrations.aggregate.mock.calls[0]).toEqual([
      [
        { $match: { eventId: id, tableId: { $in: [tableId] }, status: "ACCEPTED" } },
        { $group: { _id: "$userId" } },
        { $count: "count" },
      ],
      { session },
    ]);
  });

  it.each(["CONFIRMED", "TERMINATED"] as const)(
    "derives %s counts only from confirmed frozen rosters without another query",
    async (status) => {
      const fixture = setup();
      const confirmed = { gameId: 42, playerIds: ["user_a", "user_b"], startsAt: at };
      await expect(
        fixture.repo.counts({ ...event, status }, [
          { ...table, confirmed },
          { ...table, id: otherId, confirmed: { ...confirmed, playerIds: ["user_b", "user_c"] } },
          table,
        ]),
      ).resolves.toEqual({ tableCount: 2, participantCount: 3 });
      expect(fixture.get(COLLECTIONS.TABLE_REGISTRATIONS).aggregate).not.toHaveBeenCalled();
    },
  );

  it("lists only active group events in deterministic ID order", async () => {
    const fixture = setup();
    await expect(fixture.repo.groupEvents(otherId)).resolves.toEqual([]);
    expect(fixture.get(COLLECTIONS.EVENTS).find).toHaveBeenCalledExactlyOnceWith(
      { groupId: otherId, status: { $in: ["PLANNING", "CONFIRMED"] } },
      { projection: { _id: 0, transactionLock: 0 } },
    );
    expect(fixture.get(COLLECTIONS.EVENTS).cursor.sort).toHaveBeenCalledWith({ id: 1 });
  });
});
