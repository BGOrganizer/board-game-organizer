import { z } from "zod";
import { BoardGamesRepository } from "@/app/lib/boardGames.repository";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";

/**
 * POST /api/admin/import-games
 *
 * Service-to-service import of the BGG bg_ranks CSV dump (id, name, year,
 * thumbnail). Called by the import script in chunks. Auth: same pattern as
 * sync-user — `Authorization: Bearer <CLERK_SECRET_KEY>`.
 */
const importGamesSchema = z.object({
  games: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
      yearPublished: z.number().int().nullable().optional(),
      thumbnail: z.string().nullable().optional(),
    }),
  ),
});

export function OPTIONS(request: Request) {
  return corsOptions(request);
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
