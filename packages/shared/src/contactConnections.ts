import type { ContactUser, RelationshipRow } from "./hooks/useContacts";

/** Each user appears once, in the highest-priority connection section. */
export function contactConnections(
  friends: RelationshipRow[],
  following: RelationshipRow[],
  followers: RelationshipRow[],
  suggestions: ContactUser[],
) {
  const seen = new Set<string>();
  const unique = (users: Array<ContactUser | null>) =>
    users.flatMap((user) => {
      if (!user || seen.has(user.id)) return [];
      seen.add(user.id);
      return [user];
    });
  return [
    { key: "friends", users: unique(friends.map((row) => row.profile)) },
    {
      key: "following",
      users: unique(following.map((row) => row.profile && { ...row.profile, isFollowing: true })),
    },
    {
      key: "followers",
      users: unique(followers.map((row) => row.profile && { ...row.profile, isFollower: true })),
    },
    {
      key: "device",
      users: unique(
        suggestions.filter(
          (user) =>
            !user.isFriend &&
            !user.isFollowing &&
            !user.isFollower &&
            !user.blockedByMe &&
            !user.blockedMe,
        ),
      ),
    },
  ] as const;
}
