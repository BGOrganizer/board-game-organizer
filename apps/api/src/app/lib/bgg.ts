import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { DOMParser } from "@xmldom/xmldom";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

type GameRow = {
  id: number;
  name: string;
  yearPublished?: number | null;
  thumbnail?: string | null;
  image?: string | null;
  imageCheckedAt?: string;
};

// Older imports guessed this URL from the game ID; it is not a BGG cover.
const inventedCover = /^https:\/\/cf\.geekdo-static\.com\/covers\/\d+\.jpg$/;
const cover = (url?: string | null) => (url && !inventedCover.test(url) ? url : null);

function bggImage(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" && parsed.hostname === "cf.geekdo-images.com"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** One XML request per five seconds across API instances; never block a search waiting for quota. */
// ponytail: cold searches can show placeholders; prewarm popular games if that becomes common.
export async function hydrateGames(db: Db, games: GameRow[]): Promise<void> {
  const token = process.env.BGG_TOKEN;
  const missing = games.filter(
    (game) =>
      !cover(game.thumbnail) &&
      !cover(game.image) &&
      (!game.imageCheckedAt || Date.now() - Date.parse(game.imageCheckedAt) > 7 * 86400_000),
  );
  if (!token || missing.length === 0) return;

  const now = Date.now();
  const quota = db.collection<{ _id: string; nextAt: Date }>(COLLECTIONS.BGG_QUOTA);
  try {
    const claim = await quota.updateOne(
      { _id: "covers", nextAt: { $lte: new Date(now) } },
      { $set: { nextAt: new Date(now + 5000) } },
      { upsert: true },
    );
    if (!claim.matchedCount && !claim.upsertedCount) return;
  } catch (error) {
    // Concurrent claims (or an unexpired lease) collide on the singleton _id.
    if ((error as { code?: number }).code === 11000) return;
    console.warn(
      "BGG cover quota unavailable",
      error instanceof Error ? error.name : "unknown error",
    );
    return;
  }

  try {
    const response = await fetch(
      `https://boardgamegeek.com/xmlapi2/thing?id=${missing.map((game) => game.id).join(",")}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(7000),
      },
    );
    if (response.status === 202 || response.status === 429) {
      await quota.updateOne({ _id: "covers" }, { $set: { nextAt: new Date(Date.now() + 60_000) } });
      return;
    }
    if (!response.ok) {
      console.warn("BGG cover lookup returned HTTP", response.status);
      return;
    }

    const document = new DOMParser().parseFromString(await response.text(), "text/xml");
    if (document.documentElement?.tagName !== "items") return;
    const items = document.getElementsByTagName("item");
    const found = new Map<number, { thumbnail: string | null; image: string | null }>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = Number(item.getAttribute("id"));
      if (!missing.some((game) => game.id === id)) continue;
      const image = bggImage(item.getElementsByTagName("image").item(0)?.textContent);
      found.set(id, {
        thumbnail: bggImage(item.getElementsByTagName("thumbnail").item(0)?.textContent) ?? image,
        image,
      });
    }
    const checkedAt = new Date().toISOString();
    await db.collection<GameRow>(COLLECTIONS.BOARD_GAMES).bulkWrite(
      missing.map((game) => ({
        updateOne: {
          filter: { id: game.id },
          update: {
            $set: {
              ...(found.get(game.id) ?? { thumbnail: null, image: null }),
              imageCheckedAt: checkedAt,
            },
          },
        },
      })),
    );
    for (const game of missing)
      Object.assign(game, found.get(game.id) ?? { thumbnail: null, image: null }, {
        imageCheckedAt: checkedAt,
      });
  } catch (error) {
    // Cover delivery is optional: BGG outages must not break local catalog search.
    console.warn("BGG cover lookup failed", error instanceof Error ? error.name : "unknown error");
  }
}

/** Search and game details always read the local catalog, with best-effort cover enrichment. */
export async function searchGames(db: Db, query: string): Promise<BggSearchItem[]> {
  const rows = await db
    .collection<GameRow>(COLLECTIONS.BOARD_GAMES)
    .find(
      { name: { $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" } },
      {
        projection: {
          _id: 0,
          id: 1,
          name: 1,
          yearPublished: 1,
          thumbnail: 1,
          image: 1,
          imageCheckedAt: 1,
        },
      },
    )
    .limit(25)
    .toArray();
  await hydrateGames(db, rows);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    year: row.yearPublished ?? null,
    imageUrl: cover(row.thumbnail) ?? cover(row.image),
  }));
}

export async function gameDetails(db: Db, id: number): Promise<BggThingResponse> {
  const row = await db.collection<GameRow>(COLLECTIONS.BOARD_GAMES).findOne({ id });
  if (!row) throw new Error(`Game ${id} not found`);
  await hydrateGames(db, [row]);
  return {
    id: row.id,
    name: row.name,
    imageUrl: cover(row.image) ?? cover(row.thumbnail),
    year: row.yearPublished ?? null,
  };
}

export function gameThumbnail(url: string | null): string | null {
  return cover(url);
}
