import { z } from "zod";
import { targetUserIdSchema } from "../dto/common";

export const groupInvitationStatusSchema = z.enum(["PENDING", "ACCEPTED", "DECLINED"]);
export type GroupInvitationStatus = z.infer<typeof groupInvitationStatusSchema>;

export const groupModel = z.object({
  id: z.uuid(),
  adminUserId: targetUserIdSchema,
  name: z.string().min(5).max(120),
  isPublic: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).optional(),
});
export type Group = z.infer<typeof groupModel>;

export const groupInvitationModel = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  inviterUserId: targetUserIdSchema,
  inviteeUserId: targetUserIdSchema,
  status: groupInvitationStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  respondedAt: z.iso.datetime({ offset: true }).optional(),
});
export type GroupInvitation = z.infer<typeof groupInvitationModel>;

export const GROUP_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { adminUserId: 1, createdAt: -1 } },
] as const;
export const GROUP_INVITATION_INDEXES = [
  { key: { id: 1 }, unique: true },
  { key: { groupId: 1, inviteeUserId: 1 }, unique: true },
  { key: { inviteeUserId: 1, status: 1, createdAt: -1 } },
] as const;
