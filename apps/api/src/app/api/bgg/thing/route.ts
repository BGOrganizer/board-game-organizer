import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { gameDetails } from "@/app/lib/bgg";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";

const thingSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * GET /api/bgg/thing?id=… — game details (image + year) on selection.
 */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const url = new URL(request.url);
  const parsed = thingSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return corsJson({ error: "Invalid game id" }, { status: 400 }, request);
  }

  const db = await getDb();
  try {
    const details = await gameDetails(db, parsed.data.id);
    return corsJson(details, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Game not found";
    return corsJson({ error: message }, { status: 404 }, request);
  }
}
