import type { VerifiedLocation } from "@board-game-organizer/schemas";
import { find } from "geo-tz";
import { CommunityError } from "../community.error";

/** Resolve the verified coordinates, never a client-supplied zone or longitude estimate. */
export function locationTimeZone(
  location: Pick<VerifiedLocation, "latitude" | "longitude">,
): string {
  try {
    const zones = find(location.latitude, location.longitude);
    const [timeZone] = zones;
    if (!timeZone || zones.length !== 1) throw new Error("Ambiguous location time zone");
    // Fail closed if runtime ICU cannot interpret the bundled geographic data.
    return new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone;
  } catch {
    throw new CommunityError(503, "LOCATION_TIME_ZONE_UNAVAILABLE");
  }
}
