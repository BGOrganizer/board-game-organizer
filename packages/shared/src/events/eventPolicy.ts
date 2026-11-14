import type {
  Event,
  EventBooking,
  EventTable,
  EventTableInput,
  SaveEventInput,
} from "@board-game-organizer/schemas";
import { locationFavoriteKey } from "@board-game-organizer/schemas";

export function normalizeOrganizationName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function defaultEventBookingClosesAt(startsAt: string): string {
  return new Date(Date.parse(startsAt) - 24 * 60 * 60 * 1000).toISOString();
}

export function canModifyEvent(
  event: Pick<Event, "status" | "bookingClosesAt" | "closedAt">,
  now: number,
): boolean {
  return (
    !event.closedAt &&
    (event.status === "DRAFT" || event.status === "PUBLISHED") &&
    now < Date.parse(event.bookingClosesAt)
  );
}

export function eventBookingReservesSeat(booking: Pick<EventBooking, "status">): boolean {
  return booking.status === "PENDING" || booking.status === "CONFIRMED";
}

/** Adjacent tables are allowed. Intervals are half-open: [start, end). */
export function eventIntervalsOverlap(
  first: Pick<EventTable, "startsAt" | "endsAt">,
  second: Pick<EventTable, "startsAt" | "endsAt">,
): boolean {
  return (
    Date.parse(first.startsAt) < Date.parse(second.endsAt) &&
    Date.parse(second.startsAt) < Date.parse(first.endsAt)
  );
}

export function hasConflictingEventBooking(
  target: EventTable,
  userId: string,
  bookings: readonly EventBooking[],
  tables: readonly EventTable[],
): boolean {
  const byId = new Map(tables.map((table) => [table.id, table]));
  return bookings.some((booking) => {
    if (
      booking.userId !== userId ||
      booking.eventId !== target.eventId ||
      booking.tableId === target.id ||
      !eventBookingReservesSeat(booking)
    )
      return false;
    const other = byId.get(booking.tableId);
    return (
      other === undefined || (other.status !== "CANCELLED" && eventIntervalsOverlap(target, other))
    );
  });
}

export function confirmedEventPlayers(bookings: readonly EventBooking[]): string[] {
  return bookings
    .filter((booking) => booking.status === "CONFIRMED")
    .map((booking) => booking.userId);
}

export function eventScheduleChanged(event: Event, next: SaveEventInput): boolean {
  return (
    Date.parse(event.startsAt) !== Date.parse(next.startsAt) ||
    Date.parse(event.endsAt) !== Date.parse(next.endsAt) ||
    event.timeZone !== next.timeZone ||
    locationFavoriteKey(event.location) !== locationFavoriteKey(next.location)
  );
}

export function eventTableChanged(table: EventTable, next: EventTableInput): boolean {
  return (
    Date.parse(table.startsAt) !== Date.parse(next.startsAt) ||
    Date.parse(table.endsAt) !== Date.parse(next.endsAt) ||
    (
      ["name", "minPlayers", "maxPlayers", "gameId", "demonstratorUserId", "openSkill"] as const
    ).some((field) => table[field] !== next[field])
  );
}
