import type { GroupBan, GroupMembership, GroupRecord } from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { GroupRecordsRepository } from "../group-records.repository";

const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const now = "2026-11-18T12:00:00.000Z";
const group: GroupRecord = {
  id,
  adminUserId: "user_admin",
  type: "PRIVATE",
  approved: { name: "Test group" },
  reservedNames: [],
  version: 1,
  createdAt: now,
  updatedAt: now,
};
const membership: GroupMembership = {
  id: otherId,
  groupId: id,
  userId: "user_member",
  kind: "INVITATION",
  status: "ACCEPTED",
  version: 2,
  createdAt: now,
  updatedAt: now,
};
const ban: GroupBan = {
  id: otherId,
  groupId: id,
  userId: "user_member",
  adminUserId: "user_admin",
  until: null,
  createdAt: now,
  updatedAt: now,
};

function mongoCollection(
  name: string,
  operations: { collection: string; filter: Document; options: Document }[],
) {
  const rows: Document[][] = [];
  const aggregateRows: Document[][] = [];
  return {
    rows,
    aggregateRows,
    findOne: vi.fn(async (_filter: Document, _options: Document): Promise<Document | null> => null),
    findOneAndUpdate: vi.fn(
      async (_filter: Document, _update: Document, _options: Document): Promise<Document | null> =>
        null,
    ),
    insertOne: vi.fn(async (_row: Document, _options: Document) => ({ acknowledged: true })),
    updateOne: vi.fn(async (_filter: Document, _update: Document, _options: Document) => ({
      modifiedCount: 1,
    })),
    replaceOne: vi.fn(async (_filter: Document, _replacement: Document, _options: Document) => ({
      modifiedCount: 1,
    })),
    deleteMany: vi.fn(async (filter: Document, options: Document) => {
      operations.push({ collection: name, filter, options });
      return { deletedCount: 1 };
    }),
    deleteOne: vi.fn(async (filter: Document, options: Document) => {
      operations.push({ collection: name, filter, options });
      return { deletedCount: 1 };
    }),
    countDocuments: vi.fn(async (_filter: Document, _options: Document) => 3),
    find: vi.fn((_filter: Document, _options: Document) => ({
      toArray: async () => rows.shift() ?? [],
    })),
    aggregate: vi.fn((_pipeline: Document[], _options: Document) => ({
      toArray: async () => aggregateRows.shift() ?? [],
    })),
  };
}
function setup(session?: ClientSession) {
  const operations: { collection: string; filter: Document; options: Document }[] = [];
  const collections = new Map<string, ReturnType<typeof mongoCollection>>();
  function collection(name: string) {
    const existing = collections.get(name);
    if (existing) return existing;
    const value = mongoCollection(name, operations);
    collections.set(name, value);
    return value;
  }
  const db = { collection: vi.fn(collection) };
  return {
    collection,
    db,
    operations,
    repo: new GroupRecordsRepository(db as unknown as Db, session),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("GroupRecordsRepository actual lifecycle and Mongo transaction boundary", () => {
  it.each([false, true])(
    "reads and locks only unified group types, with session=%s",
    async (transactional) => {
      const session = transactional ? ({} as ClientSession) : undefined;
      const opts = session ? { session } : {};
      const fixture = setup(session);
      const groups = fixture.collection(COLLECTIONS.GROUPS);
      groups.findOne.mockResolvedValueOnce(group);
      groups.findOneAndUpdate.mockResolvedValueOnce(group);
      await expect(fixture.repo.find(id)).resolves.toBe(group);
      await expect(fixture.repo.find(otherId)).resolves.toBeNull();
      await expect(fixture.repo.lock(id)).resolves.toBe(group);
      expect(groups.findOne.mock.calls[0]).toEqual([
        { id, type: { $in: ["PRIVATE", "PUBLIC"] } },
        { ...opts, projection: { _id: 0, transactionLock: 0 } },
      ]);
      expect(groups.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
        { id, type: { $in: ["PRIVATE", "PUBLIC"] } },
        { $inc: { transactionLock: 1 } },
        { ...opts, returnDocument: "after", projection: { _id: 0, transactionLock: 0 } },
      );
    },
  );

  it("creates the source group and actual append-only owner activity in the same session", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    await expect(fixture.repo.create(group)).resolves.toBe(group);
    expect(fixture.collection(COLLECTIONS.GROUPS).insertOne).toHaveBeenCalledExactlyOnceWith(
      group,
      { session },
    );
    expect(
      fixture.collection(COLLECTIONS.PROFILE_ACTIVITIES).updateOne,
    ).toHaveBeenCalledExactlyOnceWith(
      { userId: "user_admin", source: `group:${id}`, kind: "group_join" },
      {
        $setOnInsert: {
          id: expect.stringMatching(/^[a-f\d-]{36}$/),
          source: `group:${id}`,
          userId: "user_admin",
          kind: "group_join",
          occurredAt: now,
          groupId: id,
        },
      },
      { session, upsert: true },
    );
    const revised = { ...group, version: 2 };
    await expect(fixture.repo.save(revised)).resolves.toBe(revised);
    expect(fixture.collection(COLLECTIONS.GROUPS).replaceOne).toHaveBeenCalledExactlyOnceWith(
      { id, type: { $in: ["PRIVATE", "PUBLIC"] } },
      revised,
      { session },
    );
    expect(fixture.collection(COLLECTIONS.PROFILE_ACTIVITIES).updateOne).toHaveBeenCalledTimes(1);
  });

  it("does not record ownership activity when the source insert fails", async () => {
    const fixture = setup();
    const error = new Error("duplicate source");
    fixture.collection(COLLECTIONS.GROUPS).insertOne.mockRejectedValueOnce(error);
    await expect(fixture.repo.create(group)).rejects.toBe(error);
    expect(fixture.collection(COLLECTIONS.PROFILE_ACTIVITIES).updateOne).not.toHaveBeenCalled();
  });

  it.each([{ events: [] }, { events: [{ id: otherId }] }])(
    "removes actual dependent event records and only group-owned rating history (%j)",
    async ({ events }) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      fixture.collection(COLLECTIONS.EVENTS).rows.push(events);
      await expect(fixture.repo.remove(id)).resolves.toEqual({
        id,
        eventIds: events.map((row) => row.id),
      });
      expect(fixture.collection(COLLECTIONS.EVENTS).find).toHaveBeenCalledExactlyOnceWith(
        { groupId: id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
        { session, projection: { _id: 0, id: 1 } },
      );
      const expected = [
        ...events.flatMap(({ id: eventId }) => [
          ...[
            COLLECTIONS.PROFILE_ACTIVITIES,
            COLLECTIONS.TABLE_GUEST_CONTACTS,
            COLLECTIONS.TABLE_REGISTRATIONS,
            COLLECTIONS.EVENT_VOTES,
            COLLECTIONS.EVENT_PROPOSALS,
            COLLECTIONS.EVENT_TABLES,
          ].map((collection) => ({ collection, filter: { eventId }, options: { session } })),
          {
            collection: COLLECTIONS.RATING_EVENTS,
            filter: { eventId, tableId: { $exists: true } },
            options: { session },
          },
          {
            collection: COLLECTIONS.NOTIFICATIONS,
            filter: { href: { $regex: `^/events/${eventId}(?:[/?#]|$)` } },
            options: { session },
          },
          {
            collection: COLLECTIONS.EVENTS,
            filter: { id: eventId, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
            options: { session },
          },
        ]),
        ...[
          COLLECTIONS.PROFILE_ACTIVITIES,
          COLLECTIONS.GROUP_MEMBERSHIPS,
          COLLECTIONS.GROUP_BANS,
          COLLECTIONS.GROUP_ASSETS,
        ].map((collection) => ({ collection, filter: { groupId: id }, options: { session } })),
        {
          collection: COLLECTIONS.PLAYER_RATINGS,
          filter: { scope: "GROUP", groupId: id },
          options: { session },
        },
        {
          collection: COLLECTIONS.RATING_EVENTS,
          filter: { scope: "GROUP", groupId: id, tableId: { $exists: true } },
          options: { session },
        },
        {
          collection: COLLECTIONS.NOTIFICATIONS,
          filter: { href: { $regex: `^/(?:groups|moderation)/${id}(?:[/?#]|$)` } },
          options: { session },
        },
        {
          collection: COLLECTIONS.GROUPS,
          filter: { id, type: { $in: ["PRIVATE", "PUBLIC"] } },
          options: { session },
        },
      ];
      expect(fixture.operations).toEqual(expected);
    },
  );

  it("stops a cascade on the first failed dependent write before deleting the parent", async () => {
    const fixture = setup({} as ClientSession);
    fixture.collection(COLLECTIONS.EVENTS).rows.push([{ id: otherId }]);
    const error = new Error("transaction aborted");
    fixture.collection(COLLECTIONS.TABLE_REGISTRATIONS).deleteMany.mockRejectedValueOnce(error);
    await expect(fixture.repo.remove(id)).rejects.toBe(error);
    expect(fixture.collection(COLLECTIONS.EVENTS).deleteOne).not.toHaveBeenCalled();
    expect(fixture.collection(COLLECTIONS.GROUPS).deleteOne).not.toHaveBeenCalled();
    expect(fixture.collection(COLLECTIONS.PLAYER_RATINGS).deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ["PENDING", null, false],
    ["ACCEPTED", null, true],
    ["ACCEPTED", { status: "PENDING" }, true],
    ["ACCEPTED", { status: "ACCEPTED" }, false],
  ] as const)(
    "records a join only for transition to %s from %j",
    async (status, previous, recordsJoin) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      const row = { ...membership, status };
      const memberships = fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS);
      memberships.findOne.mockResolvedValueOnce(previous);
      await expect(fixture.repo.saveMembership(row)).resolves.toBe(row);
      expect(memberships.replaceOne).toHaveBeenCalledExactlyOnceWith(
        { groupId: id, userId: "user_member" },
        row,
        { session, upsert: true },
      );
      expect(memberships.findOne).toHaveBeenCalledTimes(status === "ACCEPTED" ? 1 : 0);
      if (status === "ACCEPTED")
        expect(memberships.findOne).toHaveBeenCalledWith(
          { groupId: id, userId: "user_member" },
          { session, projection: { _id: 0 } },
        );
      const activity = fixture.collection(COLLECTIONS.PROFILE_ACTIVITIES).updateOne;
      expect(activity).toHaveBeenCalledTimes(recordsJoin ? 1 : 0);
      if (recordsJoin)
        expect(activity).toHaveBeenCalledWith(
          { source: `membership:${membership.id}:2`, userId: "user_member", kind: "group_join" },
          {
            $setOnInsert: expect.objectContaining({
              source: `membership:${membership.id}:2`,
              userId: "user_member",
              groupId: id,
              occurredAt: now,
            }),
          },
          { session, upsert: true },
        );
    },
  );

  it("does not write a membership or activity when its prior acceptance read fails", async () => {
    const fixture = setup();
    const error = new Error("Mongo read failed");
    fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS).findOne.mockRejectedValueOnce(error);
    await expect(fixture.repo.saveMembership(membership)).rejects.toBe(error);
    expect(fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS).replaceOne).not.toHaveBeenCalled();
    expect(fixture.collection(COLLECTIONS.PROFILE_ACTIVITIES).updateOne).not.toHaveBeenCalled();
  });

  it("selects unique accepted managers, excluding current bans including the owner", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const memberships = fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS);
    const bans = fixture.collection(COLLECTIONS.GROUP_BANS);
    memberships.rows.push([
      { userId: "user_admin" },
      { userId: "user_mod" },
      { userId: "user_mod" },
      { userId: "user_banned" },
    ]);
    bans.rows.push([{ userId: "user_admin" }, { userId: "user_banned" }]);
    await expect(fixture.repo.managerIds(group)).resolves.toEqual(["user_mod"]);
    expect(memberships.find).toHaveBeenCalledExactlyOnceWith(
      { groupId: id, status: "ACCEPTED", role: "MODERATOR" },
      { session, projection: { _id: 0, userId: 1 } },
    );
    expect(bans.find).toHaveBeenCalledExactlyOnceWith(
      {
        groupId: id,
        revokedAt: { $exists: false },
        $or: [{ until: null }, { until: { $gt: now } }],
      },
      { session, projection: { _id: 0, userId: 1 } },
    );
    await expect(fixture.repo.managerIds(group)).resolves.toEqual(["user_admin"]);
  });

  it("preserves scoped ban upserts and counts only accepted members and unified events", async () => {
    const fixture = setup();
    const bans = fixture.collection(COLLECTIONS.GROUP_BANS);
    bans.findOne.mockResolvedValueOnce(ban);
    await expect(fixture.repo.ban(id, "user_member")).resolves.toBe(ban);
    expect(bans.findOne).toHaveBeenCalledExactlyOnceWith(
      { groupId: id, userId: "user_member" },
      { projection: { _id: 0 } },
    );
    await expect(fixture.repo.saveBan(ban)).resolves.toBe(ban);
    expect(bans.replaceOne).toHaveBeenCalledExactlyOnceWith(
      { groupId: id, userId: "user_member" },
      ban,
      { upsert: true },
    );
    await expect(fixture.repo.countMembers(id)).resolves.toBe(3);
    await expect(fixture.repo.countEvents(id)).resolves.toBe(3);
    expect(
      fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS).countDocuments,
    ).toHaveBeenCalledExactlyOnceWith({ groupId: id, status: "ACCEPTED" }, {});
    expect(fixture.collection(COLLECTIONS.EVENTS).countDocuments).toHaveBeenCalledExactlyOnceWith(
      { groupId: id, status: { $in: ["PLANNING", "CONFIRMED", "TERMINATED"] } },
      {},
    );
  });

  it("counts current pending requests only after excluding active bans, including the empty aggregate", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const memberships = fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS);
    memberships.aggregateRows.push([{ count: 2 }]);
    await expect(fixture.repo.countPendingRequests(id, now)).resolves.toBe(2);
    await expect(fixture.repo.countPendingRequests(id, now)).resolves.toBe(0);
    expect(memberships.aggregate.mock.calls[0]).toEqual([
      [
        { $match: { groupId: id, kind: "REQUEST", status: "PENDING" } },
        {
          $lookup: {
            from: COLLECTIONS.GROUP_BANS,
            localField: "userId",
            foreignField: "userId",
            pipeline: [
              {
                $match: {
                  groupId: id,
                  revokedAt: { $exists: false },
                  $or: [{ until: null }, { until: { $gt: now } }],
                },
              },
            ],
            as: "activeBans",
          },
        },
        { $match: { activeBans: { $size: 0 } } },
        { $count: "count" },
      ],
      { session },
    ]);
  });
});
