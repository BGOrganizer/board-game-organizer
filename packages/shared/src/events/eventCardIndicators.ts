import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { type RecordUserRole, tableUserRoles } from "../common/recordUserRoles";
import type { ClientEventRecord } from "./eventOptimisticCreation";

export type CardParticipationState =
  | "PLANNING"
  | "CONFIRMED"
  | "EXCLUDED"
  | "TABLE_EXCLUDED"
  | "DUTY"
  | "OBSERVER"
  | "UNKNOWN"
  | "TERMINATED";

export const CARD_STATE_TONES = {
  PLANNING: "warning",
  CONFIRMED: "success",
  EXCLUDED: "danger",
  TABLE_EXCLUDED: "danger",
  DUTY: "accent",
  OBSERVER: "muted",
  UNKNOWN: "muted",
  TERMINATED: "accent",
} as const;

export const CARD_PLANNING_MESSAGES = {
  MIN_PLAYERS: "Not enough eligible players to reach the minimum.",
  PENDING_INVITATIONS: "Reserved invitations still need to be accepted.",
  DATE_AGREEMENT: "There is no agreement on a date and time.",
  LOCATION_AGREEMENT: "There is no agreement on a location.",
  GAME_AGREEMENT: "There is no agreement on a game.",
  COMBINED_AGREEMENT: "No combination of date, location and game satisfies the same players.",
} as const;

export const CARD_EXCLUSION_MESSAGES = {
  TABLE_EXCLUDED: "The table was excluded from confirmation.",
  PENDING_INVITATION: "The invitation was not accepted before confirmation.",
  DATE_AGREEMENT: "Your votes do not agree with the chosen date and time.",
  LOCATION_AGREEMENT: "Your votes do not agree with the chosen location.",
  GAME_AGREEMENT: "Your votes do not agree with the chosen game.",
  NOT_SELECTED: "You were not included in the final roster.",
} as const;

/** Display current authorized roles without inferring a seat from management or accepted queue consent. */
export function eventCardRoles(event: ClientEventRecord): RecordUserRole[] {
  if (event.optimistic) return [];
  const roles: RecordUserRole[] = [];
  if (!event.readOnly && event.canManage && event.managementRole) roles.push(event.managementRole);
  if ((!event.readOnly || event.personalAccessOnly) && event.myDemonstrator)
    roles.push("demonstrator");
  if (!event.readOnly) {
    if (event.myRegistrations.some((r) => r.status === "PENDING" && r.kind === "INVITATION"))
      roles.push("invitedParticipant");
    if (
      event.myRegistrations.some(
        (r) => r.position === "WAITING" && (r.status === "ACCEPTED" || r.status === "PENDING"),
      )
    )
      roles.push("waitingParticipant");
    if (
      event.myRegistrations.some(
        (r) => event.status === "PLANNING" && r.status === "ACCEPTED" && r.position === "SEATED",
      )
    )
      roles.push("acceptedParticipant");
  }
  if (
    !roles.includes("acceptedParticipant") &&
    (event.cardSummary
      ? event.cardSummary.tables.some((table) => table.myParticipation === "CONFIRMED")
      : !event.readOnly && event.myRegistrations.some((r) => r.position === "FROZEN"))
  )
    roles.push("acceptedParticipant");
  return roles;
}

export function tableCardRoles(
  table: PlannedTableResponse,
  userId: string | null | undefined,
): RecordUserRole[] {
  const roles: RecordUserRole[] = [];
  if (!table.readOnly && table.canManage && table.managementRole) roles.push(table.managementRole);
  if (
    (!table.readOnly || table.personalAccessOnly) &&
    userId &&
    table.demonstratorUserId === userId
  )
    roles.push("demonstrator");
  if (!table.readOnly) {
    roles.push(
      ...tableUserRoles({
        status: table.myRegistration?.status,
        kind: table.myRegistration?.kind,
        position:
          table.eventStatus === "PLANNING" || table.myPosition === "WAITING"
            ? table.myPosition
            : undefined,
        demonstrator: false,
      }),
    );
  }
  if (
    !roles.includes("confirmedPlayer") &&
    (table.cardSummary
      ? table.cardSummary.myParticipation === "CONFIRMED"
      : Boolean(userId && table.confirmed?.playerIds.includes(userId)))
  )
    roles.push("confirmedPlayer");
  return roles;
}

export function confirmedEventCardTables(event: ClientEventRecord) {
  return event.status === "CONFIRMED"
    ? (event.cardSummary?.tables.filter(
        (table) =>
          table.confirmed && (table.myParticipation === "CONFIRMED" || table.myDemonstrator),
      ) ?? [])
    : [];
}

export function eventCardState(event: ClientEventRecord): CardParticipationState {
  if (event.status === "PLANNING") return "PLANNING";
  if (event.status === "TERMINATED") return "TERMINATED";
  const roles = eventCardRoles(event);
  if (roles.includes("acceptedParticipant")) return "CONFIRMED";
  if (event.cardSummary?.tables.some((table) => table.myParticipation === "EXCLUDED"))
    return "EXCLUDED";
  if (
    !event.cardSummary &&
    !event.readOnly &&
    event.myRegistrations.some((r) => r.status === "ACCEPTED" || r.status === "PENDING")
  )
    return "UNKNOWN";
  if (roles.some((role) => role === "admin" || role === "moderator" || role === "demonstrator"))
    return "DUTY";
  return "OBSERVER";
}

export function tableCardState(
  table: PlannedTableResponse,
  userId: string | null | undefined,
): CardParticipationState {
  if (table.eventStatus === "PLANNING") return "PLANNING";
  if (!table.confirmed) return "TABLE_EXCLUDED";
  if (table.eventStatus === "TERMINATED") return "TERMINATED";
  const roles = tableCardRoles(table, userId);
  if (roles.includes("confirmedPlayer")) return "CONFIRMED";
  if (
    table.cardSummary?.myParticipation === "EXCLUDED" ||
    (!table.cardSummary &&
      !table.readOnly &&
      (table.myRegistration?.status === "ACCEPTED" || table.myRegistration?.status === "PENDING"))
  )
    return "EXCLUDED";
  if (roles.some((role) => role === "admin" || role === "moderator" || role === "demonstrator"))
    return "DUTY";
  return "OBSERVER";
}
