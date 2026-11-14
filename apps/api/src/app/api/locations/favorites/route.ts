import {
  locationFavoriteKey,
  removeFavoriteLocationSchema,
  saveFavoriteLocationSchema,
} from "@board-game-organizer/schemas";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { runRecordOperation } from "@/app/lib/community/record-http";
import {
  createRequestDiagnostics,
  type RequestDiagnosticTrace,
} from "@/app/lib/community/request-diagnostics";
import { CommunityError } from "@/app/lib/community.error";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { getDb, withTransaction } from "@/app/lib/db";
import { findVerifiedAddress } from "@/app/lib/locations/community-location";
import {
  badFavoriteRequest as badMatchRequest,
  hasValidFavoriteQuery as hasValidMatchQuery,
  parseFavoriteJson as parseMatchJson,
} from "@/app/lib/locations/favorite-locations.http";
import { FavoriteLocationsRepository } from "@/app/lib/locations/favorite-locations.repository";
import { GeocodingError } from "@/app/lib/locations/geocoding";
import { locationTimeZone } from "@/app/lib/locations/location-time-zone";

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
function invalid(
  request: Request,
  trace: RequestDiagnosticTrace,
  stage: "query" | "validation",
  code: string,
) {
  trace("rejected", stage, 400, code);
  return badMatchRequest(request);
}
export function OPTIONS(request: Request) {
  return corsOptions(request);
}
export async function GET(request: Request) {
  const trace = createRequestDiagnostics("location.favorites.list");
  const { userId } = await auth();
  if (!userId) {
    trace("rejected", "auth", 401, "UNAUTHORIZED");
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success || [...params.keys()].some((key) => params.getAll(key).length !== 1))
    return invalid(request, trace, "query", "INVALID_QUERY");
  let keys: string[] | undefined;
  if (parsed.data.keys !== undefined) {
    try {
      const result = keysSchema.safeParse(JSON.parse(parsed.data.keys));
      if (!result.success || params.has("cursor") || params.has("limit"))
        return invalid(request, trace, "query", "INVALID_KEYS");
      keys = result.data;
    } catch {
      return invalid(request, trace, "query", "INVALID_KEYS");
    }
  }
  try {
    trace("starting", "storage");
    const repository = new FavoriteLocationsRepository(await getDb());
    if (keys) {
      const result = await repository.statuses(userId, keys);
      trace("completed", "storage", 200);
      return corsJson({ keys: result }, request);
    }
    const page = await repository.list(userId, parsed.data.limit, parsed.data.cursor);
    const result = {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        location: { ...item.location, timeZone: locationTimeZone(item.location) },
      })),
    };
    trace("completed", "storage", 200);
    return corsJson(result, request);
  } catch {
    trace("failed", "storage", 500, "INTERNAL_ERROR");
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
export async function POST(request: Request) {
  const trace = createRequestDiagnostics("location.favorites.save");
  if (!hasValidMatchQuery(request)) return invalid(request, trace, "query", "INVALID_QUERY");
  const body = await parseMatchJson(request);
  if ("response" in body) {
    trace("rejected", "body", body.response.status, "INVALID_BODY");
    return body.response;
  }
  const parsed = saveFavoriteLocationSchema.safeParse(body.data);
  if (!parsed.success) return invalid(request, trace, "validation", "INVALID_LOCATION_PAYLOAD");
  return runRecordOperation(
    request,
    async (userId, { favorites }) => {
      const { location, matchId } = parsed.data;
      if (matchId) throw new CommunityError(410, "LEGACY_DOMAIN_RETIRED");
      let verified: Awaited<ReturnType<typeof findVerifiedAddress>>;
      try {
        verified = await findVerifiedAddress(location);
        if (!verified) throw new CommunityError(400, "Choose a verified address");
      } catch (error) {
        if (error instanceof GeocodingError) throw new CommunityError(error.status, error.message);
        throw error;
      }
      const canonical = {
        ...location,
        address: verified.address,
        longitude: verified.longitude,
        latitude: verified.latitude,
        timeZone: locationTimeZone(verified),
      };
      const selectedKey = locationFavoriteKey(location);
      return {
        item:
          selectedKey === locationFavoriteKey(canonical)
            ? await favorites.save(userId, canonical)
            : await favorites.save(userId, canonical, selectedKey),
      };
    },
    201,
    trace,
  );
}
export async function DELETE(request: Request) {
  const trace = createRequestDiagnostics("location.favorites.remove");
  const { userId } = await auth();
  if (!userId) {
    trace("rejected", "auth", 401, "UNAUTHORIZED");
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }
  if (!hasValidMatchQuery(request)) return invalid(request, trace, "query", "INVALID_QUERY");
  const body = await parseMatchJson(request);
  if ("response" in body) {
    trace("rejected", "body", body.response.status, "INVALID_BODY");
    return body.response;
  }
  const parsed = removeFavoriteLocationSchema.safeParse(body.data);
  if (!parsed.success) return invalid(request, trace, "validation", "INVALID_FAVORITE_KEY");
  try {
    trace("starting", "storage");
    await withTransaction(async (session, db) => {
      await new FavoriteLocationsRepository(db, session).remove(userId, parsed.data.key);
    });
    trace("completed", "storage", 200);
    return corsJson({ success: true }, request);
  } catch {
    trace("failed", "storage", 500, "INTERNAL_ERROR");
    return corsJson({ error: "Internal server error" }, { status: 500 }, request);
  }
}
