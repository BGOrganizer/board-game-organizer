import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { corsJson, corsOptions } from "@/app/lib/cors";

const querySchema = z.string().trim().min(4).max(200);
const featureSchema = z.object({
  properties: z.object({
    mapbox_id: z.string(),
    full_address: z.string().min(1).optional(),
    name: z.string().optional(),
  }),
  geometry: z.object({ coordinates: z.tuple([z.number().finite(), z.number().finite()]) }),
});
const responseSchema = z.object({ features: z.array(featureSchema) });

export function OPTIONS(request: Request) {
  return corsOptions(request);
}

/** Permanent Geocoding v6 results may be stored in match documents. Never use Search Box here. */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return corsJson({ error: "Unauthorized" }, { status: 401 }, request);
  const query = querySchema.safeParse(new URL(request.url).searchParams.get("query"));
  if (!query.success)
    return corsJson({ error: "Query must contain 4–200 characters" }, { status: 400 }, request);
  const token = process.env.MAPBOX_GEOCODING_TOKEN;
  if (!token) return corsJson({ error: "Geocoding unavailable" }, { status: 503 }, request);
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", query.data);
  url.searchParams.set("limit", "5");
  url.searchParams.set("types", "address");
  url.searchParams.set("permanent", "true");
  url.searchParams.set("access_token", token);
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return corsJson({ error: "Geocoding unavailable" }, { status: 502 }, request);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success)
      return corsJson({ error: "Invalid geocoding response" }, { status: 502 }, request);
    return corsJson(
      {
        items: parsed.data.features
          .slice(0, 5)
          .map((feature) => ({
            id: feature.properties.mapbox_id,
            address: feature.properties.full_address,
            longitude: feature.geometry.coordinates[0],
            latitude: feature.geometry.coordinates[1],
          }))
          .filter((item) => item.address),
      },
      request,
    );
  } catch {
    return corsJson({ error: "Geocoding unavailable" }, { status: 502 }, request);
  }
}
