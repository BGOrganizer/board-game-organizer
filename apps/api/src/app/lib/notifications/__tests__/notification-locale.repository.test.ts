import type { Notification } from "@board-game-organizer/schemas";
import { ObjectId } from "mongodb";
import { expect, it, vi } from "vitest";
import { NotificationsRepository } from "../notifications.repository";

it("stores immutable copy inputs without exposing them through locale-specific inbox DTOs", async () => {
  const date = new Date("2027-01-01T00:00:00Z");
  let saved: Notification[] = [];
  const insertMany = vi.fn(async (rows: Notification[]) => {
    saved = rows.map((row) => ({ ...row, _id: new ObjectId() }));
    return { insertedIds: { 0: saved[0]._id } };
  });
  const aggregate = vi.fn((pipeline: Record<string, unknown>[]) => ({
    toArray: async () => (pipeline.some((stage) => "$count" in stage) ? [{ count: 1 }] : saved),
  }));
  const db = {
    collection: (name: string) =>
      name === "users"
        ? {
            find: () => ({
              toArray: async () => [
                { clerkId: "actor", name: "Actor", username: "original_username" },
                { clerkId: "recipient", preferredLanguage: "en" },
              ],
            }),
          }
        : { insertMany, aggregate, findOne: vi.fn(async () => null) },
  };
  const repo = new NotificationsRepository(db as never);
  const href =
    "/events/00000000-0000-4000-8000-000000000001/tables/00000000-0000-4000-8000-000000000002";
  await repo.notify({
    kind: "table_invitation",
    actorUserId: "actor",
    recipientUserId: "recipient",
    resourceName: "Original Table",
    resourceHref: href,
  });
  expect(saved[0]).toMatchObject({
    copy: { actorName: "original_username", resourceName: "Original Table" },
    title: "Table invitation",
    href,
  });
  saved[0].createdAt = date;
  const italian = await repo.list("recipient", 5, undefined, "it");
  expect(italian.notifications[0]).toEqual({
    id: saved[0]._id.toHexString(),
    kind: "table_invitation",
    title: "Invito a un tavolo",
    description: "original_username: Original Table",
    href,
    createdAt: date.toISOString(),
    readAt: null,
    requiresResponse: false,
  });
  expect(aggregate.mock.calls[0][0][0]).toEqual({ $match: { recipientUserId: "recipient" } });
  expect(saved[0].title).toBe("Table invitation");
  expect((await repo.list("recipient", 5, undefined, "en")).notifications[0].title).toBe(
    "Table invitation",
  );
  expect((await repo.list("recipient", 5)).notifications[0].title).toBe("Table invitation");
});
