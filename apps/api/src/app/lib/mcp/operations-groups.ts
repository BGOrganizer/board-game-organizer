import {
  banGroupUserSchema,
  createGroupRecordSchema,
  decideGroupMembershipSchema,
  decideGroupReviewSchema,
  deleteGroupRecordSchema,
  editGroupRecordSchema,
  inviteGroupMemberSchema,
  leaderboardQuerySchema,
  startGroupLogoSchema,
  uploadGroupLogoChunkSchema,
} from "@board-game-organizer/schemas";
import * as groupAssetsAssetIdCompleteRoute from "@/app/api/group-assets/[assetId]/complete/route";
import * as groupAssetsAssetIdRoute from "@/app/api/group-assets/[assetId]/route";
import * as groupAssetsRoute from "@/app/api/group-assets/route";
import * as groupsGroupIdBansUserIdRoute from "@/app/api/groups/[groupId]/bans/[userId]/route";
import * as groupsGroupIdBansRoute from "@/app/api/groups/[groupId]/bans/route";
import * as groupsGroupIdInviteesRoute from "@/app/api/groups/[groupId]/invitees/route";
import * as groupsGroupIdLeaderboardRoute from "@/app/api/groups/[groupId]/leaderboard/route";
import * as groupsGroupIdMembersUserIdRoute from "@/app/api/groups/[groupId]/members/[userId]/route";
import * as groupsGroupIdMembersRoute from "@/app/api/groups/[groupId]/members/route";
import * as groupsGroupIdMembershipRoute from "@/app/api/groups/[groupId]/membership/route";
import * as groupsGroupIdReviewRoute from "@/app/api/groups/[groupId]/review/route";
import * as groupsGroupIdRoute from "@/app/api/groups/[groupId]/route";
import * as groupsDiscoveryRoute from "@/app/api/groups/discovery/route";
import * as groupsRoute from "@/app/api/groups/route";
import {
  groupInviteesQuery,
  groupListQuery,
  groupPeopleQuery,
  recordPageQuery,
} from "@/app/lib/community/record-query";
import { defineOperation } from "./operation";

const groupDiscoveryQuery = recordPageQuery.required({ query: true });
export const groupsOperations = [
  defineOperation({
    name: "list_groups",
    description:
      "List your groups or search public groups by name. The moderation scope requires reviewer permission.",
    path: "/api/groups",
    method: "GET",
    handler: groupsRoute.GET,
    query: groupListQuery,
  }),
  defineOperation({
    name: "create_group",
    description:
      "Create a private or public BGO group. Public groups require a verified venue and an uploaded logo.",
    path: "/api/groups",
    method: "POST",
    handler: groupsRoute.POST,
    body: createGroupRecordSchema,
  }),
  defineOperation({
    name: "discover_groups",
    description: "Search for visible public BGO groups by name using at least four characters.",
    path: "/api/groups/discovery",
    method: "GET",
    handler: groupsDiscoveryRoute.GET,
    query: groupDiscoveryQuery,
  }),
  defineOperation({
    name: "get_group",
    description: "Get a group, membership state and the actions available to you.",
    path: "/api/groups/[groupId]",
    method: "GET",
    handler: groupsGroupIdRoute.GET,
  }),
  defineOperation({
    name: "update_group",
    description: "Edit the settings, name, description, venue or logo of a group you can manage.",
    path: "/api/groups/[groupId]",
    method: "PATCH",
    handler: groupsGroupIdRoute.PATCH,
    body: editGroupRecordSchema,
  }),
  defineOperation({
    name: "delete_group",
    description:
      "Delete a group and its events when you have permission and the current revision matches.",
    path: "/api/groups/[groupId]",
    method: "DELETE",
    handler: groupsGroupIdRoute.DELETE,
    body: deleteGroupRecordSchema,
  }),
  defineOperation({
    name: "request_group_membership",
    description: "Request membership in a public BGO group on your own behalf.",
    path: "/api/groups/[groupId]/membership",
    method: "POST",
    handler: groupsGroupIdMembershipRoute.POST,
  }),
  defineOperation({
    name: "list_group_members",
    description: "List accepted members or, when authorized, pending requests or bans for a group.",
    path: "/api/groups/[groupId]/members",
    method: "GET",
    handler: groupsGroupIdMembersRoute.GET,
    query: groupPeopleQuery,
  }),
  defineOperation({
    name: "invite_group_member",
    description: "Invite a registered BGO user to a group you manage.",
    path: "/api/groups/[groupId]/members",
    method: "POST",
    handler: groupsGroupIdMembersRoute.POST,
    body: inviteGroupMemberSchema,
  }),
  defineOperation({
    name: "change_group_membership",
    description:
      "Respond to a group invitation or manage the membership of the specified user according to your role.",
    path: "/api/groups/[groupId]/members/[userId]",
    method: "PATCH",
    handler: groupsGroupIdMembersUserIdRoute.PATCH,
    body: decideGroupMembershipSchema,
  }),
  defineOperation({
    name: "list_group_invitees",
    description: "Find BGO users you can invite to a group.",
    path: "/api/groups/[groupId]/invitees",
    method: "GET",
    handler: groupsGroupIdInviteesRoute.GET,
    query: groupInviteesQuery,
  }),
  defineOperation({
    name: "ban_group_member",
    description: "Ban a user from a group you manage.",
    path: "/api/groups/[groupId]/bans",
    method: "POST",
    handler: groupsGroupIdBansRoute.POST,
    body: banGroupUserSchema,
  }),
  defineOperation({
    name: "revoke_group_ban",
    description: "Revoke an existing user ban from a group you manage.",
    path: "/api/groups/[groupId]/bans/[userId]",
    method: "DELETE",
    handler: groupsGroupIdBansUserIdRoute.DELETE,
  }),
  defineOperation({
    name: "get_group_moderation_review",
    description:
      "Get the moderation details for a public group when you are an authorized reviewer.",
    path: "/api/groups/[groupId]/review",
    method: "GET",
    handler: groupsGroupIdReviewRoute.GET,
  }),
  defineOperation({
    name: "decide_group_moderation_review",
    description: "Decide a public group review when you are an authorized reviewer.",
    path: "/api/groups/[groupId]/review",
    method: "PATCH",
    handler: groupsGroupIdReviewRoute.PATCH,
    body: decideGroupReviewSchema,
  }),
  defineOperation({
    name: "list_group_leaderboard",
    description: "List OpenSkill rankings based on rated games in a group you can view.",
    path: "/api/groups/[groupId]/leaderboard",
    method: "GET",
    handler: groupsGroupIdLeaderboardRoute.GET,
    query: leaderboardQuerySchema,
  }),
  defineOperation({
    name: "start_group_logo",
    description: "Start an upload for a custom BGO group logo.",
    path: "/api/group-assets",
    method: "POST",
    handler: groupAssetsRoute.POST,
    body: startGroupLogoSchema,
  }),
  defineOperation({
    name: "get_group_logo_preview",
    description: "Get the preview image of a group logo asset you are authorized to view.",
    path: "/api/group-assets/[assetId]",
    method: "GET",
    handler: groupAssetsAssetIdRoute.GET,
  }),
  defineOperation({
    name: "upload_group_logo_chunk",
    description: "Upload the next encoded chunk of an image to a group logo upload you started.",
    path: "/api/group-assets/[assetId]",
    method: "PATCH",
    handler: groupAssetsAssetIdRoute.PATCH,
    body: uploadGroupLogoChunkSchema,
    sensitive: true,
  }),
  defineOperation({
    name: "complete_group_logo",
    description: "Finish a group logo upload and obtain the asset for group creation or editing.",
    path: "/api/group-assets/[assetId]/complete",
    method: "POST",
    handler: groupAssetsAssetIdCompleteRoute.POST,
  }),
];
