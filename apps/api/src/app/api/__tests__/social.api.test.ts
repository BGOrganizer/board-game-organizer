import { testApiHandler } from "next-test-api-route-handler";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<{ userId: string | null }> => ({ userId: "user_actor" })),
  withTransaction: vi.fn(),
  enrich: vi.fn(async (_db, rows) => rows),
  service: {
    requireCurrentUser: vi.fn(async () => undefined),
    follow: vi.fn(async () => undefined),
    unfollow: vi.fn(async () => undefined),
    sendFriendRequest: vi.fn(async () => undefined),
    respondToFriendRequest: vi.fn(async () => undefined),
    cancelFriendRequest: vi.fn(async () => undefined),
    unfriend: vi.fn(async () => undefined),
    block: vi.fn(async () => undefined),
    unblock: vi.fn(async () => undefined),
    list: vi.fn(async () => [{ fromUserId: "user_actor", toUserId: "user_target" }]),
  },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({
  withTransaction: mocks.withTransaction,
  getDb: vi.fn(async () => ({})),
  COLLECTIONS: {
    USERS: "users",
    FOLLOWS: "follows",
    FRIEND_REQUESTS: "friendRequests",
    BLOCKS: "blocks",
  },
}));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("@/app/lib/enrichUsers", () => ({ enrichRelationshipsWithUsers: mocks.enrich }));
vi.mock("@/app/lib/relationship.repository", () => ({
  RelationshipRepository: class RelationshipRepository {},
}));
vi.mock("@/app/lib/relationship.service", () => {
  class RelationshipError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    RelationshipError,
    RelationshipService: class RelationshipService {
      requireCurrentUser = mocks.service.requireCurrentUser;
      follow = mocks.service.follow;
      unfollow = mocks.service.unfollow;
      sendFriendRequest = mocks.service.sendFriendRequest;
      respondToFriendRequest = mocks.service.respondToFriendRequest;
      cancelFriendRequest = mocks.service.cancelFriendRequest;
      unfriend = mocks.service.unfriend;
      block = mocks.service.block;
      unblock = mocks.service.unblock;
      list = mocks.service.list;
    },
  };
});

import { RelationshipError } from "@/app/lib/relationship.service";
import * as blockRoute from "../blocks/[targetUserId]/route";
import * as blocksRoute from "../blocks/route";
import * as followRoute from "../follows/[targetUserId]/route";
import * as followsRoute from "../follows/route";
import * as friendRequestRoute from "../friend-requests/[targetUserId]/route";
import * as friendRequestsRoute from "../friend-requests/route";
import * as friendRoute from "../friends/[targetUserId]/route";
import * as friendsRoute from "../friends/route";
import * as legacyRoute from "../relationships/route";

type AppHandler = Record<string, unknown>;

async function api(
  appHandler: AppHandler,
  method: string,
  options: {
    url?: string;
    params?: Record<string, string>;
    body?: unknown;
    rawBody?: string;
    contentType?: string;
  } = {},
) {
  let response: Response | undefined;
  await testApiHandler({
    appHandler,
    url: options.url ?? "http://localhost/api/test",
    params: options.params,
    test: async ({ fetch }) => {
      response = await fetch({
        method,
        ...(options.body === undefined && options.rawBody === undefined
          ? {}
          : {
              headers: { "Content-Type": options.contentType ?? "application/json" },
              body: options.rawBody ?? JSON.stringify(options.body),
            }),
      });
    },
  });
  if (!response) throw new Error("Route handler did not return a response");
  return response;
}

const target = { targetUserId: "user_target" };

describe("social API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user_actor" });
    mocks.withTransaction.mockImplementation(async (callback) => callback({}, {}));
    for (const mock of Object.values(mocks.service)) {
      (mock as { mockResolvedValue(value: unknown): unknown }).mockResolvedValue(undefined);
    }
    mocks.service.list.mockResolvedValue([{ fromUserId: "user_actor", toUserId: "user_target" }]);
    mocks.enrich.mockImplementation(async (_db, rows) => rows);
  });

  it("rejects unauthenticated requests before opening a transaction", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await api(friendsRoute, "GET");
    expect(response.status).toBe(401);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("maps domain and unexpected errors", async () => {
    mocks.service.list.mockRejectedValueOnce(new RelationshipError(409, "conflict"));
    const conflict = await api(friendsRoute, "GET");
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({ error: "conflict" });

    mocks.service.list.mockRejectedValueOnce(new Error("secret"));
    const failure = await api(friendsRoute, "GET");
    expect(failure.status).toBe(500);
    await expect(failure.json()).resolves.toEqual({ error: "Internal server error" });
  });

  it("lists following and followers with strict direction validation", async () => {
    expect(
      (await api(followsRoute, "GET", { url: "http://localhost/api/follows?direction=following" }))
        .status,
    ).toBe(200);
    expect(mocks.service.list).toHaveBeenLastCalledWith("user_actor", "following");

    await api(followsRoute, "GET", { url: "http://localhost/api/follows?direction=followers" });
    expect(mocks.service.list).toHaveBeenLastCalledWith("user_actor", "followers");

    expect(
      (
        await api(followsRoute, "GET", {
          url: "http://localhost/api/follows?direction=following&extra=x",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(followsRoute, "GET", {
          url: "http://localhost/api/follows?direction=following&direction=followers",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(followsRoute, "GET", {
          url: "http://localhost/api/follows?direction=following&x-vercel-protection-bypass=token",
        })
      ).status,
    ).toBe(200);
  });

  it("follows and unfollows a validated target", async () => {
    expect((await api(followRoute, "PUT", { params: target })).status).toBe(200);
    expect(mocks.service.follow).toHaveBeenCalledWith("user_actor", "user_target");
    expect((await api(followRoute, "DELETE", { params: target })).status).toBe(200);
    expect(mocks.service.unfollow).toHaveBeenCalledWith("user_actor", "user_target");
  });

  it("rejects malformed Clerk user ids", async () => {
    expect((await api(followRoute, "PUT", { params: { targetUserId: "bad id" } })).status).toBe(
      400,
    );
    expect((await api(followRoute, "DELETE", { params: { targetUserId: "x" } })).status).toBe(400);
    expect(
      (
        await api(followRoute, "PUT", {
          url: "http://localhost/api/follows/user_target?extra=x",
          params: target,
        })
      ).status,
    ).toBe(400);
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it("lists incoming and outgoing friend requests with strict validation", async () => {
    await api(friendRequestsRoute, "GET", {
      url: "http://localhost/api/friend-requests?direction=incoming",
    });
    expect(mocks.service.list).toHaveBeenLastCalledWith("user_actor", "pending");
    await api(friendRequestsRoute, "GET", {
      url: "http://localhost/api/friend-requests?direction=outgoing",
    });
    expect(mocks.service.list).toHaveBeenLastCalledWith("user_actor", "sent");
    expect(
      (
        await api(friendRequestsRoute, "GET", {
          url: "http://localhost/api/friend-requests?direction=invalid",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(friendRequestsRoute, "GET", {
          url: "http://localhost/api/friend-requests?direction=incoming&direction=outgoing",
        })
      ).status,
    ).toBe(400);
  });

  it("sends, accepts, rejects, and cancels friend requests", async () => {
    expect((await api(friendRequestRoute, "POST", { params: target })).status).toBe(201);
    expect(mocks.service.sendFriendRequest).toHaveBeenCalledWith("user_actor", "user_target");

    await api(friendRequestRoute, "PATCH", {
      params: target,
      body: { decision: "accept" },
    });
    expect(mocks.service.respondToFriendRequest).toHaveBeenLastCalledWith(
      "user_actor",
      "user_target",
      "accepted",
    );

    await api(friendRequestRoute, "PATCH", {
      params: target,
      body: { decision: "reject" },
    });
    expect(mocks.service.respondToFriendRequest).toHaveBeenLastCalledWith(
      "user_actor",
      "user_target",
      "rejected",
    );

    await api(friendRequestRoute, "DELETE", { params: target });
    expect(mocks.service.cancelFriendRequest).toHaveBeenCalledWith("user_actor", "user_target");
  });

  it("rejects malformed friend-request input", async () => {
    expect(
      (
        await api(friendRequestRoute, "PATCH", {
          params: target,
          body: { decision: "accept", extra: true },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(friendRequestRoute, "PATCH", {
          params: target,
          rawBody: "{}",
          contentType: "text/plain",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await api(friendRequestRoute, "PATCH", {
          params: target,
          rawBody: JSON.stringify({ decision: "accept", padding: "x".repeat(1_024) }),
        })
      ).status,
    ).toBe(413);
    expect((await api(friendRequestRoute, "POST", { params: { targetUserId: "" } })).status).toBe(
      400,
    );
    expect(
      (
        await api(friendRequestRoute, "PATCH", {
          params: { targetUserId: "bad" },
          body: { decision: "accept" },
        })
      ).status,
    ).toBe(400);
    expect(
      (await api(friendRequestRoute, "DELETE", { params: { targetUserId: "bad" } })).status,
    ).toBe(400);
  });

  it("lists friends and removes a friend", async () => {
    expect((await api(friendsRoute, "GET")).status).toBe(200);
    expect(mocks.service.list).toHaveBeenLastCalledWith("user_actor", "friends");
    expect(
      (await api(friendsRoute, "GET", { url: "http://localhost/api/friends?extra=x" })).status,
    ).toBe(400);
    await api(friendRoute, "DELETE", { params: target });
    expect(mocks.service.unfriend).toHaveBeenCalledWith("user_actor", "user_target");
    expect((await api(friendRoute, "DELETE", { params: { targetUserId: "bad" } })).status).toBe(
      400,
    );
  });

  it("lists, creates, and removes blocks", async () => {
    expect((await api(blocksRoute, "GET")).status).toBe(200);
    expect(mocks.service.list).toHaveBeenLastCalledWith("user_actor", "blocked");
    expect(
      (
        await api(blocksRoute, "GET", {
          url: "http://localhost/api/blocks?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b",
        })
      ).status,
    ).toBe(400);
    await api(blockRoute, "PUT", { params: target });
    expect(mocks.service.block).toHaveBeenCalledWith("user_actor", "user_target");
    await api(blockRoute, "DELETE", { params: target });
    expect(mocks.service.unblock).toHaveBeenCalledWith("user_actor", "user_target");
    expect((await api(blockRoute, "PUT", { params: { targetUserId: "bad" } })).status).toBe(400);
    expect((await api(blockRoute, "DELETE", { params: { targetUserId: "bad" } })).status).toBe(400);
  });

  it("supports CORS preflight", async () => {
    const response = await api(blockRoute, "OPTIONS", { params: target });
    expect(response.status).toBe(204);
  });

  it("keeps the legacy relationships API transactional during client migration", async () => {
    await api(legacyRoute, "GET", {
      url: "http://localhost/api/relationships?type=following",
    });
    expect(mocks.service.list).toHaveBeenLastCalledWith("user_actor", "following");

    await api(legacyRoute, "POST", {
      url: "http://localhost/api/relationships?type=follow",
      body: { targetUserId: "user_target" },
    });
    await api(legacyRoute, "POST", {
      url: "http://localhost/api/relationships?type=friend_request",
      body: { targetUserId: "user_target" },
    });
    await api(legacyRoute, "POST", {
      url: "http://localhost/api/relationships?type=block",
      body: { targetUserId: "user_target" },
    });
    expect(mocks.service.follow).toHaveBeenCalled();
    expect(mocks.service.sendFriendRequest).toHaveBeenCalled();
    expect(mocks.service.block).toHaveBeenCalled();

    await api(legacyRoute, "PATCH", {
      url: "http://localhost/api/relationships?type=friend_request",
      body: { targetUserId: "user_target" },
    });
    expect(mocks.service.respondToFriendRequest).toHaveBeenCalledWith(
      "user_actor",
      "user_target",
      "accepted",
    );

    for (const type of ["follow", "friend_request", "friend", "block"]) {
      await api(legacyRoute, "DELETE", {
        url: `http://localhost/api/relationships?type=${type}`,
        body: { targetUserId: "user_target" },
      });
    }
    expect(mocks.service.unfollow).toHaveBeenCalled();
    expect(mocks.service.cancelFriendRequest).toHaveBeenCalled();
    expect(mocks.service.unfriend).toHaveBeenCalled();
    expect(mocks.service.unblock).toHaveBeenCalled();
  });

  it("rejects malformed legacy relationship requests", async () => {
    expect(
      (await api(legacyRoute, "GET", { url: "http://localhost/api/relationships?type=nope" }))
        .status,
    ).toBe(400);
    expect(
      (await api(legacyRoute, "GET", { url: "http://localhost/api/relationships" })).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "GET", {
          url: "http://localhost/api/relationships?type=following&extra=x",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "GET", {
          url: "http://localhost/api/relationships?type=following&x-vercel-protection-bypass=a&x-vercel-protection-bypass=b",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "POST", {
          url: "http://localhost/api/relationships?type=follow",
          body: { targetUserId: "bad", extra: true },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "POST", {
          url: "http://localhost/api/relationships?type=nope",
          body: { targetUserId: "user_target" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "PATCH", {
          url: "http://localhost/api/relationships?type=block",
          body: { targetUserId: "user_target" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "DELETE", {
          url: "http://localhost/api/relationships?type=nope",
          body: { targetUserId: "user_target" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "DELETE", {
          url: "http://localhost/api/relationships?type=follow",
          body: { targetUserId: "bad" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "PATCH", {
          url: "http://localhost/api/relationships?type=friend_request",
          body: { targetUserId: "bad" },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "POST", {
          url: "http://localhost/api/relationships?type=follow",
          rawBody: "{not-json",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(legacyRoute, "POST", {
          url: "http://localhost/api/relationships?type=follow",
          rawBody: "",
        })
      ).status,
    ).toBe(400);
  });
});
