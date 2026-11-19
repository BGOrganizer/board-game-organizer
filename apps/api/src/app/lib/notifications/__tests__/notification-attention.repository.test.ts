import {
  type NotificationAttentionTarget,
  notificationItemId,
} from "@board-game-organizer/schemas";
import { type ClientSession, type Db, type Document, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { NotificationAttentionRepository } from "../notification-attention.repository";

const now = "2026-11-18T12:00:00.000Z";
const id = "00000000-0000-4000-8000-000000000001";
const groupId = "00000000-0000-4000-8000-000000000002";
const itemId = notificationItemId(id, "dates");
const summary = {
  inbox: 3,
  tables: 1,
  events: 2,
  groups: 1,
  contacts: 1,
  requests: 1,
  connections: 0,
};

function setup(results: Document[][], session?: ClientSession) {
  const batches = [...results];
  const findOne = vi.fn(async (): Promise<Document | null> => null);
  const aggregate = vi.fn((_pipeline: Document[], _options: Document) => ({
    toArray: async () => {
      const batch = batches.shift();
      if (!batch) throw new Error("Unexpected aggregation");
      return batch;
    },
  }));
  const updateMany = vi.fn(
    async (_filter: Document, _update: Document | Document[], _options: Document) => ({
      modifiedCount: 2,
    }),
  );
  const collection = { findOne, aggregate, updateMany };
  const db = { collection: vi.fn(() => collection) };
  return {
    findOne,
    aggregate,
    updateMany,
    db,
    batches,
    repo: new NotificationAttentionRepository(db as unknown as Db, session),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("NotificationAttentionRepository with real repository routing", () => {
  it.each([
    [
      { kind: "event-list", id: "mine" },
      { _lists: { $elemMatch: { kind: "event-list", id: "mine" } } },
    ],
    [
      { kind: "group-list", id: "PRIVATE" },
      { _lists: { $elemMatch: { kind: "group-list", id: "PRIVATE" } } },
    ],
    [
      { kind: "item", id: itemId },
      { $or: [{ "_items.id": itemId }, { "_items.sectionId": itemId }], _kind: { $ne: null } },
    ],
    [{ kind: "table", id }, { _tableIds: id }],
    [{ kind: "event", id }, { _ownerEvents: id }],
    [{ kind: "group", id }, { _ownerGroups: id }],
    [{ kind: "contacts", id: "requests" }, { _section: "requests" }],
    [
      { kind: "contact", id: "user_friend" },
      { _kind: "contact", _idTarget: "user_friend" },
    ],
  ] satisfies [NotificationAttentionTarget, Document][])(
    "routes only the canonical %j owner",
    (target, expected) => {
      expect(setup([]).repo.sourceMatches(target)).toEqual(expected);
    },
  );

  it("authorizes recipient-owned unread source rows at the captured cutoff and forwards the session", async () => {
    const session = {} as ClientSession;
    const fixture = setup([], session);
    const objectId = new ObjectId();
    fixture.findOne.mockResolvedValueOnce({ bgoRole: "ADMIN" });
    const source = await fixture.repo.authorizedSource("user_owner", now, { _id: objectId });
    expect(fixture.findOne).toHaveBeenCalledExactlyOnceWith({ clerkId: "user_owner" }, { session });
    expect(source[0]).toEqual({
      $match: {
        recipientUserId: "user_owner",
        readAt: { $exists: false },
        createdAt: { $lte: new Date(now) },
        _id: objectId,
      },
    });
    expect(source.length).toBeGreaterThan(1);
    expect(fixture.db.collection).toHaveBeenCalledWith(COLLECTIONS.USERS);
  });

  it("returns explicit zero counts for a missing source instead of fabricating references", async () => {
    const fixture = setup([[]]);
    const result = await fixture.repo.snapshot(
      "user_owner",
      [
        { kind: "event", id },
        { kind: "item", id: itemId },
      ],
      [],
      now,
    );
    expect(result.snapshot).toMatchObject({
      asOf: now,
      unreadCount: 0,
      summary: { tables: 0, events: 0, groups: 0, contacts: 0 },
      targets: [
        { count: 0, direct: 0 },
        { count: 0, direct: 0, readEffect: { unread: 0, targets: [] } },
      ],
    });
    expect(result.references.size).toBe(0);
    expect(result.personalNotificationIds.size).toBe(0);
    expect(fixture.findOne).toHaveBeenCalledWith(
      { clerkId: "user_owner" },
      { projection: { _id: 0, bgoRole: 1 } },
    );
  });

  it("maps complete aggregate effects and deduplicates owner lists without dropping personal references", async () => {
    const session = {} as ClientSession;
    const objectId = new ObjectId();
    const contactId = new ObjectId();
    const list = { kind: "event-list", id: "mine" };
    const fixture = setup(
      [
        [
          {
            summary: [summary],
            t0: [
              {
                count: 2,
                direct: 1,
                lists: [[list], [list]],
                tableIds: [[id], [id]],
                eventId: id,
                groupId,
              },
            ],
            t1: [
              {
                count: 1,
                unread: 2,
                signal: `${now}|${objectId.toHexString()}`,
                tables: 1,
                events: 1,
                groups: 0,
                eventId: id,
                groupId,
              },
            ],
            e1: [
              { _id: { kind: "item", id: itemId }, count: 1 },
              { _id: list, count: 1 },
            ],
            notifications: [
              {
                _id: objectId,
                kind: "event",
                id,
                eventId: id,
                groupId,
                personalAccessOnly: true,
                tableIds: [id],
                itemIds: [itemId],
                containers: [{ kind: "event", id }],
                lists: [list],
                historyTableIds: [id],
              },
              {
                _id: contactId,
                kind: "contact",
                id: "user_friend",
                section: "requests",
                tableIds: [],
                itemIds: [],
                containers: [],
              },
            ],
          },
        ],
      ],
      session,
    );
    const result = await fixture.repo.snapshot(
      "user_owner",
      [
        { kind: "event", id },
        { kind: "item", id: itemId },
      ],
      [objectId.toHexString(), contactId.toHexString()],
      now,
    );
    expect(result.snapshot.unreadCount).toBe(3);
    expect(result.snapshot.targets[0]).toMatchObject({
      lists: [list],
      tableIds: [id],
      count: 2,
      direct: 1,
    });
    expect(result.snapshot.targets[1]).toMatchObject({
      signal: `${now}|${objectId.toHexString()}`,
      count: 1,
      direct: 1,
      eventId: id,
      groupId,
      readEffect: {
        unread: 2,
        summary: { tables: 1, events: 1, groups: 0 },
        targets: [
          { target: { kind: "item", id: itemId }, direct: 1 },
          { target: list, direct: 0 },
        ],
      },
    });
    expect(result.references.get(objectId.toHexString())).toEqual({
      target: { kind: "event", id },
      eventId: id,
      groupId,
      tableIds: [id],
      itemIds: [itemId],
      containers: [{ kind: "event", id }],
      lists: [list],
      historyTableIds: [id],
    });
    expect(result.references.get(contactId.toHexString())).toEqual({
      target: { kind: "contact", id: "user_friend" },
      section: "requests",
      containers: [],
      lists: [],
      historyTableIds: [],
    });
    expect(result.personalNotificationIds).toEqual(new Set([objectId.toHexString()]));
    const [pipeline, options] = fixture.aggregate.mock.calls[0];
    expect(options).toEqual({ session });
    expect(pipeline[0]).toEqual({
      $match: {
        recipientUserId: "user_owner",
        readAt: { $exists: false },
        createdAt: { $lte: new Date(now) },
      },
    });
    expect(pipeline.at(-1)?.$facet.notifications[0]).toEqual({
      $match: { _id: { $in: [objectId, contactId] }, _kind: { $ne: null } },
    });
  });

  it.each([
    [{ kind: "contacts", id: "requests" }, { kind: "friend_request" }],
    [
      { kind: "contacts", id: "connections" },
      { kind: { $in: ["follow", "friend_request_accepted"] } },
    ],
    [
      { kind: "group", id },
      { kind: { $regex: "^group_" }, href: { $in: [`/groups/${id}`, `/moderation/${id}`] } },
    ],
    [
      { kind: "event", id },
      { kind: { $regex: "^(event_|table_)" }, href: `/events/${id}` },
    ],
    [
      { kind: "table", id },
      {
        kind: { $regex: "^(event_|table_)" },
        href: { $regex: expect.stringContaining(`/tables/${id}$`), $options: "i" },
      },
    ],
  ] satisfies [NotificationAttentionTarget, Document][])(
    "reads bounded generic %j source IDs while preserving structured notices",
    async (target, scopedFilter) => {
      const session = {} as ClientSession;
      const objectId = new ObjectId();
      const fixture = setup(
        [[{ t0: [{ count: 2, direct: 2 }] }], [{ _id: objectId }], [], []],
        session,
      );
      const result = await fixture.repo.read("user_owner", {
        target,
        through: "2027-01-01T00:00:00.000Z",
      });
      const filter = {
        recipientUserId: "user_owner",
        readAt: { $exists: false },
        createdAt: { $lte: new Date(now) },
        ...scopedFilter,
      };
      expect(result.updated).toBe(2);
      expect(fixture.updateMany).toHaveBeenCalledExactlyOnceWith(
        { ...filter, _id: { $in: [objectId] } },
        { $set: { readAt: new Date(now) } },
        { session },
      );
      const direct = fixture.aggregate.mock.calls[1][0];
      expect(direct[0]).toEqual({ $match: filter });
      expect(direct.slice(-3)).toEqual([
        {
          $match: {
            ...fixture.repo.sourceMatches(target),
            attentionItems: { $exists: false },
            _items: { $size: 0 },
            kind: {
              $nin: [
                "group_membership_requested",
                "group_review_requested",
                "event_agreement_ready",
                "event_proposal_created",
              ],
            },
          },
        },
        { $limit: 100 },
        { $project: { _id: 1 } },
      ]);
      expect(fixture.batches).toEqual([]);
    },
  );

  it("does not write a parent when its unread count comes only from precise points", async () => {
    const fixture = setup([[{ t0: [{ count: 2, direct: 0 }] }], []]);
    await expect(
      fixture.repo.read("user_owner", { target: { kind: "event", id }, through: now }),
    ).resolves.toMatchObject({ updated: 0 });
    expect(fixture.updateMany).not.toHaveBeenCalled();
    expect(fixture.aggregate).toHaveBeenCalledTimes(2);
  });

  it("uses the actual item acknowledger, passing only that item and its captured cutoff", async () => {
    const session = {} as ClientSession;
    const fixture = setup(
      [[{ t0: [{ count: 1, unread: 1 }], e0: [{ _id: { kind: "event", id }, count: 1 }] }], []],
      session,
    );
    const through = "2026-11-18T11:00:00.000Z";
    await expect(
      fixture.repo.read("user_owner", { target: { kind: "item", id: itemId }, through }),
    ).resolves.toMatchObject({ updated: 2 });
    const [filter, update, options] = fixture.updateMany.mock.calls[0];
    expect(filter).toMatchObject({
      recipientUserId: "user_owner",
      readAt: { $exists: false },
      createdAt: { $lte: new Date(through) },
      $or: [
        {
          attentionItems: {
            $elemMatch: {
              $or: [{ id: { $in: [itemId] } }, { sectionId: { $in: [itemId] } }],
              readAt: { $exists: false },
            },
          },
        },
      ],
    });
    expect(Array.isArray(update)).toBe(true);
    expect(options).toEqual({ session });
    expect(fixture.aggregate.mock.calls[1][0].at(-1)?.$facet.t1[0]).toEqual({
      $match: { _ownerEvents: id },
    });
  });

  it("propagates a write error before taking a misleading post-read snapshot", async () => {
    const fixture = setup([[{ t0: [{ direct: 1 }] }], [{ _id: new ObjectId() }]]);
    const error = new Error("transaction aborted");
    fixture.updateMany.mockRejectedValueOnce(error);
    await expect(
      fixture.repo.read("user_owner", { target: { kind: "event", id }, through: now }),
    ).rejects.toBe(error);
    expect(fixture.aggregate).toHaveBeenCalledTimes(2);
  });
});
