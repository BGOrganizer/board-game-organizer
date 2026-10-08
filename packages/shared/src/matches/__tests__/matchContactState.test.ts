import { describe, expect, it } from "vitest";
import type { RelationshipRow } from "../../contacts/hooks/useContacts";
import { matchContactState } from "../matchContactState";

const player = { id: "player", name: "Player", email: "player@example.com", avatarUrl: null };
const row = (
  id = player.id,
  profile: RelationshipRow["profile"] = {
    ...player,
    presence: { online: true, lastActiveAt: "now" },
  },
): RelationshipRow => ({
  fromUserId: "viewer",
  toUserId: id,
  profile,
});

describe("matchContactState", () => {
  it("offers social actions without removing match participants when lists are empty or missing", () => {
    expect(matchContactState(player, {})).toEqual({
      user: {
        ...player,
        presence: { online: false, lastActiveAt: "" },
        isFollowing: false,
        isFollower: false,
        isFriend: false,
        blockedByMe: false,
      },
      friendRequest: undefined,
      canSendFriendRequest: false,
    });
    expect(
      matchContactState(player, {
        pending: [],
        sent: [],
        following: [row("other")],
        friends: [row("player", null)],
      }).canSendFriendRequest,
    ).toBe(true);
  });

  it("retains friendship and follow state, handling received and sent requests", () => {
    const lists = {
      following: [row()],
      followers: [row()],
      friends: [row()],
      pending: [row()],
      sent: [row()],
    };
    expect(matchContactState(player, lists)).toMatchObject({
      user: { isFollowing: true, isFollower: true, isFriend: true },
      friendRequest: "incoming",
      canSendFriendRequest: false,
    });
    expect(matchContactState(player, { pending: [], sent: [row()] }).friendRequest).toBe(
      "outgoing",
    );
  });

  it("keeps blocked participants visible with unblock available instead of a new request", () => {
    expect(matchContactState(player, { pending: [], sent: [], blocked: [row()] })).toMatchObject({
      user: { blockedByMe: true, id: player.id },
      canSendFriendRequest: false,
    });
  });
});
