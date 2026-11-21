import type { EventRecord, GroupRecord } from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { EventRecordsRepository } from "../event-records.repository";

const id = "00000000-0000-4000-8000-000000000001";
const tableId = "00000000-0000-4000-8000-000000000002";
const now = "2026-11-18T12:00:00.000Z";
const query = "A.*[B]";
const escapedQuery = "A\\.\\*\\[B\\]";
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
  createdAt: now,
  updatedAt: now,
};

function setup(session?: ClientSession) {
  const rows: Document[] = [{ userId: "user_sentinel", tableIds: [tableId] }];
  const cursor = {
    sort: vi.fn((_sort: Document) => cursor),
    limit: vi.fn((_limit: number) => cursor),
    toArray: vi.fn(async () => rows),
  };
  const aggregate = vi.fn((_name: string, _pipeline: Document[], _options: Document) => ({
    toArray: async () => rows,
  }));
  const find = vi.fn((_name: string, _filter: Document, _options: Document) => cursor);
  const db = {
    collection: vi.fn((name: string) => ({
      aggregate: (pipeline: Document[], options: Document) => aggregate(name, pipeline, options),
      find: (filter: Document, options: Document) => find(name, filter, options),
    })),
  };
  return {
    rows,
    aggregate,
    find,
    cursor,
    repo: new EventRecordsRepository(db as unknown as Db, session),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("EventRecordsRepository participant and invitation paging boundaries", () => {
  it.each(["PENDING", "ACCEPTED"] as const)(
    "pages %s registrations by exact table, selected user IDs and full priority cursor",
    async (status) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      await expect(
        fixture.repo.registrationsPage(tableId, status, { limit: 8, cursor: `${now}|7|${id}` }, [
          "user_a",
          "user_b",
        ]),
      ).resolves.toBe(fixture.rows);
      expect(fixture.find).toHaveBeenCalledExactlyOnceWith(
        COLLECTIONS.TABLE_REGISTRATIONS,
        {
          tableId,
          status,
          userId: { $in: ["user_a", "user_b"] },
          $or: [
            { priorityAt: { $gt: now } },
            { priorityAt: now, sequence: { $gt: 7 } },
            { priorityAt: now, sequence: 7, id: { $gt: id } },
          ],
        },
        { session, projection: { _id: 0 } },
      );
      expect(fixture.cursor.sort).toHaveBeenCalledExactlyOnceWith({
        priorityAt: 1,
        sequence: 1,
        id: 1,
      });
      expect(fixture.cursor.limit).toHaveBeenCalledExactlyOnceWith(9);
    },
  );

  it("distinguishes an unrestricted user filter from an explicitly empty eligible user set", async () => {
    const fixture = setup();
    await fixture.repo.registrationsPage(tableId, "ACCEPTED", { limit: 4 });
    await fixture.repo.registrationsPage(tableId, "ACCEPTED", { limit: 4 }, []);
    expect(fixture.find.mock.calls).toEqual([
      [
        COLLECTIONS.TABLE_REGISTRATIONS,
        { tableId, status: "ACCEPTED" },
        { projection: { _id: 0 } },
      ],
      [
        COLLECTIONS.TABLE_REGISTRATIONS,
        { tableId, status: "ACCEPTED", userId: { $in: [] } },
        { projection: { _id: 0 } },
      ],
    ]);
  });

  it.each(["PLANNING", "CONFIRMED", "TERMINATED"] as const)(
    "deduplicates %s attendance, demonstration and eligible invitations before applying the page",
    async (status) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      await expect(
        fixture.repo.participants(
          { ...event, status },
          { limit: 8, cursor: "user_previous" },
          "user_viewer",
        ),
      ).resolves.toBe(fixture.rows);
      const [collection, pipeline, options] = fixture.aggregate.mock.calls[0];
      expect(collection).toBe(COLLECTIONS.EVENT_TABLES);
      expect(options).toEqual({ session });
      expect(pipeline[0]).toEqual({ $match: { eventId: id, removedAt: { $exists: false } } });
      expect(pipeline[1].$lookup).toMatchObject({
        from: COLLECTIONS.TABLE_REGISTRATIONS,
        pipeline: [
          {
            $match: {
              eventId: id,
              $or: [
                { status: "ACCEPTED" },
                ...(status === "TERMINATED"
                  ? []
                  : [{ status: "PENDING", kind: "INVITATION", userId: "user_viewer" }]),
              ],
            },
          },
          { $project: { _id: 0, userId: 1 } },
        ],
      });
      expect(pipeline[2]).toEqual({
        $project: {
          tableId: "$id",
          users: {
            $setUnion: [
              "$accepted.userId",
              {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $type: "$demonstratorUserId" }, "string"] },
                      status === "PLANNING" ? true : { $ne: [{ $type: "$confirmed" }, "missing"] },
                    ],
                  },
                  ["$demonstratorUserId"],
                  [],
                ],
              },
              status === "PLANNING"
                ? []
                : { $cond: [{ $isArray: "$confirmed.playerIds" }, "$confirmed.playerIds", []] },
            ],
          },
        },
      });
      expect(pipeline.slice(3)).toEqual([
        { $unwind: "$users" },
        { $match: { users: { $type: "string", $ne: "", $not: /^guest:/ } } },
        { $group: { _id: "$users", tableIds: { $addToSet: "$tableId" } } },
        { $match: { _id: { $gt: "user_previous" } } },
        { $sort: { _id: 1 } },
        { $limit: 9 },
        { $project: { _id: 0, userId: "$_id", tableIds: 1 } },
      ]);
    },
  );

  it("allows the authorized whole event view to count pending invitations without a personal-only filter", async () => {
    const fixture = setup();
    await fixture.repo.participants(event, { limit: 2 });
    const pipeline = fixture.aggregate.mock.calls[0][1];
    expect(pipeline[1].$lookup.pipeline[0]).toEqual({
      $match: {
        eventId: id,
        $or: [{ status: "ACCEPTED" }, { status: "PENDING", kind: "INVITATION" }],
      },
    });
    expect(pipeline.slice(-3)).toEqual([
      { $sort: { _id: 1 } },
      { $limit: 3 },
      { $project: { _id: 0, userId: "$_id", tableIds: 1 } },
    ]);
  });

  it.each([false, true])(
    "uses only accepted group members/owner and excludes active bans before the candidate page (filtered=%s)",
    async (filtered) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      await expect(
        fixture.repo.invitationCandidates(group, "user_actor", tableId, {
          limit: 8,
          ...(filtered ? { cursor: "user_previous", query } : {}),
        }),
      ).resolves.toBe(fixture.rows);
      const [collection, pipeline, options] = fixture.aggregate.mock.calls[0];
      expect(collection).toBe(COLLECTIONS.USERS);
      expect(options).toEqual({ session });
      expect(pipeline[0]).toEqual({
        $match: {
          clerkId: { $ne: "user_actor", ...(filtered ? { $gt: "user_previous" } : {}) },
          ...(filtered
            ? {
                $or: ["name", "username", "email"].map((field) => ({
                  [field]: { $regex: escapedQuery, $options: "i" },
                })),
              }
            : {}),
        },
      });
      expect(pipeline[2].$lookup).toMatchObject({
        from: COLLECTIONS.GROUP_MEMBERSHIPS,
        pipeline: [{ $match: { groupId: id, status: "ACCEPTED" } }, { $limit: 1 }],
      });
      expect(pipeline[3]).toEqual({
        $match: { $or: [{ clerkId: "user_admin" }, { "membership.0": { $exists: true } }] },
      });
      expect(pipeline[4].$lookup).toMatchObject({
        from: COLLECTIONS.GROUP_BANS,
        pipeline: [
          {
            $match: {
              groupId: id,
              revokedAt: { $exists: false },
              $or: [{ until: null }, { until: { $gt: now } }],
            },
          },
          { $limit: 1 },
        ],
      });
      expect(pipeline[5]).toEqual({ $match: { "ban.0": { $exists: false } } });
      expect(pipeline.slice(-4)).toEqual([
        {
          $lookup: {
            from: COLLECTIONS.TABLE_REGISTRATIONS,
            localField: "clerkId",
            foreignField: "userId",
            pipeline: [
              { $match: { tableId, status: { $in: ["PENDING", "ACCEPTED"] } } },
              { $limit: 1 },
            ],
            as: "registration",
          },
        },
        { $match: { "registration.0": { $exists: false } } },
        { $limit: 9 },
        {
          $project: {
            _id: 0,
            clerkId: 1,
            name: 1,
            username: 1,
            email: 1,
            avatarUrl: 1,
            presence: 1,
          },
        },
      ]);
    },
  );

  it("requires mutual friendship and neither-direction blocking when there is no parent group", async () => {
    const fixture = setup();
    await fixture.repo.invitationCandidates(null, "user_actor", tableId, { limit: 2 });
    const pipeline = fixture.aggregate.mock.calls[0][1];
    expect(pipeline[2].$lookup).toMatchObject({
      from: COLLECTIONS.FRIEND_REQUESTS,
      pipeline: [{ $match: { fromUserId: "user_actor", status: "accepted" } }, { $limit: 1 }],
    });
    expect(pipeline[3].$lookup).toMatchObject({
      from: COLLECTIONS.FRIEND_REQUESTS,
      pipeline: [{ $match: { toUserId: "user_actor", status: "accepted" } }, { $limit: 1 }],
    });
    expect(pipeline[4]).toEqual({
      $match: { "forward.0": { $exists: true }, "reverse.0": { $exists: true } },
    });
    expect(pipeline[5].$lookup).toMatchObject({
      from: COLLECTIONS.BLOCKS,
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                {
                  $and: [
                    { $eq: ["$fromUserId", "user_actor"] },
                    { $eq: ["$toUserId", "$$target"] },
                  ],
                },
                {
                  $and: [
                    { $eq: ["$toUserId", "user_actor"] },
                    { $eq: ["$fromUserId", "$$target"] },
                  ],
                },
              ],
            },
          },
        },
        { $limit: 1 },
      ],
    });
    expect(pipeline[6]).toEqual({ $match: { "block.0": { $exists: false } } });
    expect(pipeline.slice(-3)).toEqual([
      { $match: { "registration.0": { $exists: false } } },
      { $limit: 3 },
      {
        $project: { _id: 0, clerkId: 1, name: 1, username: 1, email: 1, avatarUrl: 1, presence: 1 },
      },
    ]);
  });

  it("preserves a cursor error rather than reporting a successful empty participant page", async () => {
    const fixture = setup();
    const error = new Error("cursor unavailable");
    fixture.aggregate.mockImplementationOnce(() => ({
      toArray: async () => {
        throw error;
      },
    }));
    await expect(fixture.repo.participants(event, { limit: 8 })).rejects.toBe(error);
  });
});
