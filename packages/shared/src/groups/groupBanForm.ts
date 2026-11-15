import { eventLocalToIso } from "../events/eventForm";
/** Undefined is an invalid wall-clock time; null explicitly means a permanent ban. */
export function groupBanDeadline(
  timed: boolean,
  wall: string,
  timeZone: string,
  now: number,
): string | null | undefined {
  if (!timed) return null;
  try {
    const until = eventLocalToIso(wall, timeZone);
    return Date.parse(until) > now ? until : undefined;
  } catch {
    return undefined;
  }
}
