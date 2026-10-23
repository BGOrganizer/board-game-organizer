import type {
  GroupBan,
  GroupCapabilities,
  GroupMembership,
  GroupPersonResponse,
  GroupRecord,
  GroupRecordResponse,
  GroupViewerRole,
} from "@board-game-organizer/schemas";

export type GroupPersonAction = "approve" | "reject" | "remove" | "ban" | "revoke";
export function groupPersonActions(
  group: Pick<GroupRecordResponse, "role">,
  person: Pick<GroupPersonResponse, "isAdmin" | "membership" | "ban">,
): GroupPersonAction[] {
  if (group.role !== "admin" || person.isAdmin) return [];
  if (person.ban && !person.ban.revokedAt) return ["revoke"];
  if (person.membership?.status === "PENDING")
    return person.membership.kind === "REQUEST" ? ["approve", "reject", "ban"] : ["remove", "ban"];
  if (person.membership?.status === "ACCEPTED") return ["remove", "ban"];
  return [];
}

export type OwnGroupAction = "request" | "accept" | "decline" | "cancel";
export function ownGroupActions(
  group: Pick<GroupRecordResponse, "role" | "type" | "approved" | "myMembership">,
): OwnGroupAction[] {
  if (group.role === "admin") return [];
  if (group.myMembership?.status === "PENDING")
    return group.myMembership.kind === "INVITATION" ? ["accept", "decline"] : ["cancel"];
  if (group.role === "accepted") return ["cancel"];
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
  const member = active && (role === "admin" || role === "accepted");
  const pending = active && (role === "invited" || role === "requested");
  return {
    canViewMembers: member || pending,
    canViewEvents: member,
    canViewRankings: member,
    canSocialInteract: member,
    canInvite: active && role === "admin",
    canEdit: !banned && role === "admin",
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
    role === "admin" ||
    (Boolean(group.approved) &&
      (group.type === "PUBLIC" || role === "accepted" || role === "invited"))
  );
}
