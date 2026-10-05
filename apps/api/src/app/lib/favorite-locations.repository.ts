import { createHash } from "node:crypto";
import {
  type FavoriteLocation,
  locationFavoriteKey,
  type MatchLocation,
} from "@board-game-organizer/schemas";
import type { ClientSession, Collection, Db } from "mongodb";
import { COLLECTIONS } from "./db";

type FavoriteDocument = FavoriteLocation & { _id: string; userId: string };
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
    return rows.map((row) => row.key);
  }
  async save(userId: string, location: MatchLocation): Promise<FavoriteLocation> {
    const key = locationFavoriteKey(location);
    const _id = `${userId}:${createHash("sha256").update(key).digest("hex")}`;
    await this.col.updateOne(
      { _id, userId },
      { $set: { key, location, userId } },
      { upsert: true, session: this.session },
    );
    return { key, location };
  }
  async remove(userId: string, key: string) {
    await this.col.deleteOne({ userId, key }, { session: this.session });
  }
}
