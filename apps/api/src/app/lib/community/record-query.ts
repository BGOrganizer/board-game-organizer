import { groupRecordListRoles, targetUserIdSchema } from "@board-game-organizer/schemas";
import { z } from "zod";
import { CommunityError } from "../community.error";

const instant = z.iso.datetime({ precision: 3 }),
  id = z.uuid();
const cursor = z
  .string()
  .max(100)
  .refine((value) => {
    const parts = value.split("|");
    return (
      parts.length === 2 && instant.safeParse(parts[0]).success && id.safeParse(parts[1]).success
    );
  });
export const emptyRecordQuery = z.object({}).strict();
export const recordPageQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    query: z.string().trim().min(4).max(120).optional(),
    cursor: cursor.optional(),
  })
  .strict();
export const groupInviteesQuery = recordPageQuery.extend({ cursor: targetUserIdSchema.optional() });
export const groupListQuery = recordPageQuery
  .extend({
    scope: z.enum(["mine", "public", "moderation"]).default("mine"),
    roles: z
      .string()
      .max(80)
      .regex(/^(admin|invited|accepted)(,(admin|invited|accepted))*$|^$/)
      .transform((value) => groupRecordListRoles.filter((role) => value.split(",").includes(role)))
      .optional(),
  })
  .refine(
    (value) =>
      (value.scope === "mine" || value.roles === undefined) &&
      (value.scope !== "public" || Boolean(value.query)),
  );
export const groupPeopleQuery = recordPageQuery
  .extend({
    mode: z.enum(["accepted", "pending", "bans"]).default("accepted"),
    cursor: z.union([cursor, z.literal("owner")]).optional(),
  })
  .refine((value) => value.cursor !== "owner" || value.mode === "accepted");
export const eventListQuery = recordPageQuery.extend({
  groupId: id.optional(),
  periods: z
    .string()
    .max(40)
    .regex(/^(past|future)(,(past|future))*$|^$/)
    .transform((value) =>
      (["past", "future"] as const).filter((period) => value.split(",").includes(period)),
    )
    .optional(),
});
export const eventTablesQuery = recordPageQuery.extend({
  cursor: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number.isSafeInteger(Number(value)))
    .optional(),
});
export const eventSeatsQuery = recordPageQuery.extend({
  pending: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  cursor: z
    .string()
    .max(130)
    .refine((value) => {
      const parts = value.split("|");
      return (
        parts.length === 3 &&
        instant.safeParse(parts[0]).success &&
        /^\d+$/.test(parts[1]) &&
        Number.isSafeInteger(Number(parts[1])) &&
        id.safeParse(parts[2]).success
      );
    })
    .optional(),
});
/** Route-specific strict fields; deployment bypass never becomes a domain filter. */
export function recordQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
    throw new CommunityError(400, "INVALID_QUERY");
  const bypass = params.get("x-vercel-protection-bypass");
  if (bypass !== null && !z.string().trim().min(1).max(512).safeParse(bypass).success)
    throw new CommunityError(400, "INVALID_QUERY");
  params.delete("x-vercel-protection-bypass");
  const parsed = schema.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new CommunityError(400, "INVALID_QUERY");
  return parsed.data;
}
