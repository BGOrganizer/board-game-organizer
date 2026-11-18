import { type Notification, notificationItemId } from "@board-game-organizer/schemas";
import { type ClientSession, type Db, type Document, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { NotificationsRepository } from "../notifications.repository";

const now = new Date("2026-11-18T12:00:00.000Z");
const through = "2026-11-18T11:00:00.000Z";
const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const objectId = new ObjectId("000000000000000000000001");
const note: Notification = {
  _id: objectId,
  recipientUserId: "user_owner",
  actorUserId: "user_actor",
  kind: "event_updated",
  title: "Updated",
  description: "An event changed",
  href: `/events/${id}`,
  createdAt: new Date(through),
};

function mongoCursor(rows: Document[]) {
  const cursor = {
    project: vi.fn((_projection: Document) => cursor),
    batchSize: vi.fn((_size: number) => cursor),
    toArray: async () => rows,
    async *[Symbol.asyncIterator]() {
      yield* rows;
    },
  };
  return cursor;
}
function mongoCollection() {
  const findRows: Document[][] = [];
  const aggregateRows: Document[][] = [];
  const cursors: ReturnType<typeof mongoCursor>[] = [];
  return {
    findRows,
    aggregateRows,
    cursors,
    findOne: vi.fn(async (_filter: Document, _options: Document): Promise<Document | null> => null),
    find: vi.fn((_filter: Document, _options: Document) => {
      const cursor = mongoCursor(findRows.shift() ?? []);
      cursors.push(cursor);
      return cursor;
    }),
    aggregate: vi.fn((_pipeline: Document[], _options: Document) =>
      mongoCursor(aggregateRows.shift() ?? []),
    ),
    updateOne: vi.fn(
      async (_filter: Document, _update: Document | Document[], _options: Document) => ({
        modifiedCount: 1,
      }),
    ),
    updateMany: vi.fn(
      async (_filter: Document, _update: Document | Document[], _options: Document) => ({
        modifiedCount: 2,
      }),
    ),
    deleteOne: vi.fn(async (_filter: Document, _options: Document) => ({ deletedCount: 1 })),
    deleteMany: vi.fn(async (_filter: Document, _options: Document) => ({ deletedCount: 2 })),
  };
}
function setup(session?: ClientSession) {
  const collections = new Map<string, ReturnType<typeof mongoCollection>>();
  const collection = (name: string) => {
    const existing = collections.get(name);
    if (existing) return existing;
    const value = mongoCollection();
    collections.set(name, value);
    return value;
  };
  return {
    collection,
    repo: new NotificationsRepository({ collection } as unknown as Db, session),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe("NotificationsRepository actual source mutations", () => {
  it("retargets only unread source items, retaining old fields while supplying the new captured change time", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
    await fixture.repo.retargetItems([]);
    expect(notifications.updateMany).not.toHaveBeenCalled();
    const replacements = [
      {
        from: notificationItemId(id, "dates"),
        to: { id: notificationItemId(otherId, "dates"), revision: 4, eventId: otherId },
      },
    ];
    await fixture.repo.retargetItems(replacements);
    expect(notifications.updateMany).toHaveBeenCalledExactlyOnceWith(
      { readAt: { $exists: false }, "attentionItems.id": { $in: [replacements[0].from] } },
      [
        {
          $set: {
            attentionItems: {
              $map: {
                input: "$attentionItems",
                as: "item",
                in: {
                  $let: {
                    vars: {
                      replacement: {
                        $arrayElemAt: [
                          {
                            $filter: {
                              input: { $literal: replacements },
                              as: "value",
                              cond: { $eq: ["$$value.from", "$$item.id"] },
                            },
                          },
                          0,
                        ],
                      },
                    },
                    in: {
                      $cond: [
                        { $ne: [{ $ifNull: ["$$replacement", null] }, null] },
                        { $mergeObjects: ["$$item", "$$replacement.to", { changedAt: now }] },
                        "$$item",
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ],
      { session },
    );
  });

  it.each([false, true])(
    "distinguishes informational from explicit-decision item acknowledgements (%s)",
    async (decision) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      const itemIds = [
        notificationItemId(id, "invitation"),
        notificationItemId(otherId, "invitation", undefined, "table"),
      ];
      await expect(
        fixture.repo.acknowledgeItems("user_owner", itemIds, "2027-01-01T00:00:00.000Z", decision),
      ).resolves.toEqual({ modifiedCount: 2 });
      const [filter, update, options] = fixture.collection(COLLECTIONS.NOTIFICATIONS).updateMany
        .mock.calls[0];
      expect(options).toEqual({ session });
      expect(filter).toEqual({
        recipientUserId: "user_owner",
        ...(!decision
          ? {
              kind: {
                $nin: [
                  "group_invitation",
                  "table_invitation",
                  "group_membership_requested",
                  "group_review_requested",
                  "event_agreement_ready",
                  "event_proposal_created",
                ],
              },
            }
          : {}),
        readAt: { $exists: false },
        createdAt: { $lte: now },
        $or: [
          {
            attentionItems: {
              $elemMatch: {
                $or: [{ id: { $in: itemIds } }, { sectionId: { $in: itemIds } }],
                readAt: { $exists: false },
              },
            },
          },
          { kind: "group_invitation", href: `/groups/${id}`, attentionItems: { $exists: false } },
          {
            kind: "table_invitation",
            href: { $regex: `^/events/[0-9a-f-]{36}/tables/${otherId}$`, $options: "i" },
            attentionItems: { $exists: false },
          },
        ],
      });
      expect(Array.isArray(update)).toBe(true);
      const pipeline = update as Document[];
      expect(pipeline[0].$set.attentionItems.$map.in.$cond[0].$and).toEqual([
        {
          $or: [
            { $in: ["$$item.id", itemIds] },
            { $in: [{ $ifNull: ["$$item.sectionId", null] }, itemIds] },
          ],
        },
        { $lte: [{ $ifNull: ["$$item.changedAt", "$createdAt"] }, now] },
      ]);
      expect(pipeline[1].$set.readAt.$cond.slice(-2)).toEqual(["$$NOW", "$$REMOVE"]);
    },
  );

  it.each([undefined, "invalid", "2026-11-18T10:00:00.000Z"])(
    "uses a current accepted membership checkpoint for a legacy member point (%s)",
    async (updatedAt) => {
      const fixture = setup();
      const itemId = notificationItemId(id, "member", "user_member");
      fixture
        .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
        .findOne.mockResolvedValueOnce(updatedAt ? { updatedAt } : null);
      await fixture.repo.acknowledgeItems("user_owner", [itemId], through);
      expect(
        fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS).findOne,
      ).toHaveBeenCalledExactlyOnceWith(
        { groupId: id, userId: "user_member", status: "ACCEPTED" },
        {},
      );
      const filter = fixture.collection(COLLECTIONS.NOTIFICATIONS).updateMany.mock.calls[0][0];
      expect(filter.createdAt).toEqual({ $lte: new Date(through) });
      expect(filter.$or).toHaveLength(updatedAt && updatedAt !== "invalid" ? 2 : 1);
      if (updatedAt && updatedAt !== "invalid")
        expect(filter.$or[1]).toEqual({
          kind: { $in: ["group_membership_updated", "group_invitation_accepted"] },
          href: `/groups/${id}`,
          actorUserId: "user_member",
          attentionItems: { $exists: false },
          createdAt: { $gte: new Date(updatedAt) },
        });
    },
  );

  it("streams legacy member notices but reads only source-proven actors accepted before that notice", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
    const memberships = fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS);
    const historicalMember = {
      ...note,
      kind: "group_membership_updated",
      href: `/groups/${id}`,
    };
    const legacy = [
      historicalMember,
      { ...historicalMember, _id: new ObjectId(), actorUserId: "user_missing" },
      { ...historicalMember, _id: new ObjectId(), actorUserId: "user_invalid" },
      { ...historicalMember, _id: new ObjectId(), actorUserId: "user_new_join" },
    ];
    notifications.findRows.push(legacy);
    memberships.findOne
      .mockResolvedValueOnce({ updatedAt: "2026-11-18T10:00:00.000Z" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ updatedAt: "invalid" })
      .mockResolvedValueOnce({ updatedAt: "2026-11-18T11:30:00.000Z" });
    await expect(
      fixture.repo.acknowledgeItems("user_owner", [notificationItemId(id, "members")], through),
    ).resolves.toEqual({ modifiedCount: 3 });
    expect(notifications.find).toHaveBeenCalledExactlyOnceWith(
      {
        recipientUserId: "user_owner",
        kind: { $in: ["group_membership_updated", "group_invitation_accepted"] },
        href: `/groups/${id}`,
        actorUserId: { $regex: "^[A-Za-z0-9_-]+$" },
        attentionItems: { $exists: false },
        readAt: { $exists: false },
        createdAt: { $lte: new Date(through) },
      },
      { session },
    );
    expect(notifications.cursors[0].project).toHaveBeenCalledExactlyOnceWith({
      _id: 1,
      actorUserId: 1,
      createdAt: 1,
    });
    expect(notifications.updateOne).toHaveBeenCalledExactlyOnceWith(
      { _id: objectId, recipientUserId: "user_owner", readAt: { $exists: false } },
      { $set: { readAt: now } },
      { session },
    );
    expect(memberships.findOne.mock.calls.map(([filter]) => filter.userId)).toEqual([
      "user_actor",
      "user_missing",
      "user_invalid",
      "user_new_join",
    ]);
  });

  it.each(["missing", "group_invitation", "table_invitation"] as const)(
    "protects %s notices from informational markRead without granting consent",
    async (kind) => {
      const session = {} as ClientSession;
      const fixture = setup(session);
      const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
      notifications.findOne.mockResolvedValueOnce(
        kind === "missing"
          ? null
          : {
              ...note,
              kind,
              href:
                kind === "group_invitation" ? `/groups/${id}` : `/events/${id}/tables/${otherId}`,
            },
      );
      fixture
        .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
        .findOne.mockResolvedValueOnce({ status: "PENDING" });
      fixture
        .collection(COLLECTIONS.TABLE_REGISTRATIONS)
        .findOne.mockResolvedValueOnce({ status: "PENDING" });
      await expect(fixture.repo.markRead("user_owner", objectId.toHexString())).resolves.toEqual({
        modifiedCount: 0,
      });
      expect(notifications.findOne).toHaveBeenCalledExactlyOnceWith(
        { _id: objectId, recipientUserId: "user_owner", readAt: { $exists: false } },
        { session },
      );
      expect(notifications.updateOne).not.toHaveBeenCalled();
      expect(fixture.collection(COLLECTIONS.GROUP_MEMBERSHIPS).updateOne).not.toHaveBeenCalled();
      expect(fixture.collection(COLLECTIONS.TABLE_REGISTRATIONS).updateOne).not.toHaveBeenCalled();
    },
  );

  it.each(["event_updated", "group_invitation", "table_invitation"] as const)(
    "reads source-owned %s when it has no current pending invitation",
    async (kind) => {
      const fixture = setup();
      const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
      notifications.findOne.mockResolvedValueOnce({
        ...note,
        kind,
        href:
          kind === "group_invitation"
            ? `/groups/${id}`
            : kind === "table_invitation"
              ? `/events/${id}/tables/${otherId}`
              : note.href,
      });
      await expect(fixture.repo.markRead("user_owner", objectId.toHexString())).resolves.toEqual({
        modifiedCount: 1,
      });
      expect(notifications.updateOne).toHaveBeenCalledExactlyOnceWith(
        { _id: objectId, recipientUserId: "user_owner", readAt: { $exists: false } },
        { $set: { readAt: now } },
        {},
      );
    },
  );

  it("streams mark-all in bounded batches while rechecking each current invitation decision", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
    const invite = {
      ...note,
      _id: new ObjectId(),
      kind: "group_invitation",
      href: `/groups/${id}`,
    };
    const missing = { ...note, _id: new ObjectId() };
    notifications.findRows.push([note, invite, missing]);
    notifications.findOne
      .mockResolvedValueOnce(note)
      .mockResolvedValueOnce(invite)
      .mockResolvedValueOnce(null);
    fixture
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .findOne.mockResolvedValueOnce({ status: "PENDING" });
    await expect(fixture.repo.markAllRead("user_owner")).resolves.toEqual({ modifiedCount: 1 });
    expect(notifications.find).toHaveBeenCalledExactlyOnceWith(
      { recipientUserId: "user_owner", readAt: { $exists: false } },
      { session },
    );
    expect(notifications.cursors[0].batchSize).toHaveBeenCalledExactlyOnceWith(100);
    expect(notifications.findOne.mock.calls.map(([filter]) => filter._id)).toEqual([
      note._id,
      invite._id,
      missing._id,
    ]);
    expect(notifications.updateOne).toHaveBeenCalledTimes(1);
    await expect(fixture.repo.markAllRead("user_owner")).resolves.toEqual({ modifiedCount: 0 });
  });

  it("awaits a mark-all write before reading the next row and propagates an aborted write", async () => {
    const fixture = setup();
    const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
    notifications.findRows.push([note, { ...note, _id: new ObjectId() }]);
    notifications.findOne.mockResolvedValue(note);
    const error = new Error("read acknowledgement failed");
    notifications.updateOne.mockRejectedValueOnce(error);
    await expect(fixture.repo.markAllRead("user_owner")).rejects.toBe(error);
    expect(notifications.findOne).toHaveBeenCalledTimes(1);
    expect(notifications.updateOne).toHaveBeenCalledTimes(1);
  });

  it("retains superseded read snapshots before deletion with a full item-set concurrency guard", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
    const stored = [{ id: notificationItemId(id, "dates"), revision: 1 }];
    const readItems = [{ ...stored[0], readAt: now }];
    const changedId = new ObjectId();
    const supersededId = new ObjectId();
    notifications.aggregateRows.push([
      { ...note, attentionItems: stored, _storedItems: stored },
      { ...note, _id: changedId, attentionItems: readItems, _storedItems: stored },
      { ...note, _id: supersededId, readAt: now },
    ]);
    await expect(fixture.repo.deleteOne("user_owner", objectId.toHexString())).resolves.toEqual({
      deletedCount: 1,
    });
    expect(notifications.aggregate.mock.calls[0][0].slice(0, 2)).toEqual([
      { $match: { recipientUserId: "user_owner", readAt: { $exists: false } } },
      { $set: { _storedItems: "$attentionItems" } },
    ]);
    expect(notifications.updateOne.mock.calls).toEqual([
      [
        {
          _id: changedId,
          recipientUserId: "user_owner",
          readAt: { $exists: false },
          attentionItems: stored,
        },
        { $set: { attentionItems: readItems } },
        { session },
      ],
      [
        {
          _id: supersededId,
          recipientUserId: "user_owner",
          readAt: { $exists: false },
          attentionItems: { $exists: false },
        },
        { $set: { readAt: now } },
        { session },
      ],
    ]);
    expect(notifications.deleteOne).toHaveBeenCalledExactlyOnceWith(
      { _id: objectId, recipientUserId: "user_owner" },
      { session },
    );
  });

  it("cleans the departing user's own/actor notices and push registrations after preserving other recipient history", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    const notifications = fixture.collection(COLLECTIONS.NOTIFICATIONS);
    notifications.aggregateRows.push([{ _id: "user_other" }], []);
    await fixture.repo.deleteForUser("user_owner");
    expect(notifications.aggregate.mock.calls[0]).toEqual([
      [
        { $match: { actorUserId: "user_owner", recipientUserId: { $ne: "user_owner" } } },
        { $group: { _id: "$recipientUserId" } },
      ],
      { session },
    ]);
    expect(notifications.aggregate.mock.calls[1][0][0]).toEqual({
      $match: { recipientUserId: "user_other", readAt: { $exists: false } },
    });
    expect(notifications.deleteMany).toHaveBeenCalledExactlyOnceWith(
      { $or: [{ recipientUserId: "user_owner" }, { actorUserId: "user_owner" }] },
      { session },
    );
    expect(
      fixture.collection(COLLECTIONS.PUSH_SUBSCRIPTIONS).deleteMany,
    ).toHaveBeenCalledExactlyOnceWith({ userId: "user_owner" }, { session });
  });
});
