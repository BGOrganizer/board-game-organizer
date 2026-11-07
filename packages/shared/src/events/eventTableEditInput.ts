import {
  type EventResponse,
  type EventTableInput,
  updateEventSchema,
} from "@board-game-organizer/schemas";

/** Only this table changes; omitted tables remain in the API's atomic edit. */
export function eventTableEditInput(event: EventResponse, table: EventTableInput) {
  return updateEventSchema.parse({
    name: event.name,
    status: event.status,
    timeZone: event.timeZone,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    bookingClosesAt: event.bookingClosesAt,
    location: event.location,
    version: event.version,
    tables: [table],
    removedTableIds: [],
  });
}
