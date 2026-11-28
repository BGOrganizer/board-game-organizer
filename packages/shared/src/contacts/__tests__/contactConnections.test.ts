import { expect, it } from "vitest";
import {
  contactConnections,
  contactDiscoveryFilter,
  hasContactRelationship,
} from "../contactConnections";
import type { ContactUser, RelationshipRow } from "../hooks/useContacts";

const user = (id: string, extra: Partial<ContactUser> = {}): ContactUser => ({
  id,
  name: id,
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "" },
  ...extra,
});
const row = (profile: ContactUser | null): RelationshipRow => ({
  fromUserId: "me",
  toUserId: profile?.id ?? "missing",
  profile,
});

it("sorts friends, following, followers, blocked, then unconnected device matches without duplicates", () => {
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
    [row(user("blocked", { blockedByMe: true }))],
  );
  expect(sections.map(({ key, users }) => [key, users.map((item) => item.id)])).toEqual([
    ["friends", ["friend"]],
    ["following", ["following"]],
    ["followers", ["follower"]],
    ["blocked", ["blocked"]],
    ["device", ["device"]],
  ]);
  expect(sections[1].users[0].isFollowing).toBe(true);
  expect(sections[2].users[0].isFollower).toBe(true);
});

it("keeps blocked users only in Blocked even when cached social lists still contain them", () => {
  const sections = contactConnections(
    [row(user("blocked"))],
    [row(user("blocked"))],
    [row(user("blocked"))],
    [user("blocked")],
    [row(user("blocked", { blockedByMe: true }))],
  );
  expect(sections.map(({ key, users }) => [key, users.map((item) => item.id)])).toEqual([
    ["friends", []],
    ["following", []],
    ["followers", []],
    ["blocked", ["blocked"]],
    ["device", []],
  ]);
});

it("reserves a relationship badge only for a canonical known fact", () => {
  expect(hasContactRelationship(user("unknown"))).toBe(false);
  expect(
    hasContactRelationship(
      user("none", { isFriend: false, isFollowing: false, isFollower: false, blockedByMe: false }),
    ),
  ).toBe(false);
  for (const fact of ["blockedByMe", "isFriend", "isFollowing", "isFollower"] as const)
    expect(hasContactRelationship(user("known", { [fact]: true }))).toBe(true);
});

it("preserves canonical precedence and blocks when higher-priority profiles are outside the visible window", () => {
  const sections = contactConnections(
    [row(user("friend-visible")), row(user("blocked-hidden"))],
    [row(user("friend-hidden")), row(user("following-visible")), row(user("blocked-hidden"))],
    [row(user("friend-hidden")), row(user("following-hidden")), row(user("follower-visible"))],
    [
      user("friend-hidden"),
      user("following-hidden"),
      user("follower-hidden"),
      user("blocked-hidden"),
      user("device"),
    ],
    [row(user("blocked-visible"))],
    {
      friends: new Set(["friend-visible", "friend-hidden"]),
      following: new Set(["following-visible", "following-hidden"]),
      followers: new Set(["follower-visible", "follower-hidden"]),
      blocked: new Set(["blocked-visible", "blocked-hidden"]),
    },
  );
  expect(sections.map(({ key, users }) => [key, users.map(({ id }) => id)])).toEqual([
    ["friends", ["friend-visible"]],
    ["following", ["following-visible"]],
    ["followers", ["follower-visible"]],
    ["blocked", ["blocked-visible"]],
    ["device", ["device"]],
  ]);
});

it("keeps canonical relationships and outstanding requests out of discovery while cached pages reconcile", () => {
  const candidates = [
    user("unrelated"),
    user("payload-friend", { isFriend: true }),
    user("payload-follow", { isFollowing: true }),
    user("payload-follower", { isFollower: true }),
    user("payload-blocked", { blockedByMe: true }),
    user("payload-blocker", { blockedMe: true }),
    user("cached-friend"),
    user("cached-follow"),
    user("cached-follower"),
    user("cached-blocked"),
    user("incoming"),
    user("outgoing"),
  ];
  expect(
    candidates.filter(
      contactDiscoveryFilter(
        {
          friends: new Set(["cached-friend"]),
          following: new Set(["cached-follow"]),
          followers: new Set(["cached-follower"]),
          blocked: new Set(["cached-blocked"]),
        },
        [row(user("incoming")), row(null)],
        [row(user("outgoing"))],
      ),
    ),
  ).toEqual([candidates[0]]);
  expect([user("outgoing")].filter(contactDiscoveryFilter(undefined, [], []))).toHaveLength(1);
});
