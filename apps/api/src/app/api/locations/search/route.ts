import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";
import { GeocodingError, geocodeAddresses } from "@/app/lib/geocoding";

const querySchema = z.string().trim().min(4).max(200);
export function OPTIONS(request: Request) {
  return corsOptions(request);
}
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const query = querySchema.safeParse(new URL(request.url).searchParams.get("query"));
  if (!query.success)
    return corsJson({ error: "Query must contain 4–200 characters" }, { status: 400 }, request);
  try {
    return corsJson({ items: await geocodeAddresses(query.data) }, request);
  } catch (error) {
    if (error instanceof GeocodingError)
      return corsJson({ error: error.message }, { status: error.status }, request);
    return corsJson({ error: "Geocoding unavailable" }, { status: 502 }, request);
  }
}
