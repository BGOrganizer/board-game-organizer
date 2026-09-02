import type { BoardGame } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * Repository over the `boardGames` collection (imported from the BGG
 * `bg_ranks` CSV dump). Stores id, name, yearPublished and thumbnail only —
 * enough for the wizard picker.
 */
export class BoardGamesRepository {
  constructor(private db: Db) {}

  private get col() {
    return this.db.collection<BoardGame>(COLLECTIONS.BOARD_GAMES);
  }

  /** Bulk upsert by BGG id (idempotent — re-importing a dump just refreshes). */
  async bulkUpsert(
    games: Array<{
      id: number;
      name: string;
      yearPublished?: number | null;
      thumbnail?: string | null;
    }>,
  ): Promise<number> {
    if (games.length === 0) return 0;
    const ops = games.map((g) => ({
      updateOne: {
        filter: { id: g.id },
        update: {
          $set: {
            name: g.name,
            ...(g.yearPublished != null ? { yearPublished: g.yearPublished } : {}),
            ...(g.thumbnail ? { thumbnail: g.thumbnail } : {}),
            updatedAt: new Date().toISOString(),
          },
        },
        upsert: true,
      },
    }));
    const res = await this.col.bulkWrite(ops, { ordered: false });
    return res.upsertedCount + res.modifiedCount;
  }

  async count(): Promise<number> {
    // estimatedDocumentCount: countDocuments() on Atlas serverless can
    // under-report on large collections (observed 156k vs 180k actual).
    // The import total is informational only.
    return this.col.estimatedDocumentCount();
  }
}
