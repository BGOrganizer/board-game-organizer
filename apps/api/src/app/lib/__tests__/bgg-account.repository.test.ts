import type { Db } from "mongodb";
import { expect, it, vi } from "vitest";
import { BggAccountRepository } from "../bgg-account.repository";

it("keeps published collection if an expired concurrent sync fails or finishes late", async () => {
  const active = {
    snapshot: "snap",
    id: 1,
    username: "alice",
    avatarUrl: null,
    syncedAt: new Date(),
  };
  const pending = {
    snapshot: "snap",
    id: 1,
    username: "alice",
    avatarUrl: null,
    status: "syncing",
    attempts: 0,
  };
  const findOne = vi
    .fn()
    .mockResolvedValueOnce({ pending })
    .mockResolvedValueOnce({ active })
    .mockResolvedValueOnce({ active });
  const deleteMany = vi.fn();
  const db = {
    collection: (name: string) =>
      name === "bggAccounts"
        ? { findOne, updateOne: vi.fn(async () => ({ modifiedCount: 0 })) }
        : { deleteMany },
  } as unknown as Db;
  const repository = new BggAccountRepository(db);
  await repository.publish("viewer", "snap", active, []);
  await repository.failed("viewer", "snap");
  expect(deleteMany).not.toHaveBeenCalled();
});

it("discards obsolete failed snapshot, never the previous published snapshot", async () => {
  const findOne = vi.fn().mockResolvedValue({
    active: { snapshot: "previous" },
    pending: { snapshot: "next", status: "syncing" },
  });
  const deleteMany = vi.fn();
  const db = {
    collection: (name: string) =>
      name === "bggAccounts"
        ? { findOne, updateOne: vi.fn(async () => ({ modifiedCount: 0 })) }
        : { deleteMany },
  } as unknown as Db;
  const repository = new BggAccountRepository(db);
  await repository.publish("viewer", "next", { id: 2, username: "bob", avatarUrl: null }, []);
  await repository.failed("viewer", "next");
  expect(deleteMany).toHaveBeenCalledTimes(2);
  expect(deleteMany).toHaveBeenCalledWith({ userId: "viewer", snapshot: "next" });
});
