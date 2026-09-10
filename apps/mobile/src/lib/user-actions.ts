import type { ContactUser } from "@board-game-organizer/shared";

export type UserActionKey =
  | "block"
  | "unblock"
  | "follow"
  | "unfollow"
  | "unfriend"
  | "friend_request"
  | "profile";

export function userActionKeys(user: ContactUser, canSendFriendRequest: boolean): UserActionKey[] {
  if (user.blockedByMe) return ["unblock", "profile"];
  if (user.blockedMe) return user.isFollowing ? ["unfollow", "profile"] : ["profile"];
  if (user.isFriend) return ["unfriend", "block", "profile"];

  return [
    user.isFollowing ? "unfollow" : "follow",
    ...(canSendFriendRequest ? (["friend_request"] as const) : []),
    "block",
    "profile",
  ];
}
