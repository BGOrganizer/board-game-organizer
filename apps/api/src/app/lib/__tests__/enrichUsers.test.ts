import { describe, expect, it, vi } from "vitest";
import { enrichRelationshipsWithUsers } from "../enrichUsers";

function fakeDb(data: Record<string, Array<Record<string, unknown>>>) {
  return {
    collection: vi.fn((name: string) => ({
      find: vi.fn((query: Record<string, unknown>, options?: Record<string, unknown>) => ({
        options,
        toArray: async () =>
          (data[name] ?? []).filter((row) => {
            if (name !== "blocks") return true;
            if (query.fromUserId) return row.fromUserId === query.fromUserId;
            if (query.toUserId) return row.toUserId === query.toUserId;
            return true;
          }),
      })),
    })),
  };
}

describe("enrichRelationshipsWithUsers", () => {
  it("enriches both edge directions and complete friendship state in one session", async () => {
    const db = fakeDb({
      users: [
        {
          clerkId: "user_b",
          name: "Bob",
          email: "bob@example.com",
          avatarUrl: "avatar",
          presence: { online: true, lastActiveAt: "now" },
        },
        {
          clerkId: "user_c",
          name: "Carol",
          email: "carol@example.com",
          presence: { online: false, lastActiveAt: "then" },
        },
      ],
      follows: [
        { fromUserId: "user_a", toUserId: "user_b" },
        { fromUserId: "user_b", toUserId: "user_a" },
      ],
      friendRequests: [
        { fromUserId: "user_a", toUserId: "user_b", status: "accepted" },
        { fromUserId: "user_b", toUserId: "user_a", status: "accepted" },
      ],
      blocks: [],
    });
    const session = { id: "session" };

    const rows = await enrichRelationshipsWithUsers(
      db as never,
      [
        { fromUserId: "user_a", toUserId: "user_b" },
        { fromUserId: "user_c", toUserId: "user_a" },
      ],
      "user_a",
      session as never,
    );

    expect(rows[0].profile).toMatchObject({
      id: "user_b",
      avatarUrl: "avatar",
      blockedByMe: false,
      blockedMe: false,
      isFollowing: true,
      isFollower: true,
      isFriend: true,
    });
    expect(rows[1].profile).toMatchObject({
      id: "user_c",
      avatarUrl: null,
      isFollowing: false,
      isFollower: false,
      isFriend: false,
    });
  });

  it("returns a null profile for an unsynchronized relationship target", async () => {
    const rows = await enrichRelationshipsWithUsers(
      fakeDb({ users: [], follows: [], friendRequests: [], blocks: [] }) as never,
      [{ fromUserId: "user_a", toUserId: "user_missing" }],
      "user_a",
    );
    expect(rows).toEqual([{ fromUserId: "user_a", toUserId: "user_missing", profile: null }]);
  });

  it("hides presence for blocks in either direction", async () => {
    const db = fakeDb({
      users: [
        {
          clerkId: "user_b",
          name: "Bob",
          email: "bob@example.com",
          presence: { online: true, lastActiveAt: "now" },
        },
        {
          clerkId: "user_c",
          name: "Carol",
          email: "carol@example.com",
          presence: { online: true, lastActiveAt: "now" },
        },
      ],
      follows: [],
      friendRequests: [],
      blocks: [
        { fromUserId: "user_a", toUserId: "user_b" },
        { fromUserId: "user_c", toUserId: "user_a" },
      ],
    });
    const rows = await enrichRelationshipsWithUsers(
      db as never,
      [
        { fromUserId: "user_a", toUserId: "user_b" },
        { fromUserId: "user_a", toUserId: "user_c" },
      ],
      "user_a",
    );

    expect(rows[0].profile).toMatchObject({
      blockedByMe: true,
      blockedMe: false,
      presence: { online: false, lastActiveAt: "" },
    });
    expect(rows[1].profile).toMatchObject({
      blockedByMe: false,
      blockedMe: true,
      presence: { online: false, lastActiveAt: "" },
    });
  });
});
