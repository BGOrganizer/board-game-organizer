import type {
  OrganizationMemberResponse,
  OrganizationMembershipAction,
  OrganizationResponse,
} from "@board-game-organizer/schemas";
export type OrganizationAction = OrganizationMembershipAction["action"] | "request";
export function ownOrganizationActions(organization: OrganizationResponse): OrganizationAction[] {
  switch (organization.role) {
    case "invited":
      return ["accept", "decline"];
    case "accepted":
    case "requested":
      return ["cancel"];
    case "none":
      return organization.approved ? ["request"] : [];
    default:
      return [];
  }
}
export function organizationMemberActions(
  organization: OrganizationResponse,
  person: OrganizationMemberResponse,
): OrganizationAction[] {
  if (organization.role !== "admin" || person.isAdmin || !person.membership) return [];
  switch (person.membership.status) {
    case "PENDING":
      return person.membership.kind === "REQUEST"
        ? ["approve", "reject", "remove", "ban"]
        : ["remove", "ban"];
    case "ACCEPTED":
      return ["remove", "ban"];
    case "EXCLUDED":
      return ["revoke"];
    default:
      return [];
  }
}
export function organizationActionLabel(
  action: OrganizationAction,
  role?: OrganizationResponse["role"],
): string {
  if (action === "cancel") return role === "requested" ? "Cancel request" : "Leave organization";
  return {
    request: "Request membership",
    accept: "Accept invitation",
    decline: "Decline invitation",
    approve: "Approve request",
    reject: "Reject request",
    remove: "Remove member",
    ban: "Exclude member",
    revoke: "Revoke exclusion",
  }[action];
}
export function organizationActionMessage(
  action: OrganizationAction,
  role?: OrganizationResponse["role"],
) {
  return {
    id: `organization.action.${action}${action === "cancel" ? (role === "requested" ? ".request" : ".leave") : ""}`,
    message: organizationActionLabel(action, role),
  };
}
export function isDestructiveOrganizationAction(action: OrganizationAction) {
  return action === "cancel" || action === "remove" || action === "ban";
}
