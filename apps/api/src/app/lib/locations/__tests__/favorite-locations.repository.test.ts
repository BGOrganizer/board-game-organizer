import { createHash } from "node:crypto";
import { locationFavoriteKey } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "../../db";
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
  const col = {
    find: vi.fn(() => cursor),
    updateOne: vi.fn(),
    findOneAndDelete: vi.fn(
      async () =>
        ({ canonicalKey: locationFavoriteKey(location) }) as { canonicalKey?: string } | null,
    ),
    deleteMany: vi.fn(),
    distinct: vi.fn(async () => [] as Array<string | undefined>),
  };
  const db = { collection: vi.fn(() => col) };
  return { repository: new FavoriteLocationsRepository(db as never, session), col, cursor, db };
}

describe("FavoriteLocationsRepository", () => {
  it("preserves selection identity while storing canonical coordinates and bounded owner-scoped status aliases", async () => {
    const { repository, col, cursor } = setup();
    const selectedKey = locationFavoriteKey({ ...location, longitude: 1 });
    const canonicalKey = locationFavoriteKey(location);
    expect(await repository.save("owner", location, selectedKey)).toEqual({
      key: selectedKey,
      location,
    });
    expect(col.updateOne).toHaveBeenCalledWith(
      { _id: `owner:${createHash("sha256").update(selectedKey).digest("hex")}`, userId: "owner" },
      { $set: { key: selectedKey, canonicalKey, location, userId: "owner" } },
      { upsert: true, session: undefined },
    );
    cursor.toArray.mockResolvedValue([{ key: selectedKey }]);
    col.distinct.mockResolvedValueOnce([canonicalKey, undefined]);
    const missing = "missing";
    expect(await repository.statuses("owner", [selectedKey, canonicalKey, missing])).toEqual([
      selectedKey,
      canonicalKey,
    ]);
    expect(col.distinct).toHaveBeenCalledWith(
      "canonicalKey",
      { userId: "owner", canonicalKey: { $in: [canonicalKey, missing] } },
      { session: undefined },
    );
    cursor.toArray.mockResolvedValue([]);
    expect(await repository.statuses("foreign", [selectedKey, canonicalKey])).toEqual([]);
  });
  it("removes by exact selection first, then only equivalent canonical favorites owned by that user", async () => {
    const { repository, col } = setup();
    col.findOneAndDelete.mockResolvedValueOnce(null);
    await repository.remove("owner", "canonical");
    expect(col.deleteMany).toHaveBeenCalledWith(
      { userId: "owner", canonicalKey: "canonical" },
      { session: undefined },
    );
    col.deleteMany.mockClear();
    col.findOneAndDelete.mockResolvedValueOnce({ canonicalKey: "canonical" });
    await repository.remove("owner", "canonical");
    expect(col.deleteMany).toHaveBeenCalledTimes(1);
    col.deleteMany.mockClear();
    col.findOneAndDelete.mockResolvedValueOnce({});
    await repository.remove("owner", "legacy");
    expect(col.deleteMany).toHaveBeenCalledTimes(1);
    col.deleteMany.mockClear();
    await repository.remove("owner", "selection");
    expect(col.deleteMany).not.toHaveBeenCalled();
  });
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
      { $set: { key, location, userId: "user_one", canonicalKey: key } },
      { upsert: true, session },
    );
    cursor.toArray.mockResolvedValue([{ key }]);
    expect(await repository.statuses("user_one", [key])).toEqual([key]);
    expect(col.find).toHaveBeenLastCalledWith(
      { userId: "user_one", key: { $in: [key] } },
      { projection: { key: 1 }, session },
    );
    await repository.remove("user_one", key);
    expect(col.findOneAndDelete).toHaveBeenCalledWith(
      { userId: "user_one", key },
      { session, projection: { canonicalKey: 1 } },
    );
  });
});
