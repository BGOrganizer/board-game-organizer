import type { ClientSession, Db } from "mongodb";
import { expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { EventsRepository } from "../../events/events.repository";
import { OrganizationsRepository } from "../../organizations/organizations.repository";

it("counts distinct confirmed participants on active tables, scoped to the event and session", async () => {
  const session = {} as ClientSession;
  const toArray = vi.fn().mockResolvedValue([{ count: 3 }]);
  const aggregate = vi.fn(() => ({ toArray }));
  const collection = vi.fn(() => ({ aggregate }));
  const repo = new EventsRepository({ collection } as unknown as Db, session);
  expect(await repo.countConfirmedParticipants("event")).toBe(3);
  expect(aggregate).toHaveBeenCalledWith(
    [
      { $match: { eventId: "event", status: "CONFIRMED" } },
      {
        $lookup: {
          from: COLLECTIONS.EVENT_TABLES,
          localField: "tableId",
          foreignField: "id",
          pipeline: [{ $match: { eventId: "event", status: { $ne: "CANCELLED" } } }],
          as: "activeTables",
        },
      },
      { $match: { "activeTables.0": { $exists: true } } },
      { $group: { _id: "$userId" } },
      { $count: "count" },
    ],
    { session },
  );
  toArray.mockResolvedValue([]);
  expect(await repo.countConfirmedParticipants("event")).toBe(0);
  toArray.mockRejectedValue(new Error("Database unavailable"));
  await expect(repo.countConfirmedParticipants("event")).rejects.toThrow("Database unavailable");
});
it("counts published events only, without fetching pages or hiding database failures", async () => {
  const countDocuments = vi.fn().mockResolvedValue(12);
  const collection = vi.fn(() => ({ countDocuments }));
  const repo = new OrganizationsRepository({ collection } as unknown as Db);
  expect(await repo.countPublishedEvents("org")).toBe(12);
  expect(countDocuments).toHaveBeenCalledWith({ organizationId: "org", status: "PUBLISHED" }, {});
  countDocuments.mockRejectedValue(new Error("Database unavailable"));
  await expect(repo.countPublishedEvents("org")).rejects.toThrow("Database unavailable");
});
