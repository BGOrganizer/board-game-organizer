import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const contactClerkIdsForUser = vi.fn(async () => [] as string[]);

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(),
  COLLECTIONS: {
    USERS: "users",
    BLOCKS: "blocks",
    FOLLOWS: "follows",
    FRIEND_REQUESTS: "friendRequests",
    CONTACT_LINKS: "contactLinks",
  },
}));
vi.mock("@/app/lib/contacts/contacts.repository", () => ({
  ContactLinksRepository: class {
    contactClerkIdsForUser = contactClerkIdsForUser;
  },
}));

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/app/lib/db";

const authMock = vi.mocked(auth as unknown as () => Promise<{ userId: string | null }>);
const getDbMock = vi.mocked(
  getDb as unknown as () => Promise<{ collection: ReturnType<typeof vi.fn> }>,
);

function fakeDb() {
  return {
    collection: vi.fn(() => ({
      find: vi.fn(() => ({ toArray: async () => [] })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: "user_1" });
  getDbMock.mockResolvedValue(fakeDb() as never);
  contactClerkIdsForUser.mockResolvedValue([]);
});

describe("GET /api/users/suggestions", () => {
  it("includes already connected device contacts with accurate actions only in contacts scope, preserving block guards", async () => {
    contactClerkIdsForUser.mockResolvedValue(["friend", "blocked", "user_1"]);
    getDbMock.mockResolvedValue({
      collection: (name: string) => ({
        find: (filter: Record<string, unknown>) => ({
          toArray: async () => {
            if (name === "users")
              return ["friend", "blocked", "user_1"].map((clerkId) => ({ clerkId, name: clerkId }));
            if (name === "blocks") return filter.fromUserId ? [{ toUserId: "blocked" }] : [];
            if (name === "follows")
              return filter.fromUserId === "user_1"
                ? [{ toUserId: "friend" }]
                : [{ fromUserId: "friend" }];
            if (name === "friendRequests")
              return [
                { fromUserId: "user_1", toUserId: "friend" },
                { fromUserId: "friend", toUserId: "user_1" },
              ];
            return [];
          },
        }),
      }),
    } as never);
    expect(
      (await (await GET(new Request("http://localhost/api/users/suggestions?limit=1"))).json())
        .users,
    ).toEqual([]);
    const result = await (
      await GET(new Request("http://localhost/api/users/suggestions?scope=contacts&limit=1"))
    ).json();
    expect(result.users).toEqual([
      expect.objectContaining({
        id: "friend",
        isFollowing: true,
        isFollower: true,
        isFriend: true,
      }),
    ]);
    expect(
      (await GET(new Request("http://localhost/api/users/suggestions?scope=other"))).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new Request("http://localhost/api/users/suggestions?scope=contacts&scope=contacts"),
        )
      ).status,
    ).toBe(400);
  });
  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await GET(new Request("http://localhost/api/users/suggestions"));
    expect(res.status).toBe(401);
  });

  it("returns an empty list with hasContacts=false when no contacts were synced", async () => {
    const res = await GET(new Request("http://localhost/api/users/suggestions"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ users: [], nextCursor: null, hasContacts: false });
  });

  it("paginates only registered, visible suggestions", async () => {
    contactClerkIdsForUser.mockResolvedValue(["user_c", "user_a", "user_b"]);
    getDbMock.mockResolvedValue({
      collection: (name: string) => ({
        find: () => ({
          toArray: async () =>
            name === "users"
              ? ["user_c", "user_a", "user_b"].map((clerkId) => ({
                  clerkId,
                  name: clerkId,
                  email: null,
                  avatarUrl: null,
                  presence: { online: false, lastActiveAt: new Date() },
                }))
              : [],
        }),
      }),
    } as never);
    const first = await GET(new Request("http://localhost/api/users/suggestions?limit=2"));
    const body = await first.json();
    expect(body.users.map((user: { id: string }) => user.id)).toEqual(["user_a", "user_b"]);
    expect(body.nextCursor).toBe("user_b");
    expect(body.hasContacts).toBe(true);
    const second = await GET(
      new Request("http://localhost/api/users/suggestions?limit=2&cursor=user_b"),
    );
    expect((await second.json()).users.map((user: { id: string }) => user.id)).toEqual(["user_c"]);
    expect((await GET(new Request("http://localhost/api/users/suggestions?limit=0"))).status).toBe(
      400,
    );
  });

  it("returns only synced contacts (hasContacts=true)", async () => {
    contactClerkIdsForUser.mockResolvedValue(["user_b"]);
    const db = {
      collection: vi.fn((name: string) => {
        if (name === "users") {
          return {
            find: vi.fn(() => ({
              toArray: async () => [
                {
                  clerkId: "user_b",
                  name: "Bob",
                  email: "b@bgo.it",
                  avatarUrl: null,
                  presence: { online: false, lastActiveAt: new Date() },
                },
              ],
            })),
          };
        }
        return { find: vi.fn(() => ({ toArray: async () => [] })) };
      }),
    };
    getDbMock.mockResolvedValue(db as never);
    const res = await GET(new Request("http://localhost/api/users/suggestions"));
    const body = await res.json();
    expect(body.hasContacts).toBe(true);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe("user_b");
  });
});
