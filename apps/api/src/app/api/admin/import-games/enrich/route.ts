import type { BoardGame } from "@board-game-organizer/schemas";
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { COLLECTIONS, getDb } from "@/app/lib/db";
import { hydrateGames } from "@/app/lib/games/bgg";
export const OPTIONS = corsOptions;
const payload = z.object({ offset: z.number().int().min(0).max(199) }).strict();
export async function POST(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const body = payload.safeParse(await request.json().catch(() => null));
  if (!body.success) return corsJson({ error: "Invalid payload" }, { status: 400 }, request);
  const db = await getDb();
  if (db.databaseName.startsWith("bgo_ci_"))
    return corsJson({ error: "CI_TARGET_FORBIDDEN" }, { status: 409 }, request);
  const top = await db
    .collection<BoardGame>(COLLECTIONS.BOARD_GAMES)
    .find({ isExpansion: false, rank: { $gt: 0 }, $expr: { $eq: [{ $mod: ["$rank", 1] }, 0] } })
    .sort({ rank: 1, id: 1 })
    .limit(200)
    .toArray();
  const rows = top.slice(body.data.offset, body.data.offset + 20);
  const fresh = (row: BoardGame) =>
    Boolean(
      row.image &&
        row.minPlayers &&
        row.maxPlayers &&
        row.minPlayMinutes &&
        row.maxPlayMinutes &&
        row.averageWeight &&
        row.suggestedPlayers &&
        [
          row.playerCountsCheckedAt,
          row.durationCheckedAt,
          row.weightCheckedAt,
          row.suggestedPlayers.fetchedAt,
        ].every((date) => date && Date.now() - Date.parse(date) < 7 * 86400000),
    );
  const skipped = rows.filter(fresh).length;
  await hydrateGames(db, rows, true);
  const complete = rows.filter(fresh).length;
  const quota = await db
    .collection<{ _id: string; nextAt: Date }>(COLLECTIONS.BGG_QUOTA)
    .findOne({ _id: "covers" });
  const retryAfterMs = Math.max(5000, (quota?.nextAt?.getTime() ?? Date.now()) - Date.now());
  return corsJson(
    {
      total: top.length,
      offset: body.data.offset,
      count: rows.length,
      skipped,
      recovered: complete - skipped,
      incomplete: rows.length - complete,
      retryAfterMs,
      nextOffset:
        body.data.offset + rows.length < top.length ? body.data.offset + rows.length : null,
    },
    request,
  );
}
