import type { ContactUser, RelationshipRow } from "../contacts/hooks/useContacts";

/** Match membership survives blocks; only social actions follow relationship state. */
export function matchContactState(
  player: Pick<ContactUser, "id" | "name" | "email" | "avatarUrl">,
  lists: Partial<
    Record<
      "following" | "followers" | "friends" | "pending" | "sent" | "blocked",
      RelationshipRow[]
    >
  >,
) {
  const has = (type: keyof typeof lists) =>
    lists[type]?.some((row) => row.profile?.id === player.id) ?? false;
  const incoming = has("pending");
  const outgoing = has("sent");
  const isFriend = has("friends");
  const blockedByMe = has("blocked");
  return {
    user: {
      ...player,
      presence: { online: false, lastActiveAt: "" },
      isFollowing: has("following"),
      isFollower: has("followers"),
      isFriend,
      blockedByMe,
    } satisfies ContactUser,
    friendRequest: incoming ? ("incoming" as const) : outgoing ? ("outgoing" as const) : undefined,
    canSendFriendRequest: Boolean(
      lists.pending && lists.sent && !isFriend && !blockedByMe && !incoming && !outgoing,
    ),
  };
}
