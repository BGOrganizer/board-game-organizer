import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { gameDetails, searchGames } from "@/app/lib/bgg";

const searchSchema = z.object({
  query: z.string().trim().min(4),
});

const thingSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * GET /api/bgg/search?query=… — BGG game search (id + name only, fast).
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
  if (url.pathname.endsWith("/search")) {
    const parsed = searchSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return corsJson({ error: "Query must be at least 4 characters" }, { status: 400 }, request);
    }
    try {
      const items = await searchGames(parsed.data.query);
      return corsJson({ items }, request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "BGG search failed";
      const status = message.includes("BGG_API_KEY") ? 503 : 502;
      return corsJson({ error: message }, { status }, request);
    }
  }

  if (url.pathname.endsWith("/thing")) {
    const parsed = thingSchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) {
      return corsJson({ error: "Invalid game id" }, { status: 400 }, request);
    }
    try {
      const details = await gameDetails(parsed.data.id);
      return corsJson(details, request);
    } catch (err) {
      const message = err instanceof Error ? err.message : "BGG thing failed";
      return corsJson({ error: message }, { status: 502 }, request);
    }
  }

  return corsJson({ error: "Not found" }, { status: 404 }, request);
}
