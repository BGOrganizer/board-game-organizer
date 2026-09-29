import type {
  BggCollectionGame,
  BggPickerItem,
  BggPickerResponse,
} from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { searchGames } from "@/app/lib/bgg";
import { BggAccountRepository } from "@/app/lib/bgg-account.repository";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";

export const OPTIONS = corsOptions;

const querySchema = z
  .object({
    query: z.string().trim().max(120).default(""),
    search: z.enum(["0", "1"]).default("1"),
    collection: z.enum(["0", "1"]).default("1"),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().max(256).optional(),
    "x-vercel-protection-bypass": z.string().optional(),
  })
  .strict();
const cursorSchema = z.object({
  source: z.enum(["collection", "search"]),
  offset: z.number().int().nonnegative().max(1_000_000),
  snapshot: z.string().nullable(),
});

type Cursor = z.infer<typeof cursorSchema>;
const encode = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString("base64url");
function decode(value: string): Cursor | null {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return corsJson({ error: "Invalid search" }, { status: 400 }, request);
  const { query, limit } = parsed.data;
  const db = await getDb();
  const account = await new BggAccountRepository(db).get(userId);
  const snapshot = account.active?.snapshot ?? null;
  const includeCollection = parsed.data.collection === "1" && Boolean(snapshot);
  const includeSearch = parsed.data.search === "1" && query.length >= 4;
  const cursor = parsed.data.cursor ? decode(parsed.data.cursor) : null;
  if (parsed.data.cursor && (!cursor || cursor.snapshot !== snapshot))
    return corsJson({ error: "Stale cursor" }, { status: 409 }, request);
  if (!includeSearch && !includeCollection)
    return corsJson({ items: [], nextCursor: null }, request);
  const source = cursor?.source ?? (includeCollection ? "collection" : "search");
  const offset = cursor?.offset ?? 0;
  const prefix = new RegExp(`^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");

  if (source === "collection" && includeCollection && snapshot) {
    const rows = await db
      .collection<BggCollectionGame>(COLLECTIONS.BGG_COLLECTION_GAMES)
      .find({ userId, snapshot, ...(query ? { name: prefix } : {}) })
      .sort({ name: 1, gameId: 1 })
      .skip(offset)
      .limit(limit + 1)
      .toArray();
    const visible = rows.slice(0, limit);
    const catalog = await db
      .collection<{ id: number; average?: number; rank?: number; bayesAverage?: number }>(
        COLLECTIONS.BOARD_GAMES,
      )
      .find({ id: { $in: visible.map((row) => row.gameId) } })
      .toArray();
    const stats = new Map(catalog.map((game) => [game.id, game]));
    const items: BggPickerItem[] = visible.map((row) => ({
      id: row.gameId,
      name: row.name,
      year: row.year,
      imageUrl: row.imageUrl,
      average: stats.get(row.gameId)?.average ?? null,
      rank: stats.get(row.gameId)?.rank ?? null,
      bayesAverage: stats.get(row.gameId)?.bayesAverage ?? null,
      source: "collection",
    }));
    return corsJson(
      {
        items,
        nextCursor:
          rows.length > limit
            ? encode({ source: "collection", offset: offset + limit, snapshot })
            : includeSearch
              ? encode({ source: "search", offset: 0, snapshot })
              : null,
      } satisfies BggPickerResponse,
      request,
    );
  }

  if (source === "collection" && !includeCollection)
    return corsJson({ error: "Stale cursor" }, { status: 409 }, request);
  if (!includeSearch) return corsJson({ items: [], nextCursor: null }, request);
  const items: BggPickerItem[] = [];
  let nextOffset = offset;
  let exhausted = false;
  while (items.length <= limit) {
    const batch = await searchGames(db, query, nextOffset, limit + 1);
    if (!batch.length) {
      exhausted = true;
      break;
    }
    const matchingCollectionIds = includeCollection
      ? new Set(
          (
            await db
              .collection<BggCollectionGame>(COLLECTIONS.BGG_COLLECTION_GAMES)
              .find({
                userId,
                snapshot: snapshot as string,
                gameId: { $in: batch.map((game) => game.id) },
                name: prefix,
              })
              .project<{ gameId: number }>({ gameId: 1 })
              .toArray()
          ).map((game) => game.gameId),
        )
      : new Set<number>();
    for (const game of batch) {
      if (items.length > limit) break;
      nextOffset++;
      if (!matchingCollectionIds.has(game.id)) items.push({ ...game, source: "search" });
    }
    if (batch.length < limit + 1) {
      exhausted = true;
      break;
    }
  }
  return corsJson(
    {
      items: items.slice(0, limit),
      nextCursor:
        !exhausted && items.length > limit
          ? encode({ source: "search", offset: nextOffset - 1, snapshot })
          : null,
    } satisfies BggPickerResponse,
    request,
  );
}
