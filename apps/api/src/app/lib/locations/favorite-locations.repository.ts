import { createHash } from "node:crypto";
import {
  type FavoriteLocation,
  locationFavoriteKey,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import type { ClientSession, Collection, Db } from "mongodb";
import { COLLECTIONS } from "../db";

type FavoriteDocument = FavoriteLocation & { _id: string; userId: string; canonicalKey?: string };
export class FavoriteLocationsRepository {
  private readonly col: Collection<FavoriteDocument>;
  constructor(
    db: Db,
    private readonly session?: ClientSession,
  ) {
    this.col = db.collection<FavoriteDocument>(COLLECTIONS.FAVORITE_LOCATIONS);
  }
  async list(userId: string, limit: number, cursor?: string) {
    const rows = await this.col
      .find(
        { userId, ...(cursor ? { _id: { $gt: `${userId}:${cursor}` } } : {}) },
        { session: this.session },
      )
      .sort({ _id: 1 })
      .limit(limit + 1)
      .toArray();
    const page = rows.slice(0, limit);
    return {
      items: page.map(({ key, location }) => ({ key, location })),
      nextCursor: rows.length > limit ? page[page.length - 1]._id.slice(userId.length + 1) : null,
    };
  }
  async statuses(userId: string, keys: string[]) {
    const rows = await this.col
      .find({ userId, key: { $in: keys } }, { projection: { key: 1 }, session: this.session })
      .toArray();
    const found = new Set(rows.map((row) => row.key));
    const missing = keys.filter((key) => !found.has(key));
    if (missing.length) {
      // distinct bounds output by requested keys; the existing userId index keeps aliases owner-scoped.
      // ponytail: alias lookup scans one user's favorites; add { userId, canonicalKey } if collections grow.
      const canonical = await this.col.distinct(
        "canonicalKey",
        { userId, canonicalKey: { $in: missing } },
        { session: this.session },
      );
      for (const key of canonical) if (key !== undefined) found.add(key);
    }
    return keys.filter((key) => found.has(key));
  }
  async save(
    userId: string,
    location: MatchLocation,
    selectedKey?: string,
  ): Promise<FavoriteLocation> {
    const canonicalKey = locationFavoriteKey(location);
    const key = selectedKey ?? canonicalKey;
    const _id = `${userId}:${createHash("sha256").update(key).digest("hex")}`;
    await this.col.updateOne(
      { _id, userId },
      { $set: { key, location, userId, canonicalKey } },
      { upsert: true, session: this.session },
    );
    return { key, location };
  }
  async remove(userId: string, key: string) {
    const removed = await this.col.findOneAndDelete(
      { userId, key },
      { session: this.session, projection: { canonicalKey: 1 } },
    );
    if (!removed?.canonicalKey || removed.canonicalKey === key)
      await this.col.deleteMany({ userId, canonicalKey: key }, { session: this.session });
  }
}
