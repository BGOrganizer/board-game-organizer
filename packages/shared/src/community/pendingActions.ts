import type {
  GroupRecordResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { publicBookingIsClosed } from "../events/eventRecordPolicy";

export type PendingAction = "reply" | "review";

/** Business decisions, independent of unread notification counts and explicit inbox reads. */
export function groupPendingAction(
  group: Pick<GroupRecordResponse, "role" | "pendingRequestCount" | "myMembership">,
): PendingAction | null {
  if (
    (group.role === "admin" || group.role === "moderator") &&
    (group.pendingRequestCount ?? 0) > 0
  )
    return "review";
  return group.role === "invited" &&
    group.myMembership?.kind === "INVITATION" &&
    group.myMembership.status === "PENDING"
    ? "reply"
    : null;
}

export function eventPendingAction(
  event: Pick<PlannedEventResponse, "status" | "groupType" | "bookingClosesAt" | "myRegistrations">,
  now = Date.now(),
): PendingAction | null {
  if (event.status !== "PLANNING" || publicBookingIsClosed(event, event.groupType, now))
    return null;
  return event.myRegistrations.some((row) => row.kind === "INVITATION" && row.status === "PENDING")
    ? "reply"
    : null;
}

export function tablePendingAction(
  table: Pick<
    PlannedTableResponse,
    "eventStatus" | "groupType" | "bookingClosesAt" | "canRespond" | "myRegistration"
  >,
  now = Date.now(),
): PendingAction | null {
  return table.eventStatus === "PLANNING" &&
    table.canRespond &&
    !publicBookingIsClosed(table, table.groupType, now) &&
    table.myRegistration?.kind === "INVITATION" &&
    table.myRegistration.status === "PENDING"
    ? "reply"
    : null;
}
