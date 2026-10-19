import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { DOMParser } from "@xmldom/xmldom";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

type GameRow = {
  id: number;
  name: string;
  yearPublished?: number | null;
  bayesAverage?: number | null;
  average?: number | null;
  rank?: number | null;
  image?: string | null;
  imageCheckedAt?: string;
  minPlayMinutes?: number | null;
  maxPlayMinutes?: number | null;
  durationCheckedAt?: string;
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
export async function hydrateGames(db: Db, games: GameRow[], durations = false): Promise<void> {
  const token = process.env.BGG_TOKEN;
  const missing = games.filter(
    (game) =>
      (!cover(game.image) &&
        (!game.imageCheckedAt || Date.now() - Date.parse(game.imageCheckedAt) > 7 * 86400_000)) ||
      (durations &&
        (!game.durationCheckedAt ||
          Date.now() - Date.parse(game.durationCheckedAt) > 7 * 86400_000)),
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
    const found = new Map<
      number,
      { image: string | null; min: number | null; max: number | null }
    >();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const id = Number(item.getAttribute("id"));
      if (!missing.some((game) => game.id === id)) continue;
      const image = bggImage(item.getElementsByTagName("image").item(0)?.textContent);
      const thumbnail = bggImage(item.getElementsByTagName("thumbnail").item(0)?.textContent);
      const minutes = (name: string) => {
        const value = Number(item.getElementsByTagName(name).item(0)?.getAttribute("value"));
        return Number.isSafeInteger(value) && value > 0 ? value : null;
      };
      const playing = minutes("playingtime");
      const min = minutes("minplaytime") ?? playing;
      const max = minutes("maxplaytime") ?? playing;
      const valid = min === null || max === null || min <= max;
      found.set(id, {
        image: image ?? thumbnail,
        min: valid ? min : null,
        max: valid ? max : null,
      });
    }
    const checkedAt = new Date().toISOString();
    await db.collection<GameRow>(COLLECTIONS.BOARD_GAMES).bulkWrite(
      missing.map((game) => ({
        updateOne: {
          filter: { id: game.id },
          update: {
            $set: {
              image: found.get(game.id)?.image ?? cover(game.image),
              imageCheckedAt: checkedAt,
              minPlayMinutes: found.get(game.id)?.min ?? game.minPlayMinutes ?? null,
              maxPlayMinutes: found.get(game.id)?.max ?? game.maxPlayMinutes ?? null,
              durationCheckedAt: checkedAt,
            },
          },
        },
      })),
    );
    for (const game of missing)
      Object.assign(game, {
        image: found.get(game.id)?.image ?? cover(game.image),
        imageCheckedAt: checkedAt,
        minPlayMinutes: found.get(game.id)?.min ?? game.minPlayMinutes ?? null,
        maxPlayMinutes: found.get(game.id)?.max ?? game.maxPlayMinutes ?? null,
        durationCheckedAt: checkedAt,
      });
  } catch (error) {
    // Cover delivery is optional: BGG outages must not break local catalog search.
    console.warn("BGG cover lookup failed", error instanceof Error ? error.name : "unknown error");
  }
}

/** Search and game details always read the local catalog, with best-effort cover enrichment. */
export async function searchGames(
  db: Db,
  query: string,
  skip = 0,
  limit = 25,
): Promise<BggSearchItem[]> {
  const rows = await db
    .collection<GameRow>(COLLECTIONS.BOARD_GAMES)
    .find(
      {
        name: { $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" },
        isExpansion: false,
      },
      {
        projection: {
          _id: 0,
          id: 1,
          name: 1,
          yearPublished: 1,
          bayesAverage: 1,
          average: 1,
          rank: 1,
          image: 1,
          imageCheckedAt: 1,
          minPlayMinutes: 1,
          maxPlayMinutes: 1,
          durationCheckedAt: 1,
        },
      },
    )
    .sort({ name: 1, id: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  await hydrateGames(db, rows);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    year: row.yearPublished ?? null,
    bayesAverage: row.bayesAverage ?? null,
    average: row.average ?? null,
    rank: row.rank ?? null,
    imageUrl: cover(row.image),
    ...(row.minPlayMinutes ? { minPlayMinutes: row.minPlayMinutes } : {}),
    ...(row.maxPlayMinutes ? { maxPlayMinutes: row.maxPlayMinutes } : {}),
  }));
}

export async function gameDetails(db: Db, id: number): Promise<BggThingResponse> {
  const row = await db.collection<GameRow>(COLLECTIONS.BOARD_GAMES).findOne({ id });
  if (!row) throw new Error(`Game ${id} not found`);
  await hydrateGames(db, [row], true);
  return {
    id: row.id,
    name: row.name,
    imageUrl: cover(row.image),
    year: row.yearPublished ?? null,
    bayesAverage: row.bayesAverage ?? null,
    average: row.average ?? null,
    rank: row.rank ?? null,
    ...(row.minPlayMinutes ? { minPlayMinutes: row.minPlayMinutes } : {}),
    ...(row.maxPlayMinutes ? { maxPlayMinutes: row.maxPlayMinutes } : {}),
  };
}

export function gameThumbnail(url: string | null): string | null {
  return cover(url);
}
