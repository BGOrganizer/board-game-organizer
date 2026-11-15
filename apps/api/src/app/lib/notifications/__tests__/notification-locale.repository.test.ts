import type { Notification } from "@board-game-organizer/schemas";
import { ObjectId } from "mongodb";
import { expect, it, vi } from "vitest";
import { NotificationChangesRepository } from "../notification-changes.repository";
import { NotificationsRepository } from "../notifications.repository";

it("stores immutable copy inputs without exposing them through locale-specific inbox DTOs", async () => {
  const date = new Date("2027-01-01T00:00:00Z");
  let saved: Notification[] = [];
  const insertMany = vi.fn(async (rows: Notification[]) => {
    saved = rows.map((row) => ({ ...row, _id: new ObjectId() }));
    return { insertedIds: { 0: saved[0]._id } };
  });
  const aggregate = vi.fn((pipeline: Record<string, unknown>[]) => ({
    toArray: async () =>
      pipeline.some((stage) => "$facet" in stage)
        ? [
            {
              rows: saved.map((row) => ({ ...row, _effectiveAt: row.createdAt })),
              counts: [{ _id: "participants", count: 1 }],
            },
          ]
        : pipeline.some((stage) => "$count" in stage)
          ? [{ count: 1 }]
          : saved,
  }));
  const db = {
    collection: (name: string) =>
      name === "users"
        ? {
            findOne: async () => null,
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
    resourceName: "Café e società",
    resourceHref: href,
  });
  expect(saved[0]).toMatchObject({
    copy: { actorName: "original_username", resourceName: "Café e società" },
    title: "Table invitation",
    href,
  });
  saved[0].createdAt = date;
  const italian = await repo.list("recipient", 5, undefined, "it");
  expect(italian.notifications[0]).toEqual({
    id: saved[0]._id.toHexString(),
    kind: "table_invitation",
    title: "Invito a un tavolo",
    description: "original_username: Café e società",
    href,
    createdAt: date.toISOString(),
    readAt: null,
    requiresResponse: false,
  });
  expect(aggregate.mock.calls[0][0][0]).toEqual({ $match: { recipientUserId: "recipient" } });
  expect(saved[0].title).toBe("Table invitation");
  const changes = new NotificationChangesRepository(db as never);
  const scope = {
    kind: "table" as const,
    id: "00000000-0000-4000-8000-000000000002",
    tab: "all" as const,
    limit: 8,
  };
  for (const locale of ["en", "it"] as const) {
    const change = (await changes.list("recipient", { ...scope, locale })).changes[0];
    const inbox = (await repo.list("recipient", 5, undefined, locale)).notifications[0];
    expect({ title: change.title, description: change.description }).toEqual({
      title: inbox.title,
      description: inbox.description,
    });
    expect(change.readReference).toEqual({
      notificationId: saved[0]._id.toHexString(),
      effectiveAt: date.toISOString(),
    });
    expect(change).not.toHaveProperty("copy");
  }

  expect((await changes.list("recipient", scope)).changes[0].title).toBe("Table invitation");
  expect((await repo.list("recipient", 5, undefined, "en")).notifications[0].title).toBe(
    "Table invitation",
  );
  expect((await repo.list("recipient", 5)).notifications[0].title).toBe("Table invitation");
});
