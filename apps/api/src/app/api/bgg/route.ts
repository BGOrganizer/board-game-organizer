import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { gameDetails, searchGames } from "@/app/lib/bgg";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";

const searchSchema = z.object({
  query: z.string().trim().min(4),
});

const thingSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * GET /api/bgg/search?query=… — board game search (id + name) from the
 * local `boardGames` collection (imported from the BGG bg_ranks dump).
 * GET /api/bgg/thing?id=… — game details (image + year) on selection.
 *
 * Both require auth (the wizard is behind the signed-in tab).
 */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const url = new URL(request.url);
  const db = await getDb();

  if (url.pathname.endsWith("/search")) {
    const parsed = searchSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return corsJson({ error: "Query must be at least 4 characters" }, { status: 400 }, request);
    }
    const items = await searchGames(db, parsed.data.query);
    return corsJson({ items }, request);
  }

  if (url.pathname.endsWith("/thing")) {
    const parsed = thingSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return corsJson({ error: "Invalid game id" }, { status: 400 }, request);
    }
    try {
      const details = await gameDetails(db, parsed.data.id);
      return corsJson(details, request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Game not found";
      return corsJson({ error: message }, { status: 404 }, request);
    }
  }

  return corsJson({ error: "Not found" }, { status: 404 }, request);
}
