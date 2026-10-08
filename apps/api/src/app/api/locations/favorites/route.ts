import {
  locationFavoriteKey,
  removeFavoriteLocationSchema,
  saveFavoriteLocationSchema,
} from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb } from "@/app/lib/db";
import { FavoriteLocationsRepository } from "@/app/lib/locations/favorite-locations.repository";
import { GeocodingError, geocodeAddresses } from "@/app/lib/locations/geocoding";
import {
  badMatchRequest,
  hasValidMatchQuery,
  parseMatchJson,
  runMatchOperation,
} from "@/app/lib/matches/match.http";
import { MatchError } from "@/app/lib/matches/match.service";

const querySchema = z
  .object({
    "x-vercel-protection-bypass": z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    keys: z.string().max(35000).optional(),
  })
  .strict();
const keysSchema = z.array(z.string().min(1).max(650)).max(50);
export function OPTIONS(request: Request) {
  return corsOptions(request);
}
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].some((key) => params.getAll(key).length !== 1))
    return badMatchRequest(request);
  let keys: string[] | undefined;
  if (parsed.data.keys !== undefined) {
    try {
      const result = keysSchema.safeParse(JSON.parse(parsed.data.keys));
      if (!result.success || params.has("cursor") || params.has("limit"))
        return badMatchRequest(request);
      keys = result.data;
    } catch {
      return badMatchRequest(request);
    }
  }
  try {
    const repository = new FavoriteLocationsRepository(await getDb());
    return corsJson(
      keys
        ? { keys: await repository.statuses(userId, keys) }
        : await repository.list(userId, parsed.data.limit, parsed.data.cursor),
      request,
    );
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
export async function POST(request: Request) {
  if (!hasValidMatchQuery(request)) return badMatchRequest(request);
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = saveFavoriteLocationSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request);
  return runMatchOperation(
    request,
    async ({ userId, db, session, service }) => {
      const { location, matchId } = parsed.data;
      const key = locationFavoriteKey(location);
      const match = matchId ? (await service.detail(userId, matchId)).match : undefined;
      const saved = match?.locations?.find((item) => locationFavoriteKey(item) === key);
      if (!saved) {
        try {
          const addresses = await geocodeAddresses(location.address);
          if (!addresses.some((item) => locationFavoriteKey(item) === key))
            throw new MatchError(400, "Choose a verified address");
        } catch (error) {
          if (error instanceof GeocodingError) throw new MatchError(error.status, error.message);
          throw error;
        }
      }
      return { item: await new FavoriteLocationsRepository(db, session).save(userId, location) };
    },
    201,
  );
}
export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  if (!hasValidMatchQuery(request)) return badMatchRequest(request);
  const body = await parseMatchJson(request);
  if ("response" in body) return body.response;
  const parsed = removeFavoriteLocationSchema.safeParse(body.data);
  if (!parsed.success) return badMatchRequest(request);
  try {
    await new FavoriteLocationsRepository(await getDb()).remove(userId, parsed.data.key);
    return corsJson({ success: true }, request);
  } catch {
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
