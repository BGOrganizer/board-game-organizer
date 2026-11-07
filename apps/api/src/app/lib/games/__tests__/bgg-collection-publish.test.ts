import type { BggCollectionGame } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { expect, it, vi } from "vitest";
import { BggAccountRepository } from "../bgg-account.repository";

it("fills a missing canonical cover from the real snapshot metadata without overwriting existing covers or colliding update paths", async () => {
  const catalogWrite = vi.fn(),
    snapshotWrite = vi.fn();
  const db = {
    collection: (name: string) =>
      name === "bggAccounts"
        ? {
            findOne: async () => ({ pending: { snapshot: "next" } }),
            updateOne: async () => ({ modifiedCount: 1 }),
          }
        : name === "boardGames"
          ? {
              find: () => ({
                toArray: async () => [
                  { id: 1, image: null },
                  { id: 2, image: "https://cf.geekdo-images.com/known.jpg" },
                ],
              }),
              bulkWrite: catalogWrite,
            }
          : { bulkWrite: snapshotWrite, deleteMany: vi.fn() },
  } as unknown as Db;
  const game = {
    userId: "owner",
    snapshot: "next",
    name: "Game",
    year: null,
    subtype: "boardgame",
    imageUrl: "https://cf.geekdo-images.com/selected.jpg",
    xml: "<item/>",
  };
  await new BggAccountRepository(db).publish(
    "owner",
    "next",
    { id: 1, username: "owned", avatarUrl: null },
    [
      { ...game, gameId: 1 },
      { ...game, gameId: 2 },
    ],
  );
  const ops = catalogWrite.mock.calls[0][0];
  expect(ops[0].updateOne.update.$set).toEqual({ image: game.imageUrl });
  expect(ops[0].updateOne.update.$setOnInsert).not.toHaveProperty("image");
  expect(ops[1].updateOne.update).not.toHaveProperty("$set");
});
it("publishes full owner snapshot counts atomically without importing expansions as playable base games", async () => {
  const updateOne = vi.fn(async () => ({ modifiedCount: 1 }));
  const catalogWrite = vi.fn(),
    snapshotWrite = vi.fn(),
    deleteMany = vi.fn();
  const db = {
    collection: (name: string) =>
      name === "bggAccounts"
        ? { findOne: async () => ({ pending: { snapshot: "next" } }), updateOne }
        : name === "boardGames"
          ? {
              find: () => ({ toArray: async () => [{ id: 3, isExpansion: true }] }),
              bulkWrite: catalogWrite,
            }
          : { bulkWrite: snapshotWrite, deleteMany },
  } as unknown as Db;
  const base = {
    userId: "foreign",
    snapshot: "other",
    name: "Game",
    year: null,
    imageUrl: null,
    subtype: "boardgame",
    xml: "<item/>",
  };
  const games: Omit<BggCollectionGame, "_id">[] = [
    { ...base, gameId: 1, userRating: 8, wishlist: true },
    {
      ...base,
      gameId: 2,
      subtype: "boardgameexpansion",
      isExpansion: true,
      userRating: null,
      wishlist: true,
    },
    { ...base, gameId: 3 },
    { ...base, gameId: 1, userRating: 8, wishlist: true },
  ];
  await new BggAccountRepository(db).publish(
    "owner",
    "next",
    { id: 1, username: "owned", avatarUrl: null },
    games,
  );
  expect(catalogWrite.mock.calls[0][0]).toHaveLength(1);
  expect(catalogWrite.mock.calls[0][0][0].updateOne.filter).toEqual({ id: 1 });
  const records = snapshotWrite.mock.calls[0][0].map(
    (op: { updateOne: { update: { $set: BggCollectionGame } } }) => op.updateOne.update.$set,
  );
  expect(records).toHaveLength(3);
  expect(records.map((row: BggCollectionGame) => row.isExpansion)).toEqual([false, true, true]);
  expect(
    records.every((row: BggCollectionGame) => row.userId === "owner" && row.snapshot === "next"),
  ).toBe(true);
  expect(updateOne).toHaveBeenCalledWith(
    expect.objectContaining({ userId: "owner", "pending.snapshot": "next" }),
    expect.objectContaining({
      $set: expect.objectContaining({
        active: expect.objectContaining({
          snapshot: "next",
          counts: { withoutExpansions: 1, withExpansions: 3, wishlist: 2 },
        }),
      }),
    }),
  );
  expect(deleteMany).toHaveBeenCalledWith({ userId: "owner", snapshot: { $ne: "next" } });
});
