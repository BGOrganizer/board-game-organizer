import { locationFavoriteKey, type MatchLocation } from "@board-game-organizer/schemas";
import { CommunityError } from "../community.error";
import { GeocodingError, geocodeAddresses } from "./geocoding";
import { locationTimeZone } from "./location-time-zone";
export async function verifyCommunityLocation(
  location: MatchLocation,
  existing: readonly MatchLocation[] = [],
) {
  const key = locationFavoriteKey(location);
  const previous = existing.find((value) => locationFavoriteKey(value) === key);
  if (previous) return { ...location, timeZone: locationTimeZone(previous) };
  try {
    const result = (await geocodeAddresses(location.address)).find(
      (value) => locationFavoriteKey(value) === key,
    );
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
