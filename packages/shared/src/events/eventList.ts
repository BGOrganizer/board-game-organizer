import type {
  EventListSection,
  EventPeriod,
  EventResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  TableListSection,
} from "@board-game-organizer/schemas";
import { publicBookingIsClosed } from "./eventRecordPolicy";

/** Excluded frozen-event Tables remain readable only in their Event's list. */
export function isPersonalEventTableVisible(
  table: Pick<PlannedTableResponse, "eventStatus" | "confirmed">,
) {
  return table.eventStatus === "PLANNING" || Boolean(table.confirmed);
}

/** Personal sections follow actual attendance and current authority, never an inferred seat. */
export function personalEventSection(
  event: Pick<
    PlannedEventResponse,
    "groupId" | "adminUserId" | "myRegistrations" | "role" | "myDemonstrator" | "status"
  > &
    Partial<
      Pick<
        PlannedEventResponse,
        "canManage" | "canRegister" | "cardSummary" | "groupType" | "bookingClosesAt"
      >
    >,
  userId: string,
  now = Date.now(),
): EventListSection | null {
  const manages = event.canManage ?? (!event.groupId && event.adminUserId === userId);
  const played = event.cardSummary
    ? event.cardSummary.tables.some((table) => table.myParticipation === "CONFIRMED")
    : event.myRegistrations.some((row) => row.userId === userId && row.position === "FROZEN");
  const demonstrates = event.myDemonstrator || event.role === "demonstrator";
  if (event.status === "TERMINATED") return manages || played || demonstrates ? "terminated" : null;
  if (
    manages ||
    played ||
    demonstrates ||
    event.myRegistrations.some(
      (row) => row.userId === userId && (row.status === "PENDING" || row.status === "ACCEPTED"),
    )
  )
    return "mine";
  return event.status === "PLANNING" &&
    event.groupId &&
    event.canRegister === true &&
    !publicBookingIsClosed(event, event.groupType ?? null, now)
    ? "available"
    : null;
}

/** History contains played Tables, including current managers and the actual demonstrator. */
export function isPersonalHistoryTable(
  table: Pick<
    PlannedTableResponse,
    "eventStatus" | "confirmed" | "demonstratorUserId" | "myRegistration"
  > &
    Partial<Pick<PlannedTableResponse, "canManage">>,
  userId: string,
) {
  return (
    table.eventStatus === "TERMINATED" &&
    Boolean(table.confirmed) &&
    (table.canManage === true ||
      table.demonstratorUserId === userId ||
      Boolean(table.confirmed?.playerIds.includes(userId)))
  );
}

/** Legacy section callers still require canonical positions; missing positions never imply a seat. */
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
