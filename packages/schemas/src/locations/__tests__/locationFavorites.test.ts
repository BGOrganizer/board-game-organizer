import { describe, expect, it } from "vitest";
import {
  favoriteLocationSchema,
  locationFavoriteKey,
  removeFavoriteLocationSchema,
  saveFavoriteLocationSchema,
} from "../dto/locationFavorites";

const location = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Game club",
  address: "Main Street 10",
  longitude: 12.5,
  latitude: 41.9,
};

describe("location favorites", () => {
  it("keys addresses and exact coordinates, not names or match slot IDs", () => {
    const key = locationFavoriteKey(location);
    expect(locationFavoriteKey({ ...location, address: " MAIN STREET 10 " })).toBe(key);
    expect(locationFavoriteKey({ ...location, longitude: 12.6 })).not.toBe(key);
    expect(favoriteLocationSchema.parse({ key, location })).toEqual({ key, location });
    expect(saveFavoriteLocationSchema.parse({ location })).toEqual({ location });
    expect(saveFavoriteLocationSchema.parse({ location, matchId: location.id }).matchId).toBe(
      location.id,
    );
    expect(removeFavoriteLocationSchema.parse({ key })).toEqual({ key });
  });
  it("rejects unverified shapes, coordinates, IDs and empty delete keys", () => {
    for (const body of [
      { location, userId: "other" },
      { location, matchId: "bad" },
      { location: { ...location, latitude: 91 } },
      { location: { ...location, name: "a" } },
    ])
      expect(saveFavoriteLocationSchema.safeParse(body).success).toBe(false);
    for (const body of [{ key: "" }, { key: "x".repeat(651) }, { key: "ok", userId: "other" }])
      expect(removeFavoriteLocationSchema.safeParse(body).success).toBe(false);
  });
});
