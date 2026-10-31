import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: { collection: vi.fn() },
  following: vi.fn(),
  followers: vi.fn(),
  block: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({
  COLLECTIONS: { USERS: "users", FOLLOWS: "follows", FRIEND_REQUESTS: "friendRequests" },
  getDb: async () => mocks.db,
}));
vi.mock("@/app/lib/contacts/relationship.repository", () => ({
  RelationshipRepository: class {
    getFollowing = mocks.following;
    getFollowers = mocks.followers;
    getBlockState = mocks.block;
  },
}));
vi.mock("@/app/lib/rateLimit", () => ({
  rateLimit: () => ({ allowed: true }),
  pruneRateLimitBuckets: () => {},
}));
vi.mock("@/app/lib/contacts/blocks", () => ({
  getBlockedUserIds: async () => ["blocked"],
  getBlockedByUserIds: async () => ["blocker"],
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "viewer" });
  mocks.following.mockResolvedValue([]);
  mocks.followers.mockResolvedValue([]);
  mocks.block.mockResolvedValue({ blockedByMe: ["blocked"], blockedMe: ["blocker"] });
});
it("source-pages authorized identities before limit, with stable cursors and optional friend-only selection", async () => {
  const users = ["blocked", "blocker", "user_a", "user_b", "user_c", "viewer"].map((id) => ({
    clerkId: id,
    name: "Player",
    email: `${id}@example.test`,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: new Date(0) },
  }));
  const find = vi.fn((filter: { clerkId: { $nin: string[]; $gt?: string; $in?: string[] } }) => {
    let limit = 50;
    const cursor = {
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn((n: number) => {
        limit = n;
        return cursor;
      }),
      toArray: async () =>
        users
          .filter(
            (user) =>
              !filter.clerkId.$nin.includes(user.clerkId) &&
              (!filter.clerkId.$gt || user.clerkId > filter.clerkId.$gt) &&
              (!filter.clerkId.$in || filter.clerkId.$in.includes(user.clerkId)),
          )
          .slice(0, limit),
    };
    return cursor;
  });
  const friends = ["user_a", "user_b", "user_c"].flatMap((id) => [
    { fromUserId: "viewer", toUserId: id },
    { fromUserId: id, toUserId: "viewer" },
  ]);
  mocks.db.collection.mockImplementation((name: string) =>
    name === "users"
      ? { find }
      : { find: () => ({ toArray: async () => (name === "friendRequests" ? friends : []) }) },
  );
  const first = await (
    await GET(new Request("https://api.test/api/users/search?query=play&friendsOnly=true&limit=2"))
  ).json();
  expect(first.users.map((user: { id: string }) => user.id)).toEqual(["user_a", "user_b"]);
  expect(first.users.every((user: { isFriend: boolean }) => user.isFriend)).toBe(true);
  expect(first.nextCursor).toBe("user_b");
  expect(find.mock.calls[0][0].clerkId).toEqual({
    $nin: ["viewer", "blocked", "blocker"],
    $in: ["user_a", "user_b", "user_c"],
  });
  const second = await (
    await GET(
      new Request(
        `https://api.test/api/users/search?query=play&friendsOnly=true&limit=2&cursor=${first.nextCursor}`,
      ),
    )
  ).json();
  expect(second.users.map((user: { id: string }) => user.id)).toEqual(["user_c"]);
  expect(second.nextCursor).toBeNull();
});
it("keeps legacy default size50 and rejects unknown friend-filter values without touching the database", async () => {
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: async () => [],
  };
  mocks.db.collection.mockImplementation((name: string) => ({
    find: () => (name === "users" ? cursor : { toArray: async () => [] }),
  }));
  expect((await GET(new Request("https://api.test/api/users/search?query=play"))).status).toBe(200);
  expect(cursor.limit).toHaveBeenCalledWith(51);
  mocks.db.collection.mockClear();
  expect(
    (await GET(new Request("https://api.test/api/users/search?query=play&friendsOnly=anything")))
      .status,
  ).toBe(400);
  expect(mocks.db.collection).not.toHaveBeenCalled();
});
