import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { gameDetails, gameDetailsBatch } from "@/app/lib/games/bgg";

const batchSchema = z
  .array(
    z
      .string()
      .regex(/^[1-9][0-9]{0,15}$/)
      .pipe(z.coerce.number<string>().int()),
  )
  .min(1)
  .max(20);

const thingSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * GET /api/bgg/thing?id=… — a single game, or ?ids=… for visible-list metadata.
 */
export function OPTIONS(request: Request) {
  return corsOptions(request);
}

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);

  const url = new URL(request.url);
  const batch = url.searchParams.get("ids");
  if (batch !== null) {
    const ids = batchSchema.safeParse(batch.slice(0, 340).split(","));
    if (batch.length > 340 || url.searchParams.has("id") || !ids.success) {
      return corsJson({ error: "Invalid game ids" }, { status: 400 }, request);
    }
    const items = await gameDetailsBatch(await getDb(), [...new Set(ids.data)]);
    return corsJson({ items }, {}, request);
  }
  const parsed = thingSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return corsJson({ error: "Invalid game id" }, { status: 400 }, request);
  }

  const db = await getDb();
  try {
    const details = await gameDetails(db, parsed.data.id);
    return corsJson(details, {}, request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Game not found";
    return corsJson({ error: message }, { status: 404 }, request);
  }
}
