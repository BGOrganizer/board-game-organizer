import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";
import { verifiedLocationSchema } from "../../locations/models/locations";

export const groupTypeSchema = z.enum(["PRIVATE", "PUBLIC"]);
export const groupRevisionSchema = z
  .object({
    name: z.string().trim().min(5).max(120),
    logoAssetId: z.uuid().optional(),
    location: verifiedLocationSchema.optional(),
  })
  .strict();
export type GroupRevision = z.infer<typeof groupRevisionSchema>;
export const groupRecordSchema = z
  .object({
    id: z.uuid(),
    adminUserId: targetUserIdSchema,
    type: groupTypeSchema,
    approved: groupRevisionSchema.optional(),
    proposal: groupRevisionSchema.optional(),
    reviewStatus: z.enum(["PENDING", "REJECTED"]).optional(),
    rejectionReason: z.string().trim().min(1).max(1000).optional(),
    reservedNames: z.array(z.string().min(1)),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((group, context) => {
    if (!group.approved && !group.proposal) {
      context.addIssue({
        code: "custom",
        path: ["approved"],
        message: "A group revision is required",
      });
    }
    if (group.type === "PRIVATE") {
      if (!group.approved || group.proposal || group.reviewStatus) {
        context.addIssue({
          code: "custom",
          path: ["type"],
          message: "Private groups do not use moderation",
        });
      }
    } else {
      if (group.reservedNames.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["reservedNames"],
          message: "Public group names must be reserved",
        });
      }
      for (const key of ["approved", "proposal"] as const) {
        const revision = group[key];
        if (revision && (!revision.logoAssetId || !revision.location)) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Public groups require a logo and verified venue",
          });
        }
      }
    }
  });
export type GroupRecord = z.infer<typeof groupRecordSchema>;
export const groupMembershipSchema = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    userId: targetUserIdSchema,
    kind: z.enum(["INVITATION", "REQUEST"]),
    status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "LEFT"]),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type GroupMembership = z.infer<typeof groupMembershipSchema>;
export const groupBanSchema = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    userId: targetUserIdSchema,
    adminUserId: targetUserIdSchema,
    until: z.iso.datetime({ offset: true }).nullable(),
    revokedAt: z.iso.datetime({ offset: true }).optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type GroupBan = z.infer<typeof groupBanSchema>;

export const GROUP_RECORD_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { adminUserId: 1, createdAt: -1, id: -1 } },
  { key: { reservedNames: 1 }, unique: true, partialFilterExpression: { type: "PUBLIC" } },
] as const;
export const GROUP_MEMBERSHIP_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { groupId: 1, userId: 1 }, unique: true },
  { key: { userId: 1, status: 1, createdAt: -1, id: -1 } },
] as const;
export const GROUP_BAN_INDEXES = [
  { key: { groupId: 1, userId: 1 }, unique: true },
  { key: { groupId: 1, createdAt: -1, id: -1 } },
] as const;
