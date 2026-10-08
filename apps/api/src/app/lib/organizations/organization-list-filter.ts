import type { OrganizationListRole } from "@board-game-organizer/schemas";

export function organizationRoleFilter(userId: string, roles: readonly OrganizationListRole[]) {
  const membership = (status: string, kind?: string) => ({
    $and: [
      { adminUserId: { $ne: userId } },
      { viewerMembershipRows: { $elemMatch: { status, ...(kind ? { kind } : {}) } } },
    ],
  });
  const filters = {
    admin: { adminUserId: userId },
    invited: membership("PENDING", "INVITATION"),
    accepted: membership("ACCEPTED"),
    requested: membership("PENDING", "REQUEST"),
  };
  return roles.length ? { $or: roles.map((role) => filters[role]) } : { $expr: false };
}
