import { describe, expect, it } from "vitest";
import { userActionKeys } from "@/lib/user-actions";

const user = {
  id: "user_2",
  name: "Target",
  email: null,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
};

describe("userActionKeys", () => {
  it("offers follow, friend request and block for eligible contacts", () => {
    expect(userActionKeys(user, true)).toEqual(["follow", "friend_request", "block", "profile"]);
  });

  it("uses unfollow and omits unavailable friend requests", () => {
    expect(userActionKeys({ ...user, isFollowing: true }, false)).toEqual([
      "unfollow",
      "block",
      "profile",
    ]);
  });

  it("limits users blocked by the viewer to unblock", () => {
    expect(userActionKeys({ ...user, blockedByMe: true }, true)).toEqual(["unblock", "profile"]);
  });

  it("allows only safe cleanup when the other user blocked the viewer", () => {
    expect(userActionKeys({ ...user, blockedMe: true }, true)).toEqual(["profile"]);
    expect(userActionKeys({ ...user, blockedMe: true, isFollowing: true }, true)).toEqual([
      "unfollow",
      "profile",
    ]);
  });
});
