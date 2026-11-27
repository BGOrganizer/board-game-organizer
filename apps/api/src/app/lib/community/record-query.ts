import {
  eventListSections,
  eventListStatusesSchema,
  groupDiscoveryRadiusInputSchema,
  groupRecordListRoles,
  groupTypeSchema,
  recordListSortFields,
  scheduledEventFilterRoles,
  tableListSections,
  targetUserIdSchema,
} from "@board-game-organizer/schemas";
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
export const eventProposalsQuery = recordPageQuery
  .omit({ query: true })
  .extend({
    mode: z.enum(["mine", "review"]).default("mine"),
    kind: z.enum(["date", "location", "game"]),
    tableId: id.optional(),
    clientRequestId: id.optional(),
  })
  .refine(
    (value) =>
      (value.kind === "game") === Boolean(value.tableId) &&
      (!value.clientRequestId || value.mode === "mine"),
  );
export const groupInviteesQuery = recordPageQuery.extend({ cursor: targetUserIdSchema.optional() });
export const eventParticipantsQuery = recordPageQuery.omit({ query: true }).extend({
  cursor: targetUserIdSchema.optional(),
  view: z.enum(["member", "review"]).default("member"),
});
const filterQuery = z.string().trim().min(1).max(120).optional();
const groupRole = groupRecordListRoles.join("|");
const recordNameCursor = z
  .string()
  .max(165)
  .refine((value) => {
    const separator = value.lastIndexOf("|");
    return (
      value.startsWith("name:") && separator > 5 && id.safeParse(value.slice(separator + 1)).success
    );
  });
// A nonempty decimal string avoids coercing a missing coordinate to zero.
const discoveryCoordinate = z
  .string()
  .trim()
  .max(32)
  .regex(/^-?(?:\d+(?:\.\d+)?|\.\d+)$/);
export const groupListQuery = recordPageQuery
  .extend({
    query: z.string().trim().max(120).optional(),
    friends: z
      .literal("true")
      .transform(() => true as const)
      .optional(),
    nearLat: discoveryCoordinate.transform(Number).pipe(z.number().min(-90).max(90)).optional(),
    nearLng: discoveryCoordinate.transform(Number).pipe(z.number().min(-180).max(180)).optional(),
    radiusKm: groupDiscoveryRadiusInputSchema.optional(),
    scope: z.enum(["mine", "public", "moderation"]).default("mine"),
    type: groupTypeSchema.optional(),
    sort: z.enum(recordListSortFields).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    cursor: z.union([cursor, recordNameCursor]).optional(),
    roles: z
      .string()
      .max(80)
      .regex(new RegExp(`^(?:(?:${groupRole})(?:,(?:${groupRole}))*)?$`))
      .transform((value) => groupRecordListRoles.filter((role) => value.split(",").includes(role)))
      .optional(),
  })
  .refine(
    (value) =>
      (value.scope === "mine" ||
        (value.roles === undefined &&
          value.type === undefined &&
          value.sort === undefined &&
          value.direction === undefined)) &&
      (value.cursor === undefined ||
        value.cursor.startsWith("name:") === (value.sort === "name")) &&
      (value.nearLat === undefined) === (value.nearLng === undefined) &&
      (value.radiusKm === undefined || value.nearLat !== undefined) &&
      (value.scope === "public" ||
        (value.friends === undefined &&
          value.nearLat === undefined &&
          (value.query === undefined || value.query.length >= (value.scope === "mine" ? 1 : 4)))),
  );
export const groupPeopleQuery = recordPageQuery
  .extend({
    mode: z.enum(["accepted", "pending", "bans"]).default("accepted"),
    cursor: z.union([cursor, z.literal("owner")]).optional(),
  })
  .refine((value) => value.cursor !== "owner" || value.mode === "accepted");
const eventFilterPageQuery = recordPageQuery.extend({
  query: filterQuery,
  statuses: eventListStatusesSchema.optional(),
  periods: z
    .string()
    .max(40)
    .regex(/^(past|future)(,(past|future))*$|^$/)
    .transform((value) =>
      (["past", "future"] as const).filter((period) => value.split(",").includes(period)),
    )
    .optional(),
});
export const eventListQuery = eventFilterPageQuery
  .extend({
    groupId: id.optional(),
    section: z.enum(eventListSections).optional(),
    roles: z
      .string()
      .max(80)
      .transform((value) => (value ? value.split(",") : []))
      .pipe(z.array(z.enum(scheduledEventFilterRoles)))
      .transform((roles) => scheduledEventFilterRoles.filter((role) => roles.includes(role)))
      .optional(),
    sort: z.enum(recordListSortFields).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    cursor: z.union([cursor, recordNameCursor]).optional(),
  })
  .refine(
    (value) =>
      (!value.groupId || value.section === undefined) &&
      (value.roles === undefined ||
        value.section === "mine" ||
        (value.section === "terminated" && !value.roles.includes("pending"))) &&
      ((value.sort === undefined && value.direction === undefined) ||
        value.section !== undefined ||
        value.groupId !== undefined) &&
      (value.cursor === undefined || value.cursor.startsWith("name:") === (value.sort === "name")),
  );
export const personalTablesQuery = eventFilterPageQuery.extend({
  section: z.enum(tableListSections).optional(),
});
export const eventTablesQuery = recordPageQuery.extend({
  cursor: z
    .string()
    .regex(/^\d+$/)
    .refine((value) => Number.isSafeInteger(Number(value)))
    .optional(),
});
export const tableLeaderboardQuery = eventTablesQuery.omit({ query: true });
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
