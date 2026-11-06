import { createHash } from "node:crypto";
import type {
  BggCollectionGame,
  BggPickerItem,
  BggPickerResponse,
} from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { recordServices } from "@/app/lib/community/record-services";
import { CommunityError } from "@/app/lib/community.error";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb, withTransaction } from "@/app/lib/db";
import { searchGames } from "@/app/lib/games/bgg";
import { BggAccountRepository } from "@/app/lib/games/bgg-account.repository";

export const OPTIONS = corsOptions;

const querySchema = z
  .object({
    query: z.string().trim().max(120).default(""),
    search: z.enum(["0", "1"]).default("1"),
    collection: z.enum(["0", "1"]).default("1"),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    cursor: z.string().max(512).optional(),
    proposalEventId: z.uuid().optional(),
    proposalTableId: z.uuid().optional(),
    "x-vercel-protection-bypass": z.string().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.proposalEventId) === Boolean(value.proposalTableId));
const cursorSchema = z.object({
  collectionOffset: z.number().int().nonnegative().max(1_000_000),
  searchOffset: z.number().int().nonnegative().max(1_000_000),
  snapshot: z.string().nullable(),
  scope: z.string().optional(),
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
  let excluded: number[] = [];
  if (parsed.data.proposalEventId && parsed.data.proposalTableId) {
    try {
      excluded = await withTransaction((session, database) =>
        recordServices(database, session).events.proposalPickerExclusions(
          userId,
          parsed.data.proposalEventId as string,
          parsed.data.proposalTableId as string,
        ),
      );
    } catch (error) {
      return corsJson(
        { error: error instanceof CommunityError ? error.code : "Internal server error" },
        { status: error instanceof CommunityError ? error.status : 500 },
        request,
      );
    }
  }
  const scope = createHash("sha256")
    .update(
      JSON.stringify([
        userId,
        query,
        parsed.data.search,
        parsed.data.collection,
        parsed.data.proposalEventId,
        parsed.data.proposalTableId,
        excluded.sort((a, b) => a - b),
      ]),
    )
    .digest("hex");
  const account = await new BggAccountRepository(db).get(userId);
  const snapshot = account.active?.snapshot ?? null;
  const includeCollection = parsed.data.collection === "1" && Boolean(snapshot);
  const includeSearch = parsed.data.search === "1" && query.length >= 4;
  const cursor = parsed.data.cursor ? decode(parsed.data.cursor) : null;
  if (
    parsed.data.cursor &&
    (!cursor ||
      cursor.snapshot !== snapshot ||
      (cursor.scope !== undefined ? cursor.scope !== scope : Boolean(parsed.data.proposalEventId)))
  )
    return corsJson({ error: "Stale cursor" }, { status: 409 }, request);
  if (!includeSearch && !includeCollection)
    return corsJson({ items: [], nextCursor: null }, request);

  const prefix = new RegExp(`^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  const collectionBudget = includeCollection
    ? includeSearch
      ? Math.max(1, Math.floor(limit / 2))
      : limit
    : 0;
  let collectionOffset = cursor?.collectionOffset ?? 0;
  let searchOffset = cursor?.searchOffset ?? 0;
  let moreCollection = false;
  let moreSearch = false;
  const items: BggPickerItem[] = [];

  if (includeCollection && snapshot) {
    const rows = await db
      .collection<BggCollectionGame>(COLLECTIONS.BGG_COLLECTION_GAMES)
      .find({
        userId,
        snapshot,
        isExpansion: { $ne: true },
        subtype: { $ne: "boardgameexpansion" },
        ...(query ? { name: prefix } : {}),
        ...(excluded.length ? { gameId: { $nin: excluded } } : {}),
      })
      .sort({ name: 1, gameId: 1 })
      .skip(collectionOffset)
      .limit(collectionBudget + 1)
      .toArray();
    moreCollection = rows.length > collectionBudget;
    const visible = rows.slice(0, collectionBudget);
    collectionOffset += visible.length;
    const catalog = visible.length
      ? await db
          .collection<{
            id: number;
            average?: number;
            rank?: number;
            bayesAverage?: number;
            minPlayMinutes?: number | null;
            maxPlayMinutes?: number | null;
          }>(COLLECTIONS.BOARD_GAMES)
          .find({ id: { $in: visible.map((row) => row.gameId) } })
          .toArray()
      : [];
    const stats = new Map(catalog.map((game) => [game.id, game]));
    items.push(
      ...visible.map((row) => ({
        id: row.gameId,
        name: row.name,
        year: row.year,
        imageUrl: row.imageUrl,
        average: stats.get(row.gameId)?.average ?? null,
        rank: stats.get(row.gameId)?.rank ?? null,
        bayesAverage: stats.get(row.gameId)?.bayesAverage ?? null,
        minPlayMinutes: stats.get(row.gameId)?.minPlayMinutes ?? null,
        maxPlayMinutes: stats.get(row.gameId)?.maxPlayMinutes ?? null,
        source: "collection" as const,
      })),
    );
  }

  if (includeSearch) {
    const remaining = limit - items.length;
    const batchSize = Math.max(remaining + 1, 25);
    while (true) {
      const batch = await searchGames(db, query, searchOffset, batchSize, excluded);
      if (!batch.length) break;
      const matchingCollectionIds =
        includeCollection && snapshot
          ? new Set(
              (
                await db
                  .collection<BggCollectionGame>(COLLECTIONS.BGG_COLLECTION_GAMES)
                  .find({
                    userId,
                    snapshot,
                    gameId: { $in: batch.map((game) => game.id) },
                    isExpansion: { $ne: true },
                    subtype: { $ne: "boardgameexpansion" },
                    name: prefix,
                  })
                  .project<{ gameId: number }>({ gameId: 1 })
                  .toArray()
              ).map((game) => game.gameId),
            )
          : new Set<number>();
      for (const game of batch) {
        if (matchingCollectionIds.has(game.id)) {
          searchOffset++;
          continue;
        }
        if (items.length === limit) {
          moreSearch = true;
          break;
        }
        items.push({ ...game, source: "search" });
        searchOffset++;
      }
      if (moreSearch || batch.length < batchSize) break;
    }
  }

  return corsJson(
    {
      items,
      nextCursor:
        moreCollection || moreSearch
          ? encode({ collectionOffset, searchOffset, snapshot, scope })
          : null,
    } satisfies BggPickerResponse,
    request,
  );
}
