import {
  claimInviteParamsSchema,
  createInviteParamsSchema,
  notificationAttentionQuerySchema,
  notificationChangesQuerySchema,
  notificationListQuerySchema,
  notificationNavigationQuerySchema,
  presenceUpdateParamsSchema,
  pushSubscriptionSchema,
  readNotificationAttentionSchema,
  readNotificationChangesSchema,
  removePushSubscriptionSchema,
  searchContactsParamsSchema,
  syncContactsSchema,
} from "@board-game-organizer/schemas";
import { z } from "zod";
import * as blocksTargetUserIdRoute from "@/app/api/blocks/[targetUserId]/route";
import * as blocksRoute from "@/app/api/blocks/route";
import * as contactsSyncRoute from "@/app/api/contacts/sync/route";
import * as followsTargetUserIdRoute from "@/app/api/follows/[targetUserId]/route";
import * as followsRoute from "@/app/api/follows/route";
import * as friendRequestsTargetUserIdRoute from "@/app/api/friend-requests/[targetUserId]/route";
import * as friendRequestsRoute from "@/app/api/friend-requests/route";
import * as friendsTargetUserIdRoute from "@/app/api/friends/[targetUserId]/route";
import * as friendsRoute from "@/app/api/friends/route";
import * as invitesTokenRoute from "@/app/api/invites/[token]/route";
import * as invitesClaimRoute from "@/app/api/invites/claim/route";
import * as invitesRoute from "@/app/api/invites/route";
import * as notificationsNotificationIdRoute from "@/app/api/notifications/[notificationId]/route";
import * as notificationsAttentionRoute from "@/app/api/notifications/attention/route";
import * as notificationsChangesRoute from "@/app/api/notifications/changes/route";
import * as notificationsRoute from "@/app/api/notifications/route";
import * as pushSubscriptionsRoute from "@/app/api/push-subscriptions/route";
import * as relationshipsRoute from "@/app/api/relationships/route";
import * as usersPresenceRoute from "@/app/api/users/presence/route";
import * as usersSearchRoute from "@/app/api/users/search/route";
import * as usersSuggestionsRoute from "@/app/api/users/suggestions/route";
import { targetUserIdSchema } from "@/app/lib/contacts/relationship.http";
import { defineOperation } from "./operation";

const cursor = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
  .optional();
const limit = z.coerce.number().int().min(1).max(50).optional();
const relationshipListQuery = z.strictObject({
  type: z.enum(["followers", "following", "friends", "pending", "sent", "blocked"]),
  limit,
  cursor,
});
const relationshipCreateQuery = z.strictObject({
  type: z.enum(["follow", "friend_request", "block"]),
});
const relationshipAcceptQuery = z.strictObject({ type: z.literal("friend_request") });
const relationshipRemoveQuery = z.strictObject({
  type: z.enum(["follow", "friend_request", "friend", "block"]),
});
const relationshipTargetBody = z.strictObject({ targetUserId: targetUserIdSchema });
const followListQuery = z.strictObject({ direction: z.enum(["following", "followers"]) });
const friendRequestListQuery = z.strictObject({ direction: z.enum(["incoming", "outgoing"]) });
const friendRequestDecisionBody = z.strictObject({ decision: z.enum(["accept", "reject"]) });
const userSearchQuery = searchContactsParamsSchema.strict().extend({
  query: z.string().trim().min(4).max(100),
  limit: searchContactsParamsSchema.shape.limit.default(50),
});
const suggestionsQuery = z.strictObject({ limit, cursor, scope: z.literal("contacts").optional() });

export const socialOperations = [
  defineOperation({
    name: "list_notifications",
    description: "List your notifications, the unread count and related navigation indicators.",
    path: "/api/notifications",
    method: "GET",
    handler: notificationsRoute.GET,
    query: notificationListQuerySchema.omit({ "x-vercel-protection-bypass": true }),
  }),
  defineOperation({
    name: "mark_all_notifications_read",
    description: "Mark all notifications as read on your account.",
    path: "/api/notifications",
    method: "PATCH",
    handler: notificationsRoute.PATCH,
  }),
  defineOperation({
    name: "delete_all_notifications",
    description: "Permanently delete every notification on your account.",
    path: "/api/notifications",
    method: "DELETE",
    handler: notificationsRoute.DELETE,
  }),
  defineOperation({
    name: "mark_notification_read",
    description: "Mark one notification on your account as read.",
    path: "/api/notifications/[notificationId]",
    method: "PATCH",
    handler: notificationsNotificationIdRoute.PATCH,
  }),
  defineOperation({
    name: "delete_notification",
    description: "Permanently delete one notification on your account.",
    path: "/api/notifications/[notificationId]",
    method: "DELETE",
    handler: notificationsNotificationIdRoute.DELETE,
  }),
  defineOperation({
    name: "get_notification_attention",
    description: "Read the unread count and signaling indicators for your selected BGO items.",
    path: "/api/notifications/attention",
    method: "GET",
    handler: notificationsAttentionRoute.GET,
    query: notificationAttentionQuerySchema.omit({ "x-vercel-protection-bypass": true }),
  }),
  defineOperation({
    name: "read_notification_attention",
    description:
      "Mark specified notification items as read while preserving outstanding invitations.",
    path: "/api/notifications/attention",
    method: "PATCH",
    handler: notificationsAttentionRoute.PATCH,
    query: notificationNavigationQuerySchema,
    body: readNotificationAttentionSchema,
  }),
  defineOperation({
    name: "list_notification_changes",
    description: "Get the notification changes about a specified group, event or table.",
    path: "/api/notifications/changes",
    method: "GET",
    handler: notificationsChangesRoute.GET,
    query: notificationChangesQuerySchema.omit({ "x-vercel-protection-bypass": true }),
  }),
  defineOperation({
    name: "read_notification_changes",
    description: "Mark the specified changes for a group, event or table as read.",
    path: "/api/notifications/changes",
    method: "PATCH",
    handler: notificationsChangesRoute.PATCH,
    query: notificationNavigationQuerySchema,
    body: readNotificationChangesSchema,
  }),
  defineOperation({
    name: "register_push_subscription",
    description: "Register your current device for BGO push notifications using its device token.",
    path: "/api/push-subscriptions",
    method: "POST",
    handler: pushSubscriptionsRoute.POST,
    body: pushSubscriptionSchema,
    sensitive: true,
  }),
  defineOperation({
    name: "remove_push_subscription",
    description: "Unregister a push notification token from your account.",
    path: "/api/push-subscriptions",
    method: "DELETE",
    handler: pushSubscriptionsRoute.DELETE,
    body: removePushSubscriptionSchema,
    sensitive: true,
  }),
  defineOperation({
    name: "create_invite",
    description: "Create an invitation link for a new BGO contact or an eligible private table.",
    path: "/api/invites",
    method: "POST",
    handler: invitesRoute.POST,
    body: createInviteParamsSchema.default({}),
  }),
  defineOperation({
    name: "get_invite",
    description: "Inspect a BGO invitation before accepting it.",
    path: "/api/invites/[token]",
    method: "GET",
    handler: invitesTokenRoute.GET,
  }),
  defineOperation({
    name: "claim_invite",
    description: "Accept a BGO contact or table invitation and submit its required preferences.",
    path: "/api/invites/claim",
    method: "POST",
    handler: invitesClaimRoute.POST,
    body: claimInviteParamsSchema,
  }),
  defineOperation({
    name: "list_relationships",
    description: "List followers, following, friends, received or sent requests, or blocked users.",
    path: "/api/relationships",
    method: "GET",
    handler: relationshipsRoute.GET,
    query: relationshipListQuery,
  }),
  defineOperation({
    name: "create_relationship",
    description: "Follow, request friendship with, or block a BGO user.",
    path: "/api/relationships",
    method: "POST",
    handler: relationshipsRoute.POST,
    query: relationshipCreateQuery,
    body: relationshipTargetBody,
  }),
  defineOperation({
    name: "accept_relationship_friend_request",
    description: "Accept an incoming friend request from a BGO user.",
    path: "/api/relationships",
    method: "PATCH",
    handler: relationshipsRoute.PATCH,
    query: relationshipAcceptQuery,
    body: relationshipTargetBody,
  }),
  defineOperation({
    name: "remove_relationship",
    description: "Unfollow, cancel a sent request, remove a friend, or unblock a BGO user.",
    path: "/api/relationships",
    method: "DELETE",
    handler: relationshipsRoute.DELETE,
    query: relationshipRemoveQuery,
    body: relationshipTargetBody,
  }),
  defineOperation({
    name: "list_blocked_users",
    description: "List the BGO users you blocked.",
    path: "/api/blocks",
    method: "GET",
    handler: blocksRoute.GET,
  }),
  defineOperation({
    name: "block_user",
    description: "Block a BGO user, removing your outgoing follow and unresolved friend requests.",
    path: "/api/blocks/[targetUserId]",
    method: "PUT",
    handler: blocksTargetUserIdRoute.PUT,
  }),
  defineOperation({
    name: "unblock_user",
    description: "Remove your block on a BGO user.",
    path: "/api/blocks/[targetUserId]",
    method: "DELETE",
    handler: blocksTargetUserIdRoute.DELETE,
  }),
  defineOperation({
    name: "list_follows",
    description: "List incoming followers or the BGO users you follow.",
    path: "/api/follows",
    method: "GET",
    handler: followsRoute.GET,
    query: followListQuery,
  }),
  defineOperation({
    name: "follow_user",
    description: "Start following a BGO user.",
    path: "/api/follows/[targetUserId]",
    method: "PUT",
    handler: followsTargetUserIdRoute.PUT,
  }),
  defineOperation({
    name: "unfollow_user",
    description: "Stop following a BGO user.",
    path: "/api/follows/[targetUserId]",
    method: "DELETE",
    handler: followsTargetUserIdRoute.DELETE,
  }),
  defineOperation({
    name: "list_friend_requests",
    description: "List your incoming or outgoing BGO friend requests.",
    path: "/api/friend-requests",
    method: "GET",
    handler: friendRequestsRoute.GET,
    query: friendRequestListQuery,
  }),
  defineOperation({
    name: "send_friend_request",
    description: "Send a friend request to a BGO user.",
    path: "/api/friend-requests/[targetUserId]",
    method: "POST",
    handler: friendRequestsTargetUserIdRoute.POST,
  }),
  defineOperation({
    name: "respond_to_friend_request",
    description: "Accept or decline an incoming BGO friend request.",
    path: "/api/friend-requests/[targetUserId]",
    method: "PATCH",
    handler: friendRequestsTargetUserIdRoute.PATCH,
    body: friendRequestDecisionBody,
  }),
  defineOperation({
    name: "cancel_friend_request",
    description: "Cancel a friend request you previously sent.",
    path: "/api/friend-requests/[targetUserId]",
    method: "DELETE",
    handler: friendRequestsTargetUserIdRoute.DELETE,
  }),
  defineOperation({
    name: "list_friends",
    description: "List your BGO friends.",
    path: "/api/friends",
    method: "GET",
    handler: friendsRoute.GET,
  }),
  defineOperation({
    name: "remove_friend",
    description: "Remove an accepted friendship with a BGO user.",
    path: "/api/friends/[targetUserId]",
    method: "DELETE",
    handler: friendsTargetUserIdRoute.DELETE,
  }),
  defineOperation({
    name: "sync_contacts",
    description:
      "Replace the account's imported contact matching data after consent on the originating device.",
    path: "/api/contacts/sync",
    method: "POST",
    handler: contactsSyncRoute.POST,
    body: syncContactsSchema,
    sensitive: true,
  }),
  defineOperation({
    name: "search_users",
    description: "Find BGO users by name, username or email using at least four characters.",
    path: "/api/users/search",
    method: "GET",
    handler: usersSearchRoute.GET,
    query: userSearchQuery,
  }),
  defineOperation({
    name: "list_user_suggestions",
    description: "List known BGO users matched with contacts you have already imported.",
    path: "/api/users/suggestions",
    method: "GET",
    handler: usersSuggestionsRoute.GET,
    query: suggestionsQuery,
  }),
  defineOperation({
    name: "update_presence",
    description: "Update your current online or offline status from this client.",
    path: "/api/users/presence",
    method: "POST",
    handler: usersPresenceRoute.POST,
    body: presenceUpdateParamsSchema,
  }),
];
