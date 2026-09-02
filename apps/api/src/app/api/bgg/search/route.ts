import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { searchGames } from "@/app/lib/bgg";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";

const searchSchema = z.object({
  query: z.string().trim().min(4),
});

/**
 * GET /api/bgg/search?query=… — board game search (id + name) from the
 * local `boardGames` collection (imported from the BGG bg_ranks dump).
 *
 * NOTE: this must live in its own route file (api/bgg/search) — Next.js App
 * Router maps route.ts to its exact path; a parent route.ts never receives
 * subpaths.
 */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return corsJson({ error: "Query must be at least 4 characters" }, { status: 400 }, request);
  }

  const db = await getDb();
  const items = await searchGames(db, parsed.data.query);
  return corsJson({ items }, request);
}
