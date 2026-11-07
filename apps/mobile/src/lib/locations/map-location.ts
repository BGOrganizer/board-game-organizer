import { matchLocationSchema } from "@board-game-organizer/schemas";

/** Reject malformed cached/API coordinates before they cross the native map boundary. */
export function locationMapPoint(longitude: unknown, latitude: unknown): [number, number] | null {
  const lng = matchLocationSchema.shape.longitude.safeParse(longitude);
  const lat = matchLocationSchema.shape.latitude.safeParse(latitude);
  return lng.success && lat.success ? [lng.data, lat.data] : null;
}
