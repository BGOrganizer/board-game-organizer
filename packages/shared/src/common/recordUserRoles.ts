import type {
  EventParticipantResponse,
  GroupMembership,
  TableSeatPosition,
} from "@board-game-organizer/schemas";

/** Stable message IDs; platform-owned presentation resolves icons, tokens and translations. */
export const RECORD_USER_ROLES = {
  admin: { message: "Admin", icon: "admin", tone: "warning" },
  moderator: { message: "Moderator", icon: "moderator", tone: "accent" },
  demonstrator: { message: "Demonstrator", icon: "demonstrator", tone: "accent" },
  invitedPlayer: { message: "Player with pending invitation", icon: "invitation", tone: "warning" },
  waitingPlayer: { message: "Player on the waiting list", icon: "waiting", tone: "warning" },
  confirmedPlayer: { message: "Confirmed player", icon: "accepted", tone: "success" },
  invitedParticipant: {
    message: "Participant with pending invitation",
    icon: "invitation",
    tone: "warning",
  },
  waitingParticipant: {
    message: "Participant on the waiting list",
    icon: "waiting",
    tone: "warning",
  },
  acceptedParticipant: { message: "Accepted participant", icon: "accepted", tone: "success" },
  requestedMember: { message: "Member with pending request", icon: "request", tone: "warning" },
  invitedMember: { message: "Member with pending invitation", icon: "invitation", tone: "warning" },
  acceptedMember: { message: "Accepted member", icon: "accepted", tone: "success" },
} as const;
export type RecordUserRole = keyof typeof RECORD_USER_ROLES;

export function tableUserRoles(row: {
  status?: string;
  kind?: string;
  position?: TableSeatPosition | null;
  demonstrator?: boolean;
}): RecordUserRole[] {
  const roles: RecordUserRole[] = row.demonstrator ? ["demonstrator"] : [];
  if (row.status === "PENDING" && row.kind === "INVITATION") roles.push("invitedPlayer");
  if (row.position === "WAITING" && (row.status === "ACCEPTED" || row.status === "PENDING"))
    roles.push("waitingPlayer");
  else if (row.position === "FROZEN" || (row.status === "ACCEPTED" && row.position === "SEATED"))
    roles.push("confirmedPlayer");
  return roles;
}

export function eventUserRoles(
  person: Pick<
    EventParticipantResponse,
    "managementRole" | "position" | "accepted" | "pendingInvitation" | "demonstrator" | "waiting"
  >,
): RecordUserRole[] {
  const roles: RecordUserRole[] = [];
  if (person.managementRole) roles.push(person.managementRole === "admin" ? "admin" : "moderator");
  if (person.demonstrator) roles.push("demonstrator");
  if (person.pendingInvitation) roles.push("invitedParticipant");
  if (person.waiting || person.position === "WAITING") roles.push("waitingParticipant");
  // Old participant pages contained accepted/frozen attendance only.
  if (person.accepted ?? true) roles.push("acceptedParticipant");
  return roles;
}

export function groupUserRoles(person: {
  isAdmin: boolean;
  membership?: Pick<GroupMembership, "kind" | "status" | "role"> | null;
}): RecordUserRole[] {
  if (person.isAdmin) return ["admin"];
  const membership = person.membership;
  if (membership?.status === "PENDING")
    return [membership.kind === "REQUEST" ? "requestedMember" : "invitedMember"];
  if (membership?.status === "ACCEPTED")
    return [membership.role === "MODERATOR" ? "moderator" : "acceptedMember"];
  return [];
}
