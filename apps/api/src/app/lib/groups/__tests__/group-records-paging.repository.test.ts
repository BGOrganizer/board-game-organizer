import type { GroupRecordListRole } from "@board-game-organizer/schemas";
import type { ClientSession, Db, Document } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { GroupRecordsRepository } from "../group-records.repository";

const id = "00000000-0000-4000-8000-000000000001";
const now = "2026-11-18T12:00:00.000Z";
const createdAt = "2026-11-17T10:00:00.000Z";
const query = "A.*[B]";
const escapedQuery = "A\\.\\*\\[B\\]";

function setup(session?: ClientSession) {
  const rows: Document[] = [{ id: "sentinel" }];
  const aggregate = vi.fn((_collection: string, _pipeline: Document[], _options: Document) => ({
    toArray: async () => rows,
  }));
  const db = {
    collection: vi.fn((name: string) => ({
      aggregate: (pipeline: Document[], options: Document) => aggregate(name, pipeline, options),
    })),
  };
  return { rows, aggregate, repo: new GroupRecordsRepository(db as unknown as Db, session) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("GroupRecordsRepository bounded Mongo paging contracts", () => {
  it.each(["ACCEPTED", "PENDING"] as const)(
    "pages %s members using escaped profile filters and stable cursor tie-breakers",
    async (status) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      await expect(
        fixture.repo.members(id, status, { limit: 8, cursor: `${createdAt}|${id}`, query }),
      ).resolves.toBe(fixture.rows);
      expect(fixture.aggregate).toHaveBeenCalledExactlyOnceWith(
        COLLECTIONS.GROUP_MEMBERSHIPS,
        [
          {
            $match: {
              groupId: id,
              status,
              $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }],
            },
          },
          {
            $lookup: {
              from: COLLECTIONS.USERS,
              localField: "userId",
              foreignField: "clerkId",
              as: "searchProfile",
            },
          },
          {
            $match: {
              $or: ["name", "username", "email"].map((field) => ({
                [`searchProfile.${field}`]: { $regex: escapedQuery, $options: "i" },
              })),
            },
          },
          { $sort: { createdAt: -1, id: -1 } },
          { $limit: 9 },
          { $project: { _id: 0, searchProfile: 0 } },
        ],
        { session },
      );
    },
  );

  it.each([undefined, "owner"])(
    "does not treat the owner sentinel or missing cursor (%s) as a member date",
    async (cursor) => {
      const fixture = setup();
      await fixture.repo.members(id, "ACCEPTED", { limit: 4, cursor });
      expect(fixture.aggregate.mock.calls[0]).toEqual([
        COLLECTIONS.GROUP_MEMBERSHIPS,
        [
          { $match: { groupId: id, status: "ACCEPTED" } },
          { $sort: { createdAt: -1, id: -1 } },
          { $limit: 5 },
          { $project: { _id: 0, searchProfile: 0 } },
        ],
        {},
      ]);
    },
  );

  it("pages only unrevoked current bans and preserves both expiry and cursor conditions", async () => {
    const fixture = setup();
    await fixture.repo.activeBans(id, now, { limit: 4, cursor: `${createdAt}|${id}`, query });
    const [collection, pipeline, options] = fixture.aggregate.mock.calls[0];
    expect(collection).toBe(COLLECTIONS.GROUP_BANS);
    expect(options).toEqual({});
    expect(pipeline[0]).toEqual({
      $match: {
        groupId: id,
        revokedAt: { $exists: false },
        $and: [
          { $or: [{ until: null }, { until: { $gt: now } }] },
          { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] },
        ],
      },
    });
    expect(pipeline[2]).toEqual({
      $match: {
        $or: ["name", "username", "email"].map((field) => ({
          [`searchProfile.${field}`]: { $regex: escapedQuery, $options: "i" },
        })),
      },
    });
    expect(pipeline.slice(-3)).toEqual([
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, searchProfile: 0 } },
    ]);
    await fixture.repo.activeBans(id, now, { limit: 1 });
    expect(fixture.aggregate.mock.calls[1][1][0]).toEqual({
      $match: {
        groupId: id,
        revokedAt: { $exists: false },
        $and: [{ $or: [{ until: null }, { until: { $gt: now } }] }],
      },
    });
  });

  it.each<{ roles: GroupRecordListRole[] | undefined }>([
    { roles: undefined },
    { roles: ["admin", "accepted", "invited"] },
    { roles: [] },
  ])("restricts owned lists to explicit eligible membership roles (%j)", async ({ roles }) => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    await expect(fixture.repo.list("user_viewer", "mine", { limit: 8, roles }, now)).resolves.toBe(
      fixture.rows,
    );
    const [collection, pipeline, options] = fixture.aggregate.mock.calls[0];
    expect(collection).toBe(COLLECTIONS.GROUPS);
    expect(options).toEqual({ session });
    expect(pipeline[0]).toEqual({ $match: { type: { $in: ["PRIVATE", "PUBLIC"] } } });
    const owner = {
      $or: [
        { adminUserId: "user_viewer" },
        { viewerRows: { $elemMatch: { status: "ACCEPTED", role: "MODERATOR" } } },
      ],
    };
    const accepted = { viewerRows: { $elemMatch: { status: "ACCEPTED" } } };
    const invited = { viewerRows: { $elemMatch: { status: "PENDING", kind: "INVITATION" } } };
    const match =
      roles?.length === 0
        ? [{ id: { $in: [] } }]
        : roles
          ? [owner, accepted, invited]
          : [owner, invited, accepted];
    expect(pipeline).toContainEqual({ $match: { $or: match } });
    expect(pipeline).toContainEqual({ $match: { "viewerBans.0": { $exists: false } } });
    expect(pipeline.slice(-3)).toEqual([
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: 9 },
      { $project: { _id: 0, transactionLock: 0, viewerRows: 0, viewerBans: 0 } },
    ]);
  });

  it("filters exact roles before pagination and accepts only public pending requests", async () => {
    const fixture = setup();
    await fixture.repo.list(
      "user_viewer",
      "mine",
      { roles: ["administrator", "moderator", "member", "pending"], limit: 2 },
      now,
    );
    const pipeline = fixture.aggregate.mock.calls[0][1];
    const nonOwner = { adminUserId: { $ne: "user_viewer" } };
    const approved = { approved: { $exists: true } };
    expect(pipeline).toContainEqual({
      $match: {
        $or: [
          { adminUserId: "user_viewer" },
          {
            ...nonOwner,
            viewerRows: { $elemMatch: { status: "ACCEPTED", role: "MODERATOR" } },
          },
          {
            ...nonOwner,
            ...approved,
            viewerRows: { $elemMatch: { status: "ACCEPTED", role: { $ne: "MODERATOR" } } },
          },
          {
            ...nonOwner,
            ...approved,
            $or: [
              { viewerRows: { $elemMatch: { status: "PENDING", kind: "INVITATION" } } },
              {
                type: "PUBLIC",
                viewerRows: { $elemMatch: { status: "PENDING", kind: "REQUEST" } },
              },
            ],
          },
        ],
      },
    });
    expect(pipeline.slice(-4, -1)).toEqual([
      { $match: { "viewerBans.0": { $exists: false } } },
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: 3 },
    ]);
  });

  it("pages by the projected group name and groups sharing the same name", async () => {
    const fixture = setup();
    const listName = "Games | Sunday";
    await fixture.repo.list(
      "user_viewer",
      "mine",
      { sort: "name", direction: "asc", cursor: `name:${listName}|${id}`, limit: 2 },
      now,
    );
    const pipeline = fixture.aggregate.mock.calls[0][1];
    expect(pipeline[0]).toEqual({ $match: { type: { $in: ["PRIVATE", "PUBLIC"] } } });
    expect(pipeline.slice(-4)).toEqual([
      { $match: { $or: [{ listName: { $gt: listName } }, { listName, id: { $gt: id } }] } },
      { $sort: { listName: 1, id: 1 } },
      { $limit: 3 },
      { $project: { _id: 0, transactionLock: 0, viewerRows: 0, viewerBans: 0, listName: 0 } },
    ]);
  });

  it.each(["public", "moderation"] as const)(
    "keeps %s query/cursor inside the selected public-group scope",
    async (scope) => {
      const fixture = setup();
      await fixture.repo.list(
        "user_viewer",
        scope,
        { type: "PUBLIC", query, cursor: `${createdAt}|${id}`, limit: 2 },
        now,
      );
      const pipeline = fixture.aggregate.mock.calls[0][1];
      expect(pipeline[0]).toEqual({ $match: { type: "PUBLIC" } });
      expect(pipeline[1]).toEqual({
        $match:
          scope === "public"
            ? { type: "PUBLIC", approved: { $exists: true } }
            : { type: "PUBLIC", reviewStatus: "PENDING" },
      });
      expect(pipeline[2]).toEqual({
        $match: { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, id: { $lt: id } }] },
      });
      expect(pipeline[3]).toEqual({
        $match: {
          $or: [
            { "approved.name": { $regex: escapedQuery, $options: "i" } },
            {
              [scope === "public" ? "approved.location.address" : "proposal.name"]: {
                $regex: escapedQuery,
                $options: "i",
              },
            },
          ],
        },
      });
      const banLookups = pipeline.filter((stage) => stage.$lookup?.from === COLLECTIONS.GROUP_BANS);
      expect(banLookups).toHaveLength(scope === "public" ? 1 : 0);
      if (scope === "public")
        expect(banLookups[0].$lookup.pipeline[0]).toEqual({
          $match: {
            userId: "user_viewer",
            revokedAt: { $exists: false },
            $or: [{ until: null }, { until: { $gt: now } }],
            $expr: { $eq: ["$groupId", "$$group"] },
          },
        });
    },
  );

  it("matches approved venues and accepted friend memberships before the page limit", async () => {
    const fixture = setup();
    await fixture.repo.list(
      "user_viewer",
      "public",
      { query, nearLat: 41.9, nearLng: 12.5, limit: 2 },
      now,
      ["user_friend"],
    );
    const pipeline = fixture.aggregate.mock.calls[0][1];
    expect(pipeline).toContainEqual({
      $set: {
        discoveryCoordinates: ["$approved.location.longitude", "$approved.location.latitude"],
      },
    });
    expect(pipeline).toContainEqual({
      $match: {
        discoveryCoordinates: { $geoWithin: { $centerSphere: [[12.5, 41.9], 25 / 6371.0088] } },
      },
    });
    expect(pipeline).toContainEqual({
      $lookup: {
        from: COLLECTIONS.GROUP_MEMBERSHIPS,
        localField: "id",
        foreignField: "groupId",
        pipeline: [
          { $match: { userId: { $in: ["user_friend"] }, status: "ACCEPTED" } },
          { $limit: 1 },
        ],
        as: "friendMembership",
      },
    });
    expect(pipeline).toContainEqual({
      $match: {
        $or: [
          { adminUserId: { $in: ["user_friend"] } },
          { "friendMembership.0": { $exists: true } },
        ],
      },
    });
    expect(pipeline.slice(-3)).toEqual([
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: 3 },
      {
        $project: {
          _id: 0,
          transactionLock: 0,
          viewerRows: 0,
          viewerBans: 0,
          friendMembership: 0,
          discoveryCoordinates: 0,
        },
      },
    ]);
  });

  it("returns an empty friend discovery page without querying every public group", async () => {
    const fixture = setup();
    await expect(
      fixture.repo.list("user_viewer", "public", { limit: 2 }, now, []),
    ).resolves.toEqual([]);
    expect(fixture.aggregate).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "builds bounded readable-group stages with explicit public moderator access=%s",
    (moderator) => {
      const pipeline = setup().repo.readableStages("user_viewer", now, moderator) as Document[];
      expect(pipeline[0]).toEqual({ $match: { type: { $in: ["PRIVATE", "PUBLIC"] } } });
      expect(pipeline[1].$lookup).toMatchObject({
        from: COLLECTIONS.GROUP_MEMBERSHIPS,
        pipeline: [
          {
            $match: {
              userId: "user_viewer",
              $or: [{ status: "ACCEPTED" }, { kind: "INVITATION", status: "PENDING" }],
            },
          },
          { $limit: 1 },
        ],
      });
      expect(pipeline[2].$lookup).toMatchObject({
        from: COLLECTIONS.GROUP_BANS,
        pipeline: [
          {
            $match: {
              userId: "user_viewer",
              revokedAt: { $exists: false },
              $or: [{ until: null }, { until: { $gt: now } }],
            },
          },
          { $limit: 1 },
        ],
      });
      const alternatives = pipeline[3].$match.$or;
      expect(alternatives).toHaveLength(moderator ? 2 : 1);
      if (moderator) expect(alternatives[0]).toEqual({ type: "PUBLIC" });
      expect(alternatives.at(-1)).toEqual({
        $and: [
          { "readBan.0": { $exists: false } },
          {
            $or: [
              { adminUserId: "user_viewer" },
              {
                approved: { $exists: true },
                $or: [{ type: "PUBLIC" }, { "readMembership.0": { $exists: true } }],
              },
            ],
          },
        ],
      });
    },
  );

  it.each([false, true])(
    "pages invitation candidates from reciprocal friends while excluding blocked, banned and current members (filtered=%s)",
    async (filtered) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      await expect(
        fixture.repo.invitationCandidates(id, "user_actor", {
          limit: 8,
          ...(filtered ? { cursor: "user_previous", query } : {}),
        }),
      ).resolves.toBe(fixture.rows);
      const [collection, pipeline, options] = fixture.aggregate.mock.calls[0];
      expect(collection).toBe(COLLECTIONS.FRIEND_REQUESTS);
      expect(options).toEqual({ session });
      expect(pipeline[0]).toEqual({ $match: { fromUserId: "user_actor", status: "accepted" } });
      expect(pipeline[2].$lookup).toMatchObject({
        from: COLLECTIONS.FRIEND_REQUESTS,
        pipeline: [
          {
            $match: {
              toUserId: "user_actor",
              status: "accepted",
              $expr: { $eq: ["$fromUserId", "$$target"] },
            },
          },
          { $limit: 1 },
        ],
      });
      expect(pipeline[3]).toEqual({ $match: { "reverse.0": { $exists: true } } });
      expect(pipeline[7]).toEqual({
        $match: {
          clerkId: { $ne: "user_actor", ...(filtered ? { $gt: "user_previous" } : {}) },
          ...(filtered
            ? {
                $or: ["name", "email", "username"].map((field) => ({
                  [field]: { $regex: escapedQuery, $options: "i" },
                })),
              }
            : {}),
        },
      });
      expect(pipeline[8].$lookup).toMatchObject({
        from: COLLECTIONS.GROUP_MEMBERSHIPS,
        pipeline: [
          { $match: { groupId: id, status: { $in: ["PENDING", "ACCEPTED"] } } },
          { $limit: 1 },
        ],
      });
      expect(pipeline[9].$lookup).toMatchObject({
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
      expect(pipeline[10].$lookup).toMatchObject({
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
      expect(pipeline.slice(-4)).toEqual([
        {
          $match: {
            "membership.0": { $exists: false },
            "block.0": { $exists: false },
            "ban.0": { $exists: false },
          },
        },
        { $sort: { clerkId: 1 } },
        { $limit: 9 },
        {
          $project: {
            _id: 0,
            clerkId: 1,
            name: 1,
            email: 1,
            username: 1,
            avatarUrl: 1,
            presence: 1,
          },
        },
      ]);
    },
  );

  it("propagates cursor failures instead of treating authorization/database failure as an empty list", async () => {
    const fixture = setup();
    const error = new Error("aggregate failed");
    fixture.aggregate.mockImplementationOnce(() => ({
      toArray: async () => {
        throw error;
      },
    }));
    await expect(fixture.repo.list("user_viewer", "mine", { limit: 8 }, now)).rejects.toBe(error);
  });
});
