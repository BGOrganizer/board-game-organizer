import { locationFavoriteKey, type MatchLocation } from "@board-game-organizer/schemas";
import { CommunityError } from "../community.error";
import { GeocodingError, geocodeAddresses } from "./geocoding";
import { locationTimeZone } from "./location-time-zone";
/** Reuse the same strict match for Group/Event venues and favorite writes. No raw location is logged. */
export async function findVerifiedAddress(location: MatchLocation) {
  console.info("[bgo.location-verify]", { phase: "lookup" });
  try {
    const candidates = await geocodeAddresses(location.address);
    const key = locationFavoriteKey(location);
    const result = candidates.find((value) => locationFavoriteKey(value) === key);
    console.info("[bgo.location-verify]", {
      phase: result ? "matched" : "rejected",
      candidateCount: candidates.length,
      addressMatch: candidates.some(
        (value) => value.address.trim().toLowerCase() === location.address.trim().toLowerCase(),
      ),
      coordinateMatch: candidates.some(
        (value) => value.longitude === location.longitude && value.latitude === location.latitude,
      ),
      status: result ? 200 : 400,
      code: result ? undefined : "CHOOSE_VERIFIED_ADDRESS",
    });
    return result;
  } catch (error) {
    console.info("[bgo.location-verify]", {
      phase: "failed",
      status: error instanceof GeocodingError ? error.status : 500,
      code: "GEOCODING_UNAVAILABLE",
    });
    throw error;
  }
}
export async function verifyCommunityLocation(
  location: MatchLocation,
  existing: readonly MatchLocation[] = [],
) {
  const key = locationFavoriteKey(location);
  const previous = existing.find((value) => locationFavoriteKey(value) === key);
  if (previous) return { ...location, timeZone: locationTimeZone(previous) };
  try {
    const result = await findVerifiedAddress(location);
    if (!result) throw new CommunityError(400, "CHOOSE_VERIFIED_ADDRESS");
    return {
      ...location,
      address: result.address,
      longitude: result.longitude,
      latitude: result.latitude,
      timeZone: locationTimeZone(result),
    };
  } catch (error) {
    if (error instanceof GeocodingError)
      throw new CommunityError(error.status, "GEOCODING_UNAVAILABLE");
    throw error;
  }
}
