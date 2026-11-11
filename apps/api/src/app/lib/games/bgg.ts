import type { BggSearchItem, BggThingResponse } from "@board-game-organizer/schemas";
import { DOMParser } from "@xmldom/xmldom";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@/app/lib/db";

type GameRow = {
  id: number;
  name: string;
  yearPublished?: number | null;
  isExpansion?: boolean;
  bayesAverage?: number | null;
  average?: number | null;
  rank?: number | null;
  image?: string | null;
  imageCheckedAt?: string;
  minPlayers?: number | null;
  maxPlayers?: number | null;
  playerCountsCheckedAt?: string;
  minPlayMinutes?: number | null;
  maxPlayMinutes?: number | null;
  durationCheckedAt?: string;
  averageWeight?: number | null;
  weightCheckedAt?: string;
  metadataAttemptedAt?: string;
};

const METADATA_RETENTION_MS = 7 * 86400_000;
const METADATA_RETRY_MS = 5 * 60_000;
const positiveInteger = (value: number | null | undefined) =>
  Number.isSafeInteger(value) && Number(value) > 0;

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
  const now = Date.now();
  const stale = (value: string | undefined, age: number) =>
    !value || !Number.isFinite(Date.parse(value)) || now - Date.parse(value) >= age;
  const missing = games.filter(
    (game) =>
      (!cover(game.image) && stale(game.imageCheckedAt, METADATA_RETENTION_MS)) ||
      (durations &&
        stale(game.metadataAttemptedAt, METADATA_RETRY_MS) &&
        (!(Number(game.averageWeight) >= 1 && Number(game.averageWeight) <= 5) ||
          stale(game.weightCheckedAt, METADATA_RETENTION_MS) ||
          !positiveInteger(game.minPlayMinutes) ||
          !positiveInteger(game.maxPlayMinutes) ||
          stale(game.durationCheckedAt, METADATA_RETENTION_MS) ||
          !positiveInteger(game.minPlayers) ||
          !positiveInteger(game.maxPlayers) ||
          stale(game.playerCountsCheckedAt, METADATA_RETENTION_MS))),
  );
  if (!token || missing.length === 0) return;

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
      `https://boardgamegeek.com/xmlapi2/thing?id=${missing.map((game) => game.id).join(",")}&stats=1`,
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
      {
        averageWeight: number | null;
        image: string | null;
        min: number | null;
        max: number | null;
        minPlayers: number | null;
        maxPlayers: number | null;
      }
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
      const minPlayers = minutes("minplayers"),
        maxPlayers = minutes("maxplayers");
      const validPlayers = minPlayers !== null && maxPlayers !== null && minPlayers <= maxPlayers;
      const weight = Number(
        item.getElementsByTagName("averageweight").item(0)?.getAttribute("value"),
      );
      found.set(id, {
        averageWeight: Number.isFinite(weight) && weight >= 1 && weight <= 5 ? weight : null,
        image: image ?? thumbnail,
        min: valid ? min : null,
        max: valid ? max : null,
        minPlayers: validPlayers ? minPlayers : null,
        maxPlayers: validPlayers ? maxPlayers : null,
      });
    }
    const checkedAt = new Date().toISOString();
    const updates = missing.map((game) => {
      const metadata = found.get(game.id);
      const min = metadata?.min ?? game.minPlayMinutes ?? null;
      const max = metadata?.max ?? game.maxPlayMinutes ?? null;
      const validDuration = min === null || max === null || min <= max;
      return {
        ...(metadata?.averageWeight != null
          ? { averageWeight: metadata.averageWeight, weightCheckedAt: checkedAt }
          : {}),
        image: metadata?.image ?? cover(game.image),
        imageCheckedAt: checkedAt,
        metadataAttemptedAt: checkedAt,
        ...(metadata?.minPlayers != null && metadata.maxPlayers != null
          ? {
              minPlayers: metadata.minPlayers,
              maxPlayers: metadata.maxPlayers,
              playerCountsCheckedAt: checkedAt,
            }
          : {}),
        // Omitted values must not overwrite metadata another request recovered meanwhile.
        ...(validDuration && metadata?.min != null ? { minPlayMinutes: metadata.min } : {}),
        ...(validDuration && metadata?.max != null ? { maxPlayMinutes: metadata.max } : {}),
        ...(metadata?.min != null && metadata.max != null ? { durationCheckedAt: checkedAt } : {}),
      };
    });
    await db.collection<GameRow>(COLLECTIONS.BOARD_GAMES).bulkWrite(
      missing.map((game, index) => ({
        updateOne: {
          filter: { id: game.id },
          update: {
            $set: updates[index],
            $setOnInsert: {
              id: game.id,
              name: game.name,
              ...(game.yearPublished != null ? { yearPublished: game.yearPublished } : {}),
              ...(game.isExpansion !== undefined ? { isExpansion: game.isExpansion } : {}),
            },
          },
          upsert: true,
        },
      })),
    );
    for (const [index, game] of missing.entries()) Object.assign(game, updates[index]);
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
  excludeIds: readonly number[] = [],
): Promise<BggSearchItem[]> {
  const rows = await db
    .collection<GameRow>(COLLECTIONS.BOARD_GAMES)
    .find(
      {
        name: { $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, $options: "i" },
        isExpansion: false,
        ...(excludeIds.length ? { id: { $nin: excludeIds } } : {}),
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
          minPlayers: 1,
          maxPlayers: 1,
          playerCountsCheckedAt: 1,
          minPlayMinutes: 1,
          maxPlayMinutes: 1,
          durationCheckedAt: 1,
          averageWeight: 1,
          weightCheckedAt: 1,
          metadataAttemptedAt: 1,
        },
      },
    )
    .sort({ name: 1, id: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  await hydrateGames(db, rows, true);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    year: row.yearPublished ?? null,
    bayesAverage: row.bayesAverage ?? null,
    average: row.average ?? null,
    rank: row.rank ?? null,
    imageUrl: cover(row.image),
    ...(row.averageWeight != null ? { averageWeight: row.averageWeight } : {}),
    ...(row.minPlayers ? { minPlayers: row.minPlayers } : {}),
    ...(row.maxPlayers ? { maxPlayers: row.maxPlayers } : {}),
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
    ...(row.averageWeight != null ? { averageWeight: row.averageWeight } : {}),
    ...(row.minPlayers ? { minPlayers: row.minPlayers } : {}),
    ...(row.maxPlayers ? { maxPlayers: row.maxPlayers } : {}),
    ...(row.minPlayMinutes ? { minPlayMinutes: row.minPlayMinutes } : {}),
    ...(row.maxPlayMinutes ? { maxPlayMinutes: row.maxPlayMinutes } : {}),
  };
}

export function gameThumbnail(url: string | null): string | null {
  return cover(url);
}
