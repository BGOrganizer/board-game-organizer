import type {
  EventResponse,
  EventTableInput,
  EventTableResponse,
  SaveEventInput,
} from "@board-game-organizer/schemas";
import { eventScheduleChanged, eventTableChanged } from "./eventPolicy";

const HOUR_MS = 60 * 60 * 1000;

/** Keep existing fractional offsets, including seconds, when editing an event. */
export function eventBookingHours(
  event?: Pick<EventResponse, "startsAt" | "bookingClosesAt">,
): string {
  return event
    ? ((Date.parse(event.startsAt) - Date.parse(event.bookingClosesAt)) / HOUR_MS)
        .toFixed(12)
        .replace(/\.?0+$/, "")
    : "24";
}

/** Hours are an elapsed duration, not local calendar days (DST can change day length). */
export function eventBookingClosesAt(startsAt: string, hours: string): string {
  if (!/^\d+(?:[.,]\d+)?$/.test(hours)) throw new Error("Invalid booking hours");
  const duration = Math.round(Number(hours.replace(",", ".")) * HOUR_MS);
  if (!Number.isSafeInteger(duration) || duration <= 0) throw new Error("Invalid booking hours");
  return new Date(Date.parse(startsAt) - duration).toISOString();
}

export function eventLocalDateTime(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const fields = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const part = (name: string) => fields[name];
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}
/** Reject missing DST wall times instead of silently moving an event to another hour. */
export function eventLocalToIso(wall: string, timeZone: string, previous?: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(wall))
    throw new Error("Invalid event date");
  // Preserve existing instants (and seconds) when a repeated DST wall time was not edited.
  if (previous && eventLocalDateTime(previous, timeZone).slice(0, wall.length) === wall)
    return previous;
  const normalized = wall.length === 16 ? `${wall}:00` : wall;
  const target = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 19) !== normalized)
    throw new Error("Invalid event date");
  let value = target;
  for (let i = 0; i < 4; i++) {
    const rendered = eventLocalDateTime(new Date(value).toISOString(), timeZone);
    const difference = target - Date.parse(`${rendered}Z`);
    if (difference === 0) return new Date(value).toISOString();
    value += difference;
  }
  throw new Error("Invalid event date");
}
export function eventEditResets(
  event: EventResponse,
  input: SaveEventInput,
  knownTables: EventTableResponse[],
  removed: string[],
): boolean {
  if (eventScheduleChanged(event, input) || removed.length > 0) return true;
  return input.tables.some((table) => {
    if (!table.id) return false;
    const before = knownTables.find((row) => row.id === table.id);
    return !before || eventTableChanged(before, table);
  });
}
export function editableEventTable(table: EventTableResponse): EventTableInput {
  return {
    id: table.id,
    name: table.name,
    startsAt: table.startsAt,
    endsAt: table.endsAt,
    minPlayers: table.minPlayers,
    maxPlayers: table.maxPlayers,
    gameId: table.gameId,
    demonstratorUserId: table.demonstratorUserId,
    openSkill: table.openSkill,
  };
}
