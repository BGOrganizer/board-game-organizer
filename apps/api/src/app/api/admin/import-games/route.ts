import { boardGameCsvModel } from "@board-game-organizer/schemas";
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { BoardGamesRepository } from "@/app/lib/games/boardGames.repository";

/**
 * POST /api/admin/import-games
 *
 * Service-to-service import of all BGG rankings CSV columns in chunks.
 * Auth: same pattern as
 * sync-user — `Authorization: Bearer <CLERK_SECRET_KEY>`.
 */
const importGamesSchema = z.object({ games: z.array(boardGameCsvModel).min(1).max(500) });

export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }
  const db = await getDb();
  return corsJson({ schemaVersion: 2, databaseName: db.databaseName }, request);
}

export async function PATCH(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }
  const db = await getDb();
  const removed = await new BoardGamesRepository(db).removeLegacyThumbnails();
  return corsJson({ ok: true, removed }, request);
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_SECRET_KEY;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }

  const body = await request.json().catch(() => null);
  const parsed = importGamesSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return corsJson({ error: "Invalid payload" }, { status: 400 }, request);
  }

  const db = await getDb();
  const written = await new BoardGamesRepository(db).bulkUpsert(parsed.data.games);
  const total = await new BoardGamesRepository(db).count();

  return corsJson({ ok: true, written, total }, request);
}
