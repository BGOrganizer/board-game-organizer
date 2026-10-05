import { createHash } from "node:crypto";
import { locationFavoriteKey } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../db";
import { FavoriteLocationsRepository } from "../favorite-locations.repository";

const location = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Game club",
  address: "Main Street 10",
  longitude: 12.5,
  latitude: 41.9,
};
function setup(session?: never) {
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
  };
  const col = { find: vi.fn(() => cursor), updateOne: vi.fn(), deleteOne: vi.fn() };
  const db = { collection: vi.fn(() => col) };
  return { repository: new FavoriteLocationsRepository(db as never, session), col, cursor, db };
}

describe("FavoriteLocationsRepository", () => {
  it("paginates scoped rows without exposing internal document fields", async () => {
    const { repository, col, cursor, db } = setup();
    expect(await repository.list("user_one", 1)).toEqual({ items: [], nextCursor: null });
    expect(db.collection).toHaveBeenCalledWith(COLLECTIONS.FAVORITE_LOCATIONS);
    expect(col.find).toHaveBeenLastCalledWith({ userId: "user_one" }, { session: undefined });
    const key = locationFavoriteKey(location);
    cursor.toArray.mockResolvedValue([
      { _id: `user_one:${"a".repeat(64)}`, key, location },
      { _id: `user_one:${"b".repeat(64)}`, key, location },
    ]);
    expect(await repository.list("user_one", 1, "0".repeat(64))).toEqual({
      items: [{ key, location }],
      nextCursor: "a".repeat(64),
    });
    expect(col.find).toHaveBeenLastCalledWith(
      { userId: "user_one", _id: { $gt: `user_one:${"0".repeat(64)}` } },
      { session: undefined },
    );
    expect(cursor.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(cursor.limit).toHaveBeenCalledWith(2);
  });
  it("saves idempotently and scopes status lookup and removal to current user/session", async () => {
    const session = { transaction: true } as never;
    const { repository, col, cursor } = setup(session);
    const key = locationFavoriteKey(location);
    expect(await repository.save("user_one", location)).toEqual({ key, location });
    expect(col.updateOne).toHaveBeenCalledWith(
      { _id: `user_one:${createHash("sha256").update(key).digest("hex")}`, userId: "user_one" },
      { $set: { key, location, userId: "user_one" } },
      { upsert: true, session },
    );
    cursor.toArray.mockResolvedValue([{ key }]);
    expect(await repository.statuses("user_one", [key])).toEqual([key]);
    expect(col.find).toHaveBeenLastCalledWith(
      { userId: "user_one", key: { $in: [key] } },
      { projection: { key: 1 }, session },
    );
    await repository.remove("user_one", key);
    expect(col.deleteOne).toHaveBeenCalledWith({ userId: "user_one", key }, { session });
  });
});
