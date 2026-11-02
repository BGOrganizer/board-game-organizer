import type {
  EventListSection,
  EventPeriod,
  EventResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  TableListSection,
} from "@board-game-organizer/schemas";

/** Excluded frozen-event Tables remain readable only in their Event's list. */
export function isPersonalEventTableVisible(
  table: Pick<PlannedTableResponse, "eventStatus" | "confirmed">,
) {
  return table.eventStatus === "PLANNING" || Boolean(table.confirmed);
}

/** Participation is explicit; administration alone never places an Event in My events. */
export function personalEventSection(
  event: Pick<
    PlannedEventResponse,
    "groupId" | "adminUserId" | "myRegistrations" | "role" | "myDemonstrator"
  >,
  userId: string,
): EventListSection | null {
  if (
    event.myDemonstrator ||
    event.role === "demonstrator" ||
    event.myRegistrations.some(
      (row) => row.userId === userId && (row.status === "PENDING" || row.status === "ACCEPTED"),
    )
  )
    return "mine";
  return event.groupId || event.adminUserId === userId ? "available" : null;
}

/** Use canonical seat/queue metadata; missing positions never imply a seat. */
export function personalTableSection(
  table: Pick<
    PlannedTableResponse,
    "eventStatus" | "confirmed" | "demonstratorUserId" | "myRegistration" | "myPosition"
  >,
  userId: string,
): TableListSection | null {
  if (!isPersonalEventTableVisible(table)) return null;
  if (
    table.demonstratorUserId === userId ||
    (table.confirmed?.playerIds.includes(userId) && table.eventStatus !== "PLANNING")
  )
    return "mine";
  const own = table.myRegistration;
  if (own?.userId !== userId) return null;
  if (own.status === "PENDING") return "waiting";
  if (own.status !== "ACCEPTED") return null;
  if (table.myPosition === "WAITING") return "waiting";
  return table.myPosition === "SEATED" || table.myPosition === "FROZEN" ? "mine" : null;
}

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
