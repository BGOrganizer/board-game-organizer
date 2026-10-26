import { z } from "zod";
import { targetUserIdSchema } from "../../common/dto/common";
import {
  GROUP_LOGO_CHUNK_BYTES,
  GROUP_LOGO_MAX_BYTES,
  groupLogoMimeSchema,
} from "../models/groupAssets";
import {
  type GroupBan,
  type GroupMembership,
  type GroupRecord,
  type GroupRevision,
  groupRevisionSchema,
} from "../models/groupRecord";

const invitedUsers = z
  .array(targetUserIdSchema)
  .refine((ids) => new Set(ids).size === ids.length, "Invitations must be unique");
export const groupRecordListRoles = ["admin", "invited", "accepted"] as const;
export type GroupRecordListRole = (typeof groupRecordListRoles)[number];

export const createGroupRecordSchema = z.discriminatedUnion("type", [
  groupRevisionSchema.extend({ type: z.literal("PRIVATE"), invitedUserIds: invitedUsers }).strict(),
  groupRevisionSchema
    .required({ logoAssetId: true, location: true })
    .extend({ type: z.literal("PUBLIC"), invitedUserIds: invitedUsers })
    .strict(),
]);
export type CreateGroupRecordInput = z.infer<typeof createGroupRecordSchema>;
export const editGroupRecordSchema = groupRevisionSchema
  .extend({ version: z.number().int().positive() })
  .strict();
export type EditGroupRecordInput = z.infer<typeof editGroupRecordSchema>;
export const deleteGroupRecordSchema = z
  .object({ version: z.number().int().positive(), deleteEvents: z.literal(true) })
  .strict();
export type DeleteGroupRecordInput = z.infer<typeof deleteGroupRecordSchema>;
export interface DeletedGroupRecordResponse {
  id: string;
  eventIds: string[];
}
export const decideGroupReviewSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), version: z.number().int().positive() }).strict(),
  z
    .object({
      decision: z.literal("reject"),
      version: z.number().int().positive(),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export type DecideGroupReviewInput = z.infer<typeof decideGroupReviewSchema>;
export const inviteGroupMemberSchema = z.object({ userId: targetUserIdSchema }).strict();
export const decideGroupMembershipSchema = z
  .object({
    action: z.enum(["accept", "decline", "approve", "reject", "cancel", "remove"]),
    version: z.number().int().positive(),
  })
  .strict();
export type DecideGroupMembershipInput = z.infer<typeof decideGroupMembershipSchema>;
export const banGroupUserSchema = z
  .object({ userId: targetUserIdSchema, until: z.iso.datetime({ offset: true }).nullable() })
  .strict();
export type BanGroupUserInput = z.infer<typeof banGroupUserSchema>;
export const startGroupLogoSchema = z
  .object({
    mimeType: groupLogoMimeSchema,
    byteLength: z.number().int().min(1).max(GROUP_LOGO_MAX_BYTES),
  })
  .strict();
export type StartGroupLogoInput = z.infer<typeof startGroupLogoSchema>;
export const uploadGroupLogoChunkSchema = z
  .object({
    offset: z.number().int().min(0).max(GROUP_LOGO_MAX_BYTES),
    base64: z
      .string()
      .min(4)
      .max(Math.ceil(GROUP_LOGO_CHUNK_BYTES / 3) * 4)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  })
  .strict();
export type UploadGroupLogoChunkInput = z.infer<typeof uploadGroupLogoChunkSchema>;
export const revokeGroupBanSchema = z.object({ userId: targetUserIdSchema }).strict();
export type GroupViewerRole = "admin" | "accepted" | "invited" | "requested" | "none";
export interface GroupCapabilities {
  canViewMembers: boolean;
  canViewEvents: boolean;
  canViewRankings: boolean;
  canSocialInteract: boolean;
  canInvite: boolean;
  canEdit: boolean;
}
export type GroupRecordResponse = GroupRecord &
  GroupCapabilities & {
    name: string;
    logoAssetId?: string;
    location?: GroupRevision["location"];
    logo: string | null;
    role: GroupViewerRole;
    memberCount: number;
    eventCount: number | null;
    myMembership: GroupMembership | null;
  };
export interface GroupPersonResponse {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  membership: GroupMembership | null;
  ban: GroupBan | null;
  social?: {
    isFollowing: boolean;
    isFollower: boolean;
    isFriend: boolean;
    blockedByMe: boolean;
    friendRequest?: "incoming" | "outgoing";
  };
}
