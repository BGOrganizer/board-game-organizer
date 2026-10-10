import type { BoardGame } from "@board-game-organizer/schemas";
import type { ClientSession, Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Repository over the `boardGames` collection (imported from the BGG
 * `bg_ranks` CSV dump). Covers are enriched separately from XML API2.
 */
export class BoardGamesRepository {
  constructor(
    private db: Db,
    private session?: ClientSession,
  ) {}

  private get opts() {
    return this.session ? { session: this.session } : {};
  }

  private get col() {
    return this.db.collection<BoardGame & { thumbnail?: string | null }>(COLLECTIONS.BOARD_GAMES);
  }

  /** Bulk upsert by BGG id (idempotent — re-importing a dump just refreshes). */
  async bulkUpsert(
    games: Array<Pick<BoardGame, "id" | "name"> & Partial<Omit<BoardGame, "id" | "name">>>,
  ): Promise<number> {
    if (games.length === 0) return 0;
    const ops = games.map(({ id, ...catalog }) => ({
      updateOne: {
        filter: { id },
        update: {
          $set: {
            ...catalog,
            updatedAt: new Date().toISOString(),
          },
          $unset: { thumbnail: "" as const },
        },
        upsert: true,
      },
    }));
    const res = await this.col.bulkWrite(ops, { ordered: false, ...this.opts });
    return res.upsertedCount + res.modifiedCount;
  }

  async removeLegacyThumbnails(): Promise<number> {
    const result = await this.col.updateMany(
      { thumbnail: { $exists: true } },
      { $unset: { thumbnail: "" } },
      this.opts,
    );
    return result.modifiedCount;
  }

  async count(): Promise<number> {
    // estimatedDocumentCount: countDocuments() on Atlas serverless can
    // under-report on large collections (observed 156k vs 180k actual).
    // The import total is informational only.
    return this.col.estimatedDocumentCount(this.opts);
  }

  async findExistingIds(ids: number[]): Promise<number[]> {
    const games = await this.col
      .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1 }, ...this.opts })
      .toArray();
    return games.map((game) => game.id);
  }

  findByIds(ids: number[]): Promise<BoardGame[]> {
    return this.col.find({ id: { $in: ids } }, { projection: { _id: 0 }, ...this.opts }).toArray();
  }
}
