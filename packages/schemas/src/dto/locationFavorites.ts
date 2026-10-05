import { z } from "zod";
import { matchLocationSchema } from "../models/matches";

export function locationFavoriteKey(
  location: Pick<z.infer<typeof matchLocationSchema>, "address" | "longitude" | "latitude">,
) {
  return JSON.stringify([
    location.address.trim().toLowerCase(),
    location.longitude,
    location.latitude,
  ]);
}

export const favoriteLocationSchema = z.object({
  key: z.string(),
  location: matchLocationSchema,
});
export const saveFavoriteLocationSchema = z
  .object({
    location: matchLocationSchema,
    matchId: z.uuid().optional(),
  })
  .strict();
export const removeFavoriteLocationSchema = z.object({ key: z.string().min(1).max(650) }).strict();
export type FavoriteLocation = z.infer<typeof favoriteLocationSchema>;
export type FavoriteLocationsResponse = { items: FavoriteLocation[]; nextCursor: string | null };
