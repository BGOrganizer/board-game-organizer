import { z } from "zod";

export const organizationListRoles = ["admin", "invited", "accepted", "requested"] as const;
export type OrganizationListRole = (typeof organizationListRoles)[number];
export const organizationListRolesSchema = z
  .string()
  .max(100)
  .default(organizationListRoles.join(","))
  .transform((value) => (value === "" ? [] : value.split(",")))
  .pipe(z.array(z.enum(organizationListRoles)).max(4));
