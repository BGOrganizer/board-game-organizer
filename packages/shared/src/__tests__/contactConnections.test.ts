import { expect, it } from "vitest";
import { contactConnections } from "../contactConnections";
import type { ContactUser, RelationshipRow } from "../hooks/useContacts";

const user = (id: string, extra: Partial<ContactUser> = {}): ContactUser => ({
  id,
  name: id,
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: null },
  ...extra,
});
const row = (profile: ContactUser | null): RelationshipRow => ({
  fromUserId: "me",
  toUserId: profile?.id ?? "missing",
  profile,
});

it("sorts friends, following, followers, then unconnected device matches without duplicates", () => {
  const sections = contactConnections(
    [row(user("friend")), row(null)],
    [row(user("friend")), row(user("following"))],
    [row(user("following")), row(user("follower"))],
    [
      user("friend"),
      user("device"),
      user("other-friend", { isFriend: true }),
      user("followed", { isFollowing: true }),
      user("follows-me", { isFollower: true }),
      user("blocked", { blockedByMe: true }),
      user("blocks-me", { blockedMe: true }),
      user("device"),
    ],
  );
  expect(sections.map(({ key, users }) => [key, users.map((item) => item.id)])).toEqual([
    ["friends", ["friend"]],
    ["following", ["following"]],
    ["followers", ["follower"]],
    ["device", ["device"]],
  ]);
  expect(sections[1].users[0].isFollowing).toBe(true);
  expect(sections[2].users[0].isFollower).toBe(true);
});
