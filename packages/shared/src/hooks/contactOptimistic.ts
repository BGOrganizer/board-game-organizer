import type { QueryKey } from "@tanstack/react-query";
import type { ContactUser, RelationshipRow } from "./useContacts";

export type ContactAction =
  | "follow"
  | "unfollow"
  | "unfriend"
  | "friend_request"
  | "accept_friend_request"
  | "reject_friend_request"
  | "cancel_friend_request"
  | "block"
  | "unblock";

export interface ContactMutationVariables {
  targetUserId: string;
  targetUser: ContactUser;
}

function updatedUser(user: ContactUser, action: ContactAction): ContactUser {
  switch (action) {
    case "follow":
      return { ...user, isFollowing: true };
    case "unfollow":
      return { ...user, isFollowing: false };
    case "unfriend":
      return { ...user, isFriend: false, isFollowing: false };
    case "accept_friend_request":
      return { ...user, isFriend: true, isFollowing: true, isFollower: true };
    case "block":
      return { ...user, blockedByMe: true, isFriend: false, isFollowing: false };
    case "unblock":
      return { ...user, blockedByMe: false };
    default:
      return user;
  }
}

function updateRows(
  rows: RelationshipRow[],
  action: ContactAction,
  variables: ContactMutationVariables,
): RelationshipRow[] {
  return rows.map((row) =>
    row.profile?.id === variables.targetUserId
      ? { ...row, profile: updatedUser(row.profile, action) }
      : row,
  );
}

function withoutTarget(rows: RelationshipRow[], targetUserId: string): RelationshipRow[] {
  return rows.filter((row) => row.profile?.id !== targetUserId);
}

function withTarget(
  rows: RelationshipRow[],
  action: ContactAction,
  variables: ContactMutationVariables,
  fromUserId: string | null | undefined,
  toUserId: string | null | undefined,
): RelationshipRow[] {
  if (!fromUserId || !toUserId || rows.some((row) => row.profile?.id === variables.targetUserId)) {
    return rows;
  }
  return [
    ...rows,
    {
      fromUserId,
      toUserId,
      profile: updatedUser(variables.targetUser, action),
    },
  ];
}

/** Applies one deterministic social action to any cached contacts view. */
export function optimisticContactData(
  queryKey: QueryKey,
  data: unknown,
  action: ContactAction,
  variables: ContactMutationVariables,
  currentUserId?: string | null,
): unknown {
  if (!data) return data;
  const view = String(queryKey[1] ?? "");

  if (Array.isArray(data)) {
    let rows = updateRows(data as RelationshipRow[], action, variables);
    const targetId = variables.targetUserId;

    if (action === "block") {
      return view === "blocked"
        ? withTarget(rows, action, variables, currentUserId, targetId)
        : withoutTarget(rows, targetId);
    }
    if (action === "unblock" && view === "blocked") return withoutTarget(rows, targetId);

    if (view === "following") {
      if (action === "follow" || action === "accept_friend_request") {
        rows = withTarget(rows, action, variables, currentUserId, targetId);
      } else if (action === "unfollow" || action === "unfriend") {
        rows = withoutTarget(rows, targetId);
      }
    } else if (view === "followers" && action === "accept_friend_request") {
      rows = withTarget(rows, action, variables, targetId, currentUserId);
    } else if (view === "friends") {
      if (action === "accept_friend_request") {
        rows = withTarget(rows, action, variables, currentUserId, targetId);
      } else if (action === "unfriend") {
        rows = withoutTarget(rows, targetId);
      }
    } else if (view === "pending") {
      if (action === "accept_friend_request" || action === "reject_friend_request") {
        rows = withoutTarget(rows, targetId);
      }
    } else if (view === "sent") {
      if (action === "friend_request") {
        rows = withTarget(rows, action, variables, currentUserId, targetId);
      } else if (action === "cancel_friend_request") {
        rows = withoutTarget(rows, targetId);
      }
    }
    return rows;
  }

  if (typeof data !== "object" || !("users" in data) || !Array.isArray(data.users)) return data;
  const container = data as { users: ContactUser[] };
  const remove =
    action === "block" ||
    (view === "suggestions" && (action === "follow" || action === "accept_friend_request"));
  const users = remove
    ? container.users.filter((user) => user.id !== variables.targetUserId)
    : container.users.map((user) =>
        user.id === variables.targetUserId ? updatedUser(user, action) : user,
      );
  return { ...container, users };
}
