import { describe, expect, it } from "vitest";
import { type ContactAction, optimisticContactData } from "../contactOptimistic";
import type { ContactUser } from "../useContacts";

const target: ContactUser = {
  id: "target",
  name: "Target",
  email: "target@example.com",
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
};
const variables = { targetUserId: target.id, targetUser: target };
const row = (user: ContactUser | null = target) => ({
  fromUserId: "viewer",
  toUserId: user?.id ?? target.id,
  profile: user,
});
const applyRows = (view: string, action: ContactAction, rows = [row()]) =>
  optimisticContactData(["contacts", view], rows, action, variables, "viewer") as ReturnType<
    typeof row
  >[];
const applyUsers = (view: string, action: ContactAction) =>
  optimisticContactData(
    ["contacts", view],
    { users: [target], hasContacts: true },
    action,
    variables,
    "viewer",
  ) as { users: ContactUser[]; hasContacts: boolean };

describe("optimisticContactData", () => {
  it("adds and removes following rows while updating cached user flags", () => {
    expect(applyRows("following", "follow", [])).toEqual([
      expect.objectContaining({
        fromUserId: "viewer",
        toUserId: "target",
        profile: expect.objectContaining({ isFollowing: true }),
      }),
    ]);
    expect(applyRows("following", "follow")).toHaveLength(1);
    expect(applyRows("following", "unfollow")).toEqual([]);
    expect(applyUsers("search:target", "follow").users[0]?.isFollowing).toBe(true);
    expect(applyUsers("search:target", "unfollow").users[0]?.isFollowing).toBe(false);
  });

  it("keeps sent and pending request caches coherent", () => {
    expect(applyRows("sent", "friend_request", [])).toHaveLength(1);
    expect(applyRows("sent", "cancel_friend_request")).toEqual([]);
    expect(applyRows("pending", "accept_friend_request")).toEqual([]);
    expect(applyRows("pending", "reject_friend_request")).toEqual([]);
  });

  it("adds an accepted friend to friendship and follow caches", () => {
    for (const view of ["friends", "following", "followers"]) {
      const result = applyRows(view, "accept_friend_request", []);
      expect(result).toHaveLength(1);
      expect(result[0]?.profile).toEqual(
        expect.objectContaining({ isFriend: true, isFollowing: true, isFollower: true }),
      );
    }
    expect(applyUsers("search:target", "accept_friend_request").users[0]).toEqual(
      expect.objectContaining({ isFriend: true, isFollowing: true, isFollower: true }),
    );
  });

  it("removes an unfriended user from friends and following", () => {
    expect(applyRows("friends", "unfriend")).toEqual([]);
    expect(applyRows("following", "unfriend")).toEqual([]);
    expect(applyUsers("search:target", "unfriend").users[0]).toEqual(
      expect.objectContaining({ isFriend: false, isFollowing: false }),
    );
  });

  it("moves blocked users out of visible views and into blocked", () => {
    expect(applyRows("friends", "block")).toEqual([]);
    expect(applyRows("blocked", "block", [])[0]?.profile).toEqual(
      expect.objectContaining({ blockedByMe: true, isFriend: false, isFollowing: false }),
    );
    expect(applyUsers("suggestions", "block").users).toEqual([]);
    expect(applyUsers("search:target", "block").users).toEqual([]);
    expect(applyRows("blocked", "unblock")).toEqual([]);
    expect(applyUsers("search:target", "unblock").users[0]?.blockedByMe).toBe(false);
  });

  it("preserves unrelated, incomplete, and unsupported cache values", () => {
    const other = { ...target, id: "other" };
    expect(applyRows("friends", "follow", [row(other), { ...row(other), profile: null }])).toEqual([
      row(other),
      { ...row(other), profile: null },
    ]);
    expect(optimisticContactData(["contacts", "following"], [], "follow", variables, null)).toEqual(
      [],
    );
    expect(optimisticContactData(["contacts"], [], "follow", variables)).toEqual([]);
    expect(applyUsers("suggestions", "follow").users).toEqual([]);
    expect(applyUsers("suggestions", "accept_friend_request").users).toEqual([]);
    expect(
      optimisticContactData(
        ["contacts", "search:target"],
        { users: [other, target] },
        "follow",
        variables,
      ),
    ).toEqual({ users: [other, expect.objectContaining({ id: "target", isFollowing: true })] });
    expect(optimisticContactData(["contacts", "x"], null, "follow", variables)).toBeNull();
    expect(optimisticContactData(["contacts", "x"], { value: 1 }, "follow", variables)).toEqual({
      value: 1,
    });
  });
});
