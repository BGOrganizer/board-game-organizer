import type { ContactUser } from "@board-game-organizer/shared";

export type UserActionKey =
  | "block"
  | "unblock"
  | "follow"
  | "unfollow"
  | "unfriend"
  | "friend_request"
  | "accept_friend_request"
  | "reject_friend_request"
  | "cancel_friend_request"
  | "profile";

export type FriendRequestContext = "incoming" | "outgoing";

export function userActionKeys(
  user: ContactUser,
  canSendFriendRequest: boolean,
  friendRequest?: FriendRequestContext,
): UserActionKey[] {
  if (user.blockedByMe) return ["unblock"];
  if (user.blockedMe) return user.isFollowing ? ["unfollow", "profile"] : ["profile"];
  if (user.isFriend) return ["unfriend", "block", "profile"];
  return [
    user.isFollowing ? "unfollow" : "follow",
    ...(friendRequest === "incoming"
      ? (["accept_friend_request", "reject_friend_request"] as const)
      : friendRequest === "outgoing"
        ? (["cancel_friend_request"] as const)
        : canSendFriendRequest
          ? (["friend_request"] as const)
          : []),
    "block",
    "profile",
  ];
}
