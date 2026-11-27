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

it("returns independent following, follower and mutual friendship state for search results", async () => {
  const users = ["following_only", "follower_only", "mutual", "unrelated"].map((id) => ({
    clerkId: id,
    name: "Player",
    email: `${id}@example.test`,
    username: id,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: new Date(0) },
  }));
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: async () => users,
  };
  const followFind = vi.fn((filter: { fromUserId?: string; toUserId?: string }) => ({
    toArray: async () =>
      filter.fromUserId === "viewer"
        ? [
            { fromUserId: "viewer", toUserId: "following_only" },
            { fromUserId: "viewer", toUserId: "mutual" },
          ]
        : [
            { fromUserId: "follower_only", toUserId: "viewer" },
            { fromUserId: "mutual", toUserId: "viewer" },
          ],
  }));
  const userFind = vi.fn(() => cursor);
  const friendFind = vi.fn(() => ({
    toArray: async () => [
      { fromUserId: "viewer", toUserId: "mutual" },
      { fromUserId: "mutual", toUserId: "viewer" },
      { fromUserId: "viewer", toUserId: "following_only" },
      { fromUserId: "unrelated", toUserId: "someone_else" },
    ],
  }));
  mocks.db.collection.mockImplementation((name: string) => {
    if (name === "users") return { find: userFind };
    if (name === "follows") return { find: followFind };
    return { find: friendFind };
  });

  const response = await GET(new Request("https://api.test/api/users/search?query=play"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    users: users.map((user) => ({
      id: user.clerkId,
      name: user.name,
      username: user.username,
      email: user.email,
      avatarUrl: null,
      presence: { online: false, lastActiveAt: new Date(0).toISOString() },
      blockedByMe: false,
      blockedMe: false,
      isFollowing: ["following_only", "mutual"].includes(user.clerkId),
      isFollower: ["follower_only", "mutual"].includes(user.clerkId),
      isFriend: user.clerkId === "mutual",
    })),
    nextCursor: null,
  });
  expect(followFind.mock.calls).toEqual([[{ fromUserId: "viewer" }], [{ toUserId: "viewer" }]]);
  expect(friendFind).toHaveBeenCalledWith({ status: "accepted" });
  expect(userFind).toHaveBeenCalledWith(
    expect.objectContaining({ clerkId: { $nin: ["viewer", "blocked", "blocker"] } }),
    { projection: { _id: 0 } },
  );
});

it("filters existing connections and both directions of pending requests before discovery cursors", async () => {
  const candidateIds = [
    "a_following",
    "b_new",
    "c_incoming",
    "d_follower",
    "e_mutual",
    "f_outgoing",
    "g_new",
  ];
  const find = vi.fn(({ clerkId }: { clerkId: { $nin: string[]; $gt?: string } }) => {
    let limit = 0;
    const cursor = {
      sort: vi.fn().mockReturnThis(),
      limit: (value: number) => {
        limit = value;
        return cursor;
      },
      toArray: async () =>
        candidateIds
          .filter((id) => !clerkId.$nin.includes(id) && id > (clerkId.$gt ?? ""))
          .slice(0, limit)
          .map((id) => ({ clerkId: id, name: "Player" })),
    };
    return cursor;
  });
  const friendFind = vi.fn(({ status }: { status: string }) => ({
    toArray: async () =>
      status === "pending"
        ? [
            { fromUserId: "c_incoming", toUserId: "viewer" },
            { fromUserId: "viewer", toUserId: "f_outgoing" },
          ]
        : [
            { fromUserId: "viewer", toUserId: "e_mutual" },
            { fromUserId: "e_mutual", toUserId: "viewer" },
            { fromUserId: "viewer", toUserId: "b_new" },
          ],
  }));
  mocks.db.collection.mockImplementation((name: string) => {
    if (name === "users") return { find };
    if (name === "friendRequests") return { find: friendFind };
    return {
      find: (filter: { fromUserId?: string }) => ({
        toArray: async () =>
          filter.fromUserId ? [{ toUserId: "a_following" }] : [{ fromUserId: "d_follower" }],
      }),
    };
  });
  const url = "https://api.test/api/users/search?query=player&limit=1&scope=discovery";
  const first = await (await GET(new Request(url))).json();
  expect(first.users).toEqual([expect.objectContaining({ id: "b_new" })]);
  expect(first.nextCursor).toBe("b_new");
  const next = await (await GET(new Request(`${url}&cursor=${first.nextCursor}`))).json();
  expect(next.users).toEqual([expect.objectContaining({ id: "g_new" })]);
  expect(next.nextCursor).toBeNull();
  expect(friendFind).toHaveBeenCalledWith(
    { status: "pending", $or: [{ fromUserId: "viewer" }, { toUserId: "viewer" }] },
    { projection: { _id: 0, fromUserId: 1, toUserId: 1 } },
  );
});
