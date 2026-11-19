import type { PushSubscription } from "@board-game-organizer/schemas";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
import { PushSubscriptionsRepository } from "../push-subscriptions.repository";

function setup(session?: ClientSession) {
  const toArray = vi.fn(async (): Promise<unknown[]> => []);
  const collection = {
    updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    find: vi.fn(() => ({ toArray })),
  };
  const db = { collection: vi.fn(() => collection) };
  return {
    ...collection,
    toArray,
    db,
    repo: new PushSubscriptionsRepository(db as unknown as Db, session),
  };
}

afterEach(() => vi.useRealTimers());

describe("PushSubscriptionsRepository with the Mongo boundary controlled", () => {
  it.each([
    ["web", "fcm", "en", undefined],
    ["android", "fcm", "it", {}],
    ["ios", "apns", "en", {}],
  ] as const)(
    "upserts %s delivery without resetting the original creation date",
    async (platform, provider, locale, session) => {
      const now = new Date("2026-11-18T12:00:00.000Z");
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const fixture = setup(session as ClientSession | undefined);
      await expect(
        fixture.repo.upsert("user_owner", "device-token", platform, locale),
      ).resolves.toEqual({ modifiedCount: 1 });
      expect(fixture.db.collection).toHaveBeenCalledWith(COLLECTIONS.PUSH_SUBSCRIPTIONS);
      expect(fixture.updateOne).toHaveBeenCalledExactlyOnceWith(
        { token: "device-token" },
        {
          $set: {
            userId: "user_owner",
            token: "device-token",
            platform,
            provider,
            locale,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, ...(session ? { session } : {}) },
      );
    },
  );

  it("scopes an account removal but permits invalid delivery-token cleanup independently", async () => {
    const session = {} as ClientSession;
    const fixture = setup(session);
    await expect(fixture.repo.remove("user_owner", "token")).resolves.toEqual({ deletedCount: 1 });
    await fixture.repo.removeToken("expired-token");
    expect(fixture.deleteOne.mock.calls).toEqual([
      [{ userId: "user_owner", token: "token" }, { session }],
      [{ token: "expired-token" }, { session }],
    ]);
  });

  it("returns the actual account cursor results, including an empty result", async () => {
    const fixture = setup();
    const rows = [
      {
        _id: new ObjectId(),
        userId: "user_owner",
        token: "one",
        platform: "web",
        provider: "fcm",
        locale: "en",
        createdAt: new Date("2026-11-18T10:00:00.000Z"),
        updatedAt: new Date("2026-11-18T10:00:00.000Z"),
      },
    ] satisfies PushSubscription[];
    fixture.toArray.mockResolvedValueOnce(rows);
    await expect(fixture.repo.listByUser("user_owner")).resolves.toBe(rows);
    await expect(fixture.repo.listByUser("user_other")).resolves.toEqual([]);
    expect(fixture.find.mock.calls).toEqual([
      [{ userId: "user_owner" }, {}],
      [{ userId: "user_other" }, {}],
    ]);
  });

  it("propagates driver failures rather than reporting a successful empty operation", async () => {
    const fixture = setup();
    const failure = new Error("Mongo unavailable");
    fixture.updateOne.mockRejectedValueOnce(failure);
    fixture.deleteOne.mockRejectedValueOnce(failure);
    fixture.toArray.mockRejectedValueOnce(failure);
    await expect(fixture.repo.upsert("user_owner", "token", "web", "en")).rejects.toBe(failure);
    await expect(fixture.repo.remove("user_owner", "token")).rejects.toBe(failure);
    await expect(fixture.repo.listByUser("user_owner")).rejects.toBe(failure);
  });
});
