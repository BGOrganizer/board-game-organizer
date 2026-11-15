import { describe, expect, it } from "vitest";
import { notificationSupersessionPipeline } from "../notification-supersession";

describe("recipient-owned notification supersession pipeline", () => {
  it("keeps histories and independently projects points against all later notices, including read ones", () => {
    const pipeline = notificationSupersessionPipeline("2026-01-01T00:00:00.000Z");
    const serialized = JSON.stringify(pipeline);
    expect(pipeline).toHaveLength(5);
    expect(serialized).toContain('"$recipientUserId","$$recipient"');
    expect(serialized).toContain('"$$candidate.itemId","$$point.id"');
    expect(serialized).toContain('"$$candidate._id","$_id"');
    expect(serialized).toContain('"$attentionItems.changedAt","$createdAt"');
    expect(serialized).toContain('"group_invitation","table_invitation"');
    expect(serialized).not.toContain('"actorUserId"');
    expect(serialized).not.toContain('"$merge"');
    expect(pipeline[0].$lookup.pipeline[0].$match).not.toHaveProperty("readAt");
    expect(pipeline[0].$lookup.let.recipient.$cond.slice(1)).toEqual(["$recipientUserId", false]);
    expect(pipeline[0].$lookup.pipeline[0].$match.$expr.$and).not.toContain("$$enabled");
    expect(pipeline[1].$lookup.pipeline[0].$match.$expr).toEqual({ $eq: ["$id", "$$eventId"] });
    expect(pipeline[1].$lookup.let.eventId.$cond[2]).toBe(false);
    expect(pipeline[0].$lookup.pipeline[2].$project.state).toBeDefined();
  });
});

it("materializes only projected superseded markers with a captured-item compare before deleting their winner", async () => {
  const { NotificationsRepository } = await import("../notifications.repository");
  const { ObjectId } = await import("mongodb");
  const date = new Date("2026-01-01T00:00:00.000Z");
  const original = [
    { id: "date", revision: 1 },
    { id: "game", revision: 1 },
  ];
  const projected = [{ ...original[0], readAt: date }, original[1]];
  const rows = [
    { _id: new ObjectId(), attentionItems: original, _storedItems: original },
    { _id: new ObjectId(), readAt: date },
    { _id: new ObjectId(), attentionItems: projected, _storedItems: original },
  ];
  const writes: unknown[] = [];
  const deletion = { deletedCount: 1 };
  const db = {
    collection: () => ({
      aggregate: () => ({
        async *[Symbol.asyncIterator]() {
          yield* rows;
        },
      }),
      updateOne: async (...args: unknown[]) => {
        writes.push(args);
      },
      deleteOne: async () => {
        expect(writes).toHaveLength(2);
        return deletion;
      },
    }),
  };
  expect(
    await new NotificationsRepository(db as never).deleteOne(
      "recipient",
      new ObjectId().toHexString(),
    ),
  ).toBe(deletion);
  expect(writes).toEqual([
    [
      {
        _id: rows[1]._id,
        recipientUserId: "recipient",
        readAt: { $exists: false },
        attentionItems: { $exists: false },
      },
      { $set: { readAt: date } },
      {},
    ],
    [
      {
        _id: rows[2]._id,
        recipientUserId: "recipient",
        readAt: { $exists: false },
        attentionItems: original,
      },
      { $set: { attentionItems: projected } },
      {},
    ],
  ]);
});

it("retains other recipients' superseded reads sequentially in the caller's purge transaction", async () => {
  const { NotificationsRepository } = await import("../notifications.repository");
  const { ObjectId } = await import("mongodb");
  const session = { id: "purge-session" };
  const first = new ObjectId(),
    second = new ObjectId();
  const at = new Date("2026-01-01T00:00:00.000Z");
  const order: string[] = [];
  const calls: unknown[] = [];
  const notificationCollection = {
    aggregate: (pipeline: Array<Record<string, unknown>>, opts: unknown) => {
      expect(opts).toEqual({ session });
      const filter = pipeline[0].$match as Record<string, unknown>;
      if (filter.actorUserId) {
        expect(filter).toEqual({ actorUserId: "deleted", recipientUserId: { $ne: "deleted" } });
        expect(pipeline[1]).toEqual({ $group: { _id: "$recipientUserId" } });
        return {
          async *[Symbol.asyncIterator]() {
            yield { _id: "first" };
            yield { _id: "second" };
          },
        };
      }
      order.push(`scan:${filter.recipientUserId}`);
      return {
        async *[Symbol.asyncIterator]() {
          yield { _id: filter.recipientUserId === "first" ? first : second, readAt: at };
        },
      };
    },
    updateOne: async (...args: unknown[]) => {
      const owner = (args[0] as { recipientUserId: string }).recipientUserId;
      order.push(`update:${owner}`);
      calls.push(args);
      await Promise.resolve();
      order.push(`finished:${owner}`);
    },
    deleteMany: async (filter: unknown, opts: unknown) => {
      expect(opts).toEqual({ session });
      expect(filter).toEqual({ $or: [{ recipientUserId: "deleted" }, { actorUserId: "deleted" }] });
      order.push("delete:notifications");
    },
  };
  const db = {
    collection: (name: string) =>
      name === "notifications"
        ? notificationCollection
        : {
            deleteMany: async (filter: unknown, opts: unknown) => {
              expect(filter).toEqual({ userId: "deleted" });
              expect(opts).toEqual({ session });
              order.push("delete:subscriptions");
            },
          },
  };
  await new NotificationsRepository(db as never, session as never).deleteForUser("deleted");
  expect(order).toEqual([
    "scan:first",
    "update:first",
    "finished:first",
    "scan:second",
    "update:second",
    "finished:second",
    "delete:notifications",
    "delete:subscriptions",
  ]);
  expect(calls).toHaveLength(2);
});
