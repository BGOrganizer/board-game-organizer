import { organizationListRoles } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { organizationRoleFilter } from "../organization-list-filter";

it("distinguishes own administration, invitations, accepted membership and own requests", () => {
  expect(organizationRoleFilter("user", [])).toEqual({ $expr: false });
  const member = (status: string, kind?: string) => ({
    $and: [
      { adminUserId: { $ne: "user" } },
      { viewerMembershipRows: { $elemMatch: { status, ...(kind ? { kind } : {}) } } },
    ],
  });
  const filters = [
    { adminUserId: "user" },
    member("PENDING", "INVITATION"),
    member("ACCEPTED"),
    member("PENDING", "REQUEST"),
  ];
  expect(organizationRoleFilter("user", organizationListRoles)).toEqual({ $or: filters });
  for (const [index, role] of organizationListRoles.entries())
    expect(organizationRoleFilter("user", [role])).toEqual({ $or: [filters[index]] });
});
