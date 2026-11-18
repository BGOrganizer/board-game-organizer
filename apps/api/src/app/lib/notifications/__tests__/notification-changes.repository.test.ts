import { type NotificationChangesScope, notificationItemId } from "@board-game-organizer/schemas";
import { type ClientSession, type Db, type Document, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { NotificationChangesRepository } from "../notification-changes.repository";

const now = "2026-11-18T12:00:00.000Z";
const effectiveAt = "2026-11-18T11:00:00.000Z";
const id = "00000000-0000-4000-8000-000000000001";
const scope: NotificationChangesScope = { kind: "event", id, tab: "all" };
const objectId = new ObjectId("000000000000000000000001");
const reference = { notificationId: objectId.toHexString(), effectiveAt };
const note = {
  _id: objectId,
  recipientUserId: "user_owner",
  actorUserId: "user_actor",
  kind: "event_updated",
  href: `/events/${id}`,
  title: "Event updated",
  description: "The event changed",
  createdAt: new Date(effectiveAt),
  _effectiveAt: new Date(effectiveAt),
  _lists: [],
};

function setup(results: Document[][], session?: ClientSession) {
  const batches = [...results];
  const findOne = vi.fn(
    async (_filter: Document, _options: Document): Promise<Document | null> => null,
  );
  const aggregate = vi.fn((_pipeline: Document[], _options: Document) => ({
    toArray: async () => {
      const batch = batches.shift();
      if (!batch) throw new Error("Unexpected aggregation");
      return batch;
    },
  }));
  const updateOne = vi.fn(
    async (_filter: Document, _update: Document | Document[], _options: Document) => ({
      modifiedCount: 1,
    }),
  );
  const db = { collection: vi.fn((_name: string) => ({ findOne, aggregate, updateOne })) };
  return {
    batches,
    findOne,
    aggregate,
    updateOne,
    db,
    repo: new NotificationChangesRepository(db as unknown as Db, session),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe("NotificationChangesRepository using actual attention and response protection", () => {
  it("paginates captured changes using deterministic time, notification and item tie-breakers", async () => {
    const session = {} as ClientSession;
    const itemId = notificationItemId(id, "dates");
    const fixture = setup(
      [
        [
          {
            counts: [{ _id: "details", count: 2 }],
            rows: [
              { ...note, _item: { id: itemId, revision: 4 } },
              { ...note, _id: new ObjectId() },
            ],
          },
        ],
      ],
      session,
    );
    const cursor = { asOf: now, effectiveAt, notificationId: objectId.toHexString(), itemId: "" };
    const page = await fixture.repo.list("user_owner", {
      ...scope,
      tab: "details",
      limit: 1,
      cursor,
    });
    expect(page.changes).toEqual([
      expect.objectContaining({
        ...reference,
        itemId,
        revision: 4,
        title: note.title,
        description: note.description,
        requiresResponse: false,
        readReference: { ...reference, itemId, revision: 4 },
      }),
    ]);
    expect(JSON.parse(page.nextCursor ?? "null")).toEqual({ ...cursor, itemId });
    expect(page.tabCounts).toEqual({ details: 2, members: 0, tables: 0, participants: 0 });
    const [pipeline, options] = fixture.aggregate.mock.calls[0];
    expect(options).toEqual({ session });
    expect(pipeline[0]).toEqual({
      $match: {
        recipientUserId: "user_owner",
        readAt: { $exists: false },
        createdAt: { $lte: new Date(now) },
      },
    });
    expect(pipeline.at(-1)?.$facet.rows.slice(0, 4)).toEqual([
      { $match: { _tab: "details" } },
      {
        $match: {
          $or: [
            { _effectiveAt: { $lt: new Date(effectiveAt) } },
            { _effectiveAt: new Date(effectiveAt), _id: { $lt: objectId } },
            { _effectiveAt: new Date(effectiveAt), _id: objectId, _itemId: { $gt: "" } },
          ],
        },
      },
      { $sort: { _effectiveAt: -1, _id: -1, _itemId: 1 } },
      { $limit: 2 },
    ]);
  });

  it("returns a genuinely empty page with no next cursor and clamps future snapshot times", async () => {
    const fixture = setup([[]]);
    await expect(
      fixture.repo.list("user_owner", { ...scope, limit: 8 }, "2027-01-01T00:00:00.000Z"),
    ).resolves.toEqual({
      asOf: now,
      changes: [],
      nextCursor: null,
      tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
    });
    expect(fixture.aggregate.mock.calls[0][0].at(-1)?.$facet.rows[0]).toEqual({
      $sort: { _effectiveAt: -1, _id: -1, _itemId: 1 },
    });
  });

  it("acknowledges only reauthorized generic references and reports the selected union delta", async () => {
    const session = {} as ClientSession;
    const before = {
      summary: [
        { inbox: 3, tables: 0, events: 2, groups: 0, contacts: 1, requests: 1, connections: 0 },
      ],
      t0: [{ count: 2, direct: 1 }],
    };
    const after = {
      summary: [
        { inbox: 2, tables: 0, events: 1, groups: 0, contacts: 1, requests: 1, connections: 0 },
      ],
      t0: [{ count: 1, direct: 0 }],
    };
    const fixture = setup(
      [
        [note],
        [before],
        [{ counts: [{ _id: "details", count: 2 }], rows: [] }],
        [after],
        [{ counts: [{ _id: "details", count: 1 }], rows: [] }],
      ],
      session,
    );
    const result = await fixture.repo.read("user_owner", {
      scope,
      through: "2027-01-01T00:00:00.000Z",
      references: [reference],
    });
    expect(result).toMatchObject({
      updated: 1,
      readReferences: [reference],
      effects: {
        unread: 1,
        summary: { events: 1, contacts: 0 },
        tabCounts: { details: 1 },
        targets: [{ target: { kind: "event", id }, count: 1, direct: 1 }],
      },
    });
    expect(fixture.updateOne).toHaveBeenCalledExactlyOnceWith(
      { _id: objectId, recipientUserId: "user_owner", readAt: { $exists: false } },
      { $set: { readAt: new Date(now) } },
      { session },
    );
    const candidate = fixture.aggregate.mock.calls[0][0];
    expect(candidate[0]).toEqual({
      $match: {
        recipientUserId: "user_owner",
        readAt: { $exists: false },
        createdAt: { $lte: new Date(now) },
        _id: objectId,
      },
    });
    expect(candidate.slice(-2)).toEqual([
      {
        $match: {
          _itemId: "",
          _effectiveAt: new Date(effectiveAt),
          "_item.revision": { $exists: false },
        },
      },
      { $limit: 1 },
    ]);
    expect(fixture.aggregate.mock.calls.every(([, options]) => options.session === session)).toBe(
      true,
    );
    expect(fixture.batches).toEqual([]);
  });

  it("writes an exact item revision/effective time and acknowledges its section only once", async () => {
    const itemId = notificationItemId(id, "date", "00000000-0000-4000-8000-000000000002");
    const sectionId = notificationItemId(id, "dates");
    const itemReference = { ...reference, itemId, revision: 3 };
    const list = { kind: "event-list", id: "mine" };
    const fixture = setup([
      [
        {
          ...note,
          attentionItems: [{ id: itemId, revision: 3 }],
          _item: { id: itemId, revision: 3, sectionId },
          _lists: [list, list],
        },
      ],
      [],
      [],
      [],
      [],
    ]);
    const result = await fixture.repo.read("user_owner", {
      scope: { ...scope, tab: "details" },
      through: now,
      references: [itemReference],
    });
    expect(result.readReferences).toEqual([itemReference]);
    expect(fixture.aggregate.mock.calls[0][0].at(-2)).toEqual({
      $match: {
        _tab: "details",
        _itemId: itemId,
        _effectiveAt: new Date(effectiveAt),
        "_item.revision": 3,
      },
    });
    const [, update] = fixture.updateOne.mock.calls[0];
    expect(update).toEqual([
      {
        $set: {
          attentionItems: {
            $map: {
              input: "$attentionItems",
              as: "item",
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$$item.id", itemId] },
                      { $eq: [{ $ifNull: ["$$item.revision", null] }, 3] },
                      {
                        $eq: [
                          { $ifNull: ["$$item.changedAt", "$createdAt"] },
                          new Date(effectiveAt),
                        ],
                      },
                      { $eq: [{ $ifNull: ["$$item.readAt", null] }, null] },
                    ],
                  },
                  { $mergeObjects: ["$$item", { readAt: "$$NOW" }] },
                  "$$item",
                ],
              },
            },
          },
        },
      },
      {
        $set: {
          readAt: {
            $cond: [
              {
                $allElementsTrue: {
                  $map: {
                    input: "$attentionItems",
                    as: "item",
                    in: { $ne: [{ $ifNull: ["$$item.readAt", null] }, null] },
                  },
                },
              },
              "$$NOW",
              "$$REMOVE",
            ],
          },
        },
      },
    ]);
    const snapshotFacets = fixture.aggregate.mock.calls[1][0].at(-1)?.$facet;
    expect(Object.keys(snapshotFacets)).toEqual([
      "summary",
      "notifications",
      "t0",
      "t1",
      "e1",
      "t2",
      "e2",
      "t3",
    ]);
    expect(snapshotFacets.t3[0]).toEqual({ $match: { _lists: { $elemMatch: list } } });
  });

  it.each(["missing", "group_invitation", "table_invitation"] as const)(
    "preserves %s sources and never fabricates invitation consent",
    async (kind) => {
      const session = {} as ClientSession;
      const invitation = {
        ...note,
        kind,
        href: kind === "group_invitation" ? `/groups/${id}` : `/events/${id}/tables/${id}`,
      };
      const fixture = setup([kind === "missing" ? [] : [invitation], [], [], [], []], session);
      fixture.findOne.mockImplementation(async (filter) =>
        filter.kind === "INVITATION" ? { status: "PENDING" } : null,
      );
      const invitationScope: NotificationChangesScope =
        kind === "missing"
          ? scope
          : { kind: kind === "group_invitation" ? "group" : "table", id, tab: "all" };
      const result = await fixture.repo.read("user_owner", {
        scope: invitationScope,
        through: now,
        references: [reference],
      });
      expect(result.updated).toBe(0);
      expect(result.readReferences).toEqual([]);
      expect(fixture.updateOne).not.toHaveBeenCalled();
      if (kind !== "missing") {
        expect(fixture.findOne).toHaveBeenCalledWith(
          {
            [kind === "group_invitation" ? "groupId" : "tableId"]: id,
            userId: "user_owner",
            kind: "INVITATION",
            status: "PENDING",
          },
          { session },
        );
        expect(fixture.db.collection).toHaveBeenCalledWith(
          kind === "group_invitation"
            ? COLLECTIONS.GROUP_MEMBERSHIPS
            : COLLECTIONS.TABLE_REGISTRATIONS,
        );
      }
    },
  );

  it("does no writes for an empty capture set but still returns authoritative counts", async () => {
    const fixture = setup([[], [], [], []]);
    await expect(
      fixture.repo.read("user_owner", { scope, through: now, references: [] }),
    ).resolves.toMatchObject({ updated: 0, readReferences: [], effects: { unread: 0 } });
    expect(fixture.updateOne).not.toHaveBeenCalled();
    expect(fixture.batches).toEqual([]);
  });

  it("stops on an aborted write instead of returning a fabricated after snapshot", async () => {
    const fixture = setup([[note], [], []]);
    const error = new Error("write conflict");
    fixture.updateOne.mockRejectedValueOnce(error);
    await expect(
      fixture.repo.read("user_owner", { scope, through: now, references: [reference] }),
    ).rejects.toBe(error);
    expect(fixture.aggregate).toHaveBeenCalledTimes(3);
  });

  it("awaits each session write before the next write and the post-read snapshots", async () => {
    const secondId = new ObjectId("000000000000000000000002");
    const secondReference = { ...reference, notificationId: secondId.toHexString() };
    const fixture = setup(
      [[note], [{ ...note, _id: secondId }], [], [], [], []],
      {} as ClientSession,
    );
    let release: (value: { modifiedCount: number }) => void = () => {
      throw new Error("Write not started");
    };
    let signalStarted: () => void = () => {
      throw new Error("Missing start observer");
    };
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    fixture.updateOne.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
          signalStarted();
        }),
    );
    const pending = fixture.repo.read("user_owner", {
      scope,
      through: now,
      references: [reference, secondReference],
    });
    await started;
    expect(fixture.updateOne).toHaveBeenCalledTimes(1);
    expect(fixture.aggregate).toHaveBeenCalledTimes(4);
    release({ modifiedCount: 1 });
    await expect(pending).resolves.toMatchObject({
      updated: 2,
      readReferences: [reference, secondReference],
    });
    expect(fixture.updateOne.mock.calls.map(([filter]) => filter._id)).toEqual([
      objectId,
      secondId,
    ]);
    expect(fixture.batches).toEqual([]);
  });
});
