import type { EventPeriod, EventResponse } from "@board-game-organizer/schemas";

/** Used when reconciling a changed row into an already filtered list cache. */
export function eventMatchesFilters(
  event: Pick<EventResponse, "name" | "status" | "endsAt">,
  query: string,
  periods: readonly EventPeriod[],
  now = Date.now(),
) {
  const end = Date.parse(event.endsAt);
  return (
    event.status !== "CANCELLED" &&
    Number.isFinite(end) &&
    event.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
    periods.includes(end <= now ? "past" : "future")
  );
}
