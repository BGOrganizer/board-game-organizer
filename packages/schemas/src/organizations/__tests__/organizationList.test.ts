import { describe, expect, it } from "vitest";
import { organizationListRoles, organizationListRolesSchema } from "../dto/organizationList";

describe("organization membership list roles", () => {
  it("defaults to every role, including own requests, and accepts explicit empty selections", () => {
    expect(organizationListRolesSchema.parse(undefined)).toEqual(organizationListRoles);
    expect(organizationListRolesSchema.parse("")).toEqual([]);
    for (const role of organizationListRoles)
      expect(organizationListRolesSchema.parse(role)).toEqual([role]);
    expect(organizationListRolesSchema.parse("requested,invited")).toEqual([
      "requested",
      "invited",
    ]);
  });
  it.each([
    "owner",
    "accepted, requested",
    "admin,invited,accepted,requested,admin",
    "x".repeat(101),
    null,
    [],
  ])("rejects invalid roles %j", (value) => {
    expect(organizationListRolesSchema.safeParse(value).success).toBe(false);
  });
});
