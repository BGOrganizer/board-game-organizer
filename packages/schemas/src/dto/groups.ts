import { z } from "zod";
import { groupInvitationStatusSchema } from "../models/groups";
import { targetUserIdSchema } from "./common";

const inviteeIdsSchema = z
  .array(targetUserIdSchema)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Invitations must be unique",
  });

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(5).max(120),
    isPublic: z.boolean(),
    invitedUserIds: inviteeIdsSchema,
  })
  .strict();
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = createGroupSchema;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const groupInvitationResponseSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  inviteeUserId: z.string(),
  status: groupInvitationStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GroupInvitationResponse = z.infer<typeof groupInvitationResponseSchema>;

export const groupResponseSchema = z.object({
  id: z.uuid(),
  adminUserId: z.string(),
  name: z.string(),
  isPublic: z.boolean(),
  memberCount: z.number().int().positive(),
  invitations: z.array(groupInvitationResponseSchema),
  memberProfiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      avatarUrl: z.string().nullable(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GroupResponse = z.infer<typeof groupResponseSchema>;

export const respondGroupInvitationSchema = z
  .object({
    decision: z.enum(["accept", "decline"]),
  })
  .strict();
