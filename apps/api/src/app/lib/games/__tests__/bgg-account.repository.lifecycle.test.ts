import type { BggAccount, BggCollectionGame, BggIdentity } from "@board-game-organizer/schemas";
import { type ClientSession, type Db, ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BggAccountRepository } from "../bgg-account.repository";

const now = new Date("2030-06-01T10:00:00.000Z");
const accountId = new ObjectId("000000000000000000000042");
const identity: BggIdentity = { id: 42, username: "fixture-player", avatarUrl: null };
const pending = {
  ...identity,
  snapshot: "pending-snapshot",
  status: "syncing" as const,
  attempts: 0,
};

function setup() {
  const accounts = {
    findOne: vi.fn(async (): Promise<BggAccount | null> => null),
    findOneAndUpdate: vi.fn(async (): Promise<BggAccount | null> => null),
    updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
  };
  const cursor = { toArray: vi.fn(async (): Promise<BggCollectionGame[]> => []) };
  const collection = {
    deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
    find: vi.fn(() => cursor),
  };
  const db = {
    collection: vi.fn((name: string) => {
      if (name === "bggAccounts") return accounts;
      if (name === "bggCollectionGames") return collection;
      throw new Error(`Unexpected fixture collection: ${name}`);
    }),
  };
  return {
    repository: new BggAccountRepository(db as unknown as Db),
    accounts,
    collection,
    cursor,
  };
}

describe("BggAccountRepository lifecycle with mocked MongoDB collections", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it("represents an absent account without inventing a linked or pending identity", async () => {
    const { repository, accounts } = setup();
    await expect(repository.get("owner")).resolves.toEqual({ active: null, pending: null });
    expect(accounts.findOne).toHaveBeenCalledExactlyOnceWith({ userId: "owner" });
    await expect(repository.pending("owner")).resolves.toBeNull();
  });

  it("projects current identities and serializes provider attempt dates without exposing a lease", async () => {
    const { repository, accounts } = setup();
    accounts.findOne.mockResolvedValueOnce({
      _id: accountId,
      userId: "owner",
      active: { ...identity, snapshot: "published", syncedAt: now },
      pending: { ...pending, nextAttemptAt: now, error: "Fixture queued export", leaseUntil: now },
      lastAttempt: { status: "syncing", at: now },
    });
    await expect(repository.get("owner")).resolves.toEqual({
      active: { ...identity, snapshot: "published", syncedAt: now.toISOString() },
      pending: {
        ...identity,
        status: "syncing",
        error: "Fixture queued export",
        nextAttemptAt: now.toISOString(),
      },
      lastAttempt: { status: "syncing", at: now.toISOString() },
    });
  });

  it("uses null for absent queued-at and error fields while retaining the real pending snapshot internally", async () => {
    const { repository, accounts } = setup();
    accounts.findOne.mockResolvedValue({ _id: accountId, userId: "owner", pending });
    await expect(repository.get("owner")).resolves.toEqual({
      active: null,
      pending: { ...identity, status: "syncing", error: null, nextAttemptAt: null },
    });
    await expect(repository.pending("owner")).resolves.toBe(pending);
  });

  it.each([
    null,
    { _id: accountId, userId: "owner" },
    { _id: accountId, userId: "owner", pending },
  ])(
    "stages a fresh pending snapshot and deletes only any superseded pending collection (%j)",
    async (previous) => {
      const { repository, accounts, collection } = setup();
      accounts.findOneAndUpdate.mockResolvedValueOnce(previous);
      const snapshot = await repository.stage("owner", identity);
      expect(snapshot).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(accounts.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
        { userId: "owner" },
        {
          $set: { pending: { ...pending, snapshot }, lastAttempt: { status: "syncing", at: now } },
          $setOnInsert: { userId: "owner" },
        },
        { upsert: true, returnDocument: "before" },
      );
      if (previous && "pending" in previous) {
        expect(collection.deleteMany).toHaveBeenCalledExactlyOnceWith({
          userId: "owner",
          snapshot: pending.snapshot,
        });
      } else expect(collection.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each([null, { _id: accountId, userId: "owner", pending }])(
    "claims only the matching syncing snapshot with an expired or absent lease (%j)",
    async (receipt) => {
      const { repository, accounts } = setup();
      accounts.findOneAndUpdate.mockResolvedValueOnce(receipt);
      await expect(repository.claim("owner", pending.snapshot)).resolves.toBe(receipt);
      expect(accounts.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
        {
          userId: "owner",
          "pending.snapshot": pending.snapshot,
          "pending.status": "syncing",
          $or: [
            { "pending.leaseUntil": { $exists: false } },
            { "pending.leaseUntil": { $lte: now } },
          ],
        },
        { $set: { "pending.leaseUntil": new Date(now.getTime() + 120_000) } },
        { returnDocument: "after" },
      );
    },
  );

  it.each([
    null,
    { _id: accountId, userId: "owner", pending: { ...pending, snapshot: "newer-snapshot" } },
  ])(
    "ignores stale queued callbacks without mutating the active or current pending account (%j)",
    async (account) => {
      const { repository, accounts, collection } = setup();
      accounts.findOne.mockResolvedValueOnce(account);
      await repository.queued("owner", pending.snapshot, 5000);
      expect(accounts.updateOne).not.toHaveBeenCalled();
      expect(collection.deleteMany).not.toHaveBeenCalled();
    },
  );

  it("queues a bounded retry on the captured snapshot and releases its lease", async () => {
    const { repository, accounts, collection } = setup();
    accounts.findOne.mockResolvedValueOnce({ _id: accountId, userId: "owner", pending });
    await repository.queued("owner", pending.snapshot, 5000);
    expect(accounts.updateOne).toHaveBeenCalledExactlyOnceWith(
      { userId: "owner", "pending.snapshot": pending.snapshot, "pending.status": "syncing" },
      {
        $set: { "pending.nextAttemptAt": new Date(now.getTime() + 5000) },
        $inc: { "pending.attempts": 1 },
        $unset: { "pending.leaseUntil": "" },
      },
    );
    expect(collection.deleteMany).not.toHaveBeenCalled();
  });

  it("restarts only the matching failed job, clearing its prior error, backoff and lease", async () => {
    const { repository, accounts } = setup();
    await expect(repository.restart("owner", pending.snapshot)).resolves.toEqual({
      modifiedCount: 1,
    });
    expect(accounts.updateOne).toHaveBeenCalledExactlyOnceWith(
      { userId: "owner", "pending.snapshot": pending.snapshot, "pending.status": "failed" },
      {
        $set: { "pending.status": "syncing", "pending.attempts": 0 },
        $unset: { "pending.error": "", "pending.nextAttemptAt": "", "pending.leaseUntil": "" },
      },
    );
  });

  it("unlinks account and collection sequentially in the caller's transaction", async () => {
    const { repository, accounts, collection } = setup();
    const session = { id: "fixture-bgg-session" } as unknown as ClientSession;
    let finishDelete: (receipt: { deletedCount: number }) => void = () => {};
    accounts.deleteOne.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelete = resolve;
        }),
    );
    const unlink = repository.unlink("owner", session);
    expect(accounts.deleteOne).toHaveBeenCalledExactlyOnceWith({ userId: "owner" }, { session });
    expect(collection.deleteMany).not.toHaveBeenCalled();
    finishDelete({ deletedCount: 1 });
    await unlink;
    expect(collection.deleteMany).toHaveBeenCalledExactlyOnceWith({ userId: "owner" }, { session });
  });

  it("preserves an unlink failure without attempting another operation on the failed session", async () => {
    const { repository, accounts, collection } = setup();
    const failure = new Error("Fixture unlink rejected");
    accounts.deleteOne.mockRejectedValueOnce(failure);
    await expect(repository.unlink("owner", {} as ClientSession)).rejects.toBe(failure);
    expect(collection.deleteMany).not.toHaveBeenCalled();
  });

  it("returns the real driver's cursor restricted to the owner and snapshot", () => {
    const { repository, collection, cursor } = setup();
    expect(repository.games("owner", "published")).toBe(cursor);
    expect(collection.find).toHaveBeenCalledExactlyOnceWith({
      userId: "owner",
      snapshot: "published",
    });
    expect(cursor.toArray).not.toHaveBeenCalled();
  });

  it("keeps failed account reads observable", async () => {
    const { repository, accounts } = setup();
    const failure = new Error("Fixture account read unavailable");
    accounts.findOne.mockRejectedValueOnce(failure);
    await expect(repository.get("owner")).rejects.toBe(failure);
  });
});
