import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

/**
 * BoardGameGeek game lookup backed by the local `boardGames` collection
 * (imported from the official BGG `bg_ranks` CSV dump — id, name, year,
 * thumbnail only, per product decision).
 *
 * No BGG API key needed at runtime: the CSV is imported once (admin
 * endpoint + import script) and search/thing read from Mongo. This also
 * avoids BGG's 1 req/5s rate limit entirely for search.
 */

export async function searchGames(db: Db, query: string): Promise<BggSearchItem[]> {
  const col = db.collection(COLLECTIONS.BOARD_GAMES);
  const rows = await col
    .find(
      { name: { $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" } },
      { projection: { _id: 0, id: 1, name: 1 } },
    )
    .limit(25)
    .toArray();
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function gameDetails(db: Db, id: number): Promise<BggThingResponse> {
  const col = db.collection(COLLECTIONS.BOARD_GAMES);
  const row = await col.findOne(
    { id },
    { projection: { _id: 0, id: 1, name: 1, yearPublished: 1, thumbnail: 1 } },
  );
  if (!row) {
    throw new Error(`Game ${id} not found`);
  }
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.thumbnail ?? null,
    year: row.yearPublished ?? null,
  };
}
