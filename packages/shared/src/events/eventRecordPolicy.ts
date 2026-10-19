import type {
  EventRecord,
  PlannedEventCapabilities,
  TableRecord,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { eventLocalDateTime, eventLocalToIso } from "./eventForm";

export type EventGroupType = "PRIVATE" | "PUBLIC" | null;
export function publicBookingIsClosed(
  event: EventRecord,
  groupType: EventGroupType,
  now: number,
): boolean {
  if (groupType !== "PUBLIC") return false;
  return (
    !event.bookingClosesAt ||
    !Number.isFinite(Date.parse(event.bookingClosesAt)) ||
    now >= Date.parse(event.bookingClosesAt)
  );
}
export function eventRecordCapabilities(
  event: EventRecord,
  groupType: EventGroupType,
  userId: string,
  member: boolean,
  registrations: readonly TableRegistration[],
  now: number,
): PlannedEventCapabilities {
  const admin = event.adminUserId === userId;
  const planning = event.status === "PLANNING";
  const open = planning && !publicBookingIsClosed(event, groupType, now);
  const accepted = registrations.some((row) => row.userId === userId && row.status === "ACCEPTED");
  return {
    canEdit: admin && open,
    canInvite: admin && open,
    canRegister: open && (groupType === null ? admin : member),
    canVote: open && accepted,
    canConfirm: admin && planning,
    canReplan: admin && event.status === "CONFIRMED",
    canFinalize: admin && event.status === "CONFIRMED",
  };
}
export function eventRecordDay(
  event: Pick<EventRecord, "dates" | "confirmed" | "status">,
  groupType: EventGroupType,
): string | null {
  if (groupType === "PUBLIC") return event.dates[0].day;
  if (event.status === "PLANNING" || !event.confirmed) return null;
  return event.dates.find((date) => date.id === event.confirmed?.dateId)?.day ?? null;
}
export function eventRecordPeriods(
  event: EventRecord,
  groupType: EventGroupType,
  now: number,
): Array<"past" | "future"> {
  const day = eventRecordDay(event, groupType);
  if (!day) return ["past", "future"];
  const today = eventLocalDateTime(new Date(now).toISOString(), event.timeZone).slice(0, 10);
  return day < today ? ["past"] : ["future"];
}
/** Use elapsed minutes, not wall-clock addition, across DST transitions. */
export function plannedTableInterval(
  event: EventRecord,
  table: TableRecord,
  groupType: EventGroupType,
  dateId?: string,
  gameId?: number,
) {
  const date = event.dates.find((row) => row.id === dateId) ?? event.dates[0];
  const eventStart = eventLocalToIso(`${date.day}T${event.startTime}`, event.timeZone);
  const startsAt = groupType === "PUBLIC" && table.startsAt ? table.startsAt : eventStart;
  if (groupType !== "PUBLIC") return { startsAt };
  const games =
    gameId === undefined ? table.games : table.games.filter((game) => game.gameId === gameId);
  if (!games.length || games.some((game) => !game.durationMinutes))
    throw new Error("TABLE_DURATION_REQUIRED");
  const duration = Math.max(...games.map((game) => game.durationMinutes as number));
  const endsAt = new Date(Date.parse(startsAt) + duration * 60_000).toISOString();
  if (!event.endsAt) throw new Error("PUBLIC_EVENT_END_REQUIRED");
  const eventEnd = event.endsAt;
  if (
    Date.parse(startsAt) < Date.parse(eventStart) ||
    Date.parse(endsAt) > Date.parse(eventEnd) ||
    Date.parse(eventEnd) <= Date.parse(eventStart)
  )
    throw new Error("TABLE_OUTSIDE_EVENT");
  return { startsAt, endsAt };
}
export function recordIntervalsOverlap(
  a: { startsAt: string; endsAt?: string },
  b: { startsAt: string; endsAt?: string },
) {
  return (
    !a.endsAt ||
    !b.endsAt ||
    (Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt))
  );
}
export function hasPublicTableConflict(
  event: EventRecord,
  tables: readonly TableRecord[],
  registrations: readonly TableRegistration[],
  target: TableRecord,
  userId: string,
) {
  const interval = plannedTableInterval(event, target, "PUBLIC");
  return tables.some(
    (table) =>
      table.id !== target.id &&
      (table.demonstratorUserId === userId ||
        registrations.some(
          (row) =>
            row.tableId === table.id &&
            row.userId === userId &&
            (row.status === "PENDING" || row.status === "ACCEPTED"),
        )) &&
      recordIntervalsOverlap(interval, plannedTableInterval(event, table, "PUBLIC")),
  );
}
export function banHasProtectedParticipation(
  groupType: EventGroupType,
  events: readonly EventRecord[],
  tables: readonly TableRecord[],
  userId: string,
  now: number,
): boolean {
  return (
    groupType === "PUBLIC" &&
    events.some(
      (event) =>
        event.status === "CONFIRMED" &&
        publicBookingIsClosed(event, "PUBLIC", now) &&
        tables.some(
          (table) =>
            table.eventId === event.id &&
            table.confirmed &&
            (table.confirmed.playerIds.includes(userId) || table.demonstratorUserId === userId),
        ),
    )
  );
}
