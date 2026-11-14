import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { createRequestDiagnostics } from "@/app/lib/community/request-diagnostics";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { GeocodingError, geocodeAddresses } from "@/app/lib/locations/geocoding";

const querySchema = z.string().trim().min(4).max(200);
export function OPTIONS(request: Request) {
  return corsOptions(request);
}
export async function GET(request: Request) {
  const trace = createRequestDiagnostics("location.search");
  const { userId } = await auth();
  if (!userId) {
    trace("rejected", "auth", 401, "UNAUTHORIZED");
    return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  }
  const query = querySchema.safeParse(new URL(request.url).searchParams.get("query"));
  if (!query.success) {
    trace("rejected", "query", 400, "INVALID_QUERY");
    return corsJson({ error: "Query must contain 4–200 characters" }, { status: 400 }, request);
  }
  try {
    trace("starting", "lookup");
    const items = await geocodeAddresses(query.data);
    trace("completed", "lookup", 200);
    return corsJson({ items }, request);
  } catch (error) {
    trace(
      "failed",
      "lookup",
      error instanceof GeocodingError ? error.status : 502,
      "GEOCODING_UNAVAILABLE",
    );
    if (error instanceof GeocodingError)
      return corsJson({ error: error.message }, { status: error.status }, request);
    return corsJson({ error: "Geocoding unavailable" }, { status: 502 }, request);
  }
}
