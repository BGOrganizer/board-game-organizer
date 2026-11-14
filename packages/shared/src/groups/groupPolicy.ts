import type {
  GroupBan,
  GroupCapabilities,
  GroupMembership,
  GroupPersonResponse,
  GroupRecord,
  GroupRecordResponse,
  GroupViewerRole,
} from "@board-game-organizer/schemas";

export type GroupPersonAction =
  | "approve"
  | "reject"
  | "remove"
  | "ban"
  | "revoke"
  | "promote"
  | "demote";
export function isGroupManagerRole(role: GroupViewerRole) {
  return role === "admin" || role === "moderator";
}
export function isGroupModerator(membership: GroupMembership | null) {
  return membership?.status === "ACCEPTED" && membership.role === "MODERATOR";
}
export function groupPersonActions(
  group: Pick<GroupRecordResponse, "role">,
  person: Pick<GroupPersonResponse, "isAdmin" | "membership" | "ban">,
): GroupPersonAction[] {
  if (!isGroupManagerRole(group.role) || person.isAdmin) return [];
  if (group.role === "moderator" && isGroupModerator(person.membership)) return [];
  if (person.ban && !person.ban.revokedAt) return ["revoke"];
  if (person.membership?.status === "PENDING")
    return person.membership.kind === "REQUEST" ? ["approve", "reject", "ban"] : ["remove", "ban"];
  if (person.membership?.status === "ACCEPTED")
    return [
      "remove",
      "ban",
      ...(group.role === "admin"
        ? [isGroupModerator(person.membership) ? ("demote" as const) : ("promote" as const)]
        : []),
    ];
  return [];
}

export type OwnGroupAction = "request" | "accept" | "decline" | "cancel";
export function ownGroupActions(
  group: Pick<GroupRecordResponse, "role" | "type" | "approved" | "myMembership">,
): OwnGroupAction[] {
  if (group.role === "admin") return [];
  if (group.myMembership?.status === "PENDING")
    return group.myMembership.kind === "INVITATION" ? ["accept", "decline"] : ["cancel"];
  if (group.role === "accepted" || group.role === "moderator") return ["cancel"];
  return group.type === "PUBLIC" && group.approved ? ["request"] : [];
}

export function groupBanIsActive(ban: GroupBan | null, now: number): boolean {
  return Boolean(ban && !ban.revokedAt && (ban.until === null || Date.parse(ban.until) > now));
}
export function groupViewerRole(
  group: GroupRecord,
  userId: string,
  membership: GroupMembership | null,
): GroupViewerRole {
  if (group.adminUserId === userId) return "admin";
  if (isGroupModerator(membership)) return "moderator";
  if (membership?.status === "ACCEPTED") return "accepted";
  if (membership?.status === "PENDING")
    return membership.kind === "INVITATION" ? "invited" : "requested";
  return "none";
}
export function groupCapabilities(
  group: GroupRecord,
  userId: string,
  membership: GroupMembership | null,
  ban: GroupBan | null,
  now: number,
): GroupCapabilities {
  const role = groupViewerRole(group, userId, membership);
  const banned = groupBanIsActive(ban, now);
  const active = !banned && Boolean(group.approved);
  const manager = isGroupManagerRole(role);
  const member = active && (manager || role === "accepted");
  const pending = active && (role === "invited" || role === "requested");
  return {
    canViewMembers: member || pending || (active && group.type === "PUBLIC"),
    canViewEvents: member,
    canViewRankings: member,
    canSocialInteract: member,
    canInvite: active && manager,
    canEdit: !banned && manager,
  };
}
export function canReadGroup(
  group: GroupRecord,
  userId: string,
  membership: GroupMembership | null,
  ban: GroupBan | null,
  now: number,
  moderator = false,
): boolean {
  if (moderator && group.type === "PUBLIC") return true;
  if (groupBanIsActive(ban, now)) return false;
  const role = groupViewerRole(group, userId, membership);
  return (
    isGroupManagerRole(role) ||
    (Boolean(group.approved) &&
      (group.type === "PUBLIC" || role === "accepted" || role === "invited"))
  );
}
