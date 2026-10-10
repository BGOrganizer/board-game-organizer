import { z } from "zod";

const responseSchema = z.object({
  features: z.array(
    z.object({
      id: z.string().min(1),
      place_name: z.string().trim().min(1).max(500),
      place_type: z.array(z.string()),
      center: z.tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ]),
    }),
  ),
});
export class GeocodingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
export async function geocodeAddresses(query: string) {
  const key = process.env.MAPTILER_GEOCODING_KEY;
  if (!key) throw new GeocodingError("Geocoding unavailable", 503);
  // MapTiler's reverse endpoint needs a literal comma between coordinates.
  const path = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(query) ? query : encodeURIComponent(query);
  const url = new URL(`https://api.maptiler.com/geocoding/${path}.json`);
  url.searchParams.set("key", key);
  url.searchParams.set("limit", "5");
  url.searchParams.set("types", "address");
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new GeocodingError("Geocoding unavailable", 502);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new GeocodingError("Invalid geocoding response", 502);
    return parsed.data.features
      .filter((feature) => feature.place_type.includes("address"))
      .slice(0, 5)
      .map((feature) => ({
        id: feature.id,
        address: feature.place_name,
        longitude: feature.center[0],
        latitude: feature.center[1],
      }));
  } catch (error) {
    if (error instanceof GeocodingError) throw error;
    throw new GeocodingError("Geocoding unavailable", 502);
  }
}
