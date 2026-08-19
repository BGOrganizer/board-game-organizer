import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(),
  COLLECTIONS: { USERS: "users", BLOCKS: "blocks" },
}));
vi.mock("@/app/lib/blocks", () => ({
  getBlockedUserIds: vi.fn(async () => []),
  getBlockedByUserIds: vi.fn(async () => []),
}));
vi.mock("@/app/lib/rateLimit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 19, retryAfterSeconds: 0 })),
  pruneRateLimitBuckets: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/app/lib/db";
import { rateLimit } from "@/app/lib/rateLimit";

const authMock = vi.mocked(auth as unknown as () => Promise<{ userId: string | null }>);
const getDbMock = vi.mocked(
  getDb as unknown as () => Promise<{ collection: ReturnType<typeof vi.fn> }>,
);

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    clerkId: "user_1",
    name: "Alice",
    email: "alice@bgo.it",
    avatarUrl: "https://img/a.png",
    preferredLanguage: "en",
    plan: "free",
    presence: { online: true, lastActiveAt: new Date() },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/users/search", () => {
  it("rejects unauthenticated requests", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    const res = await GET(new Request("http://x/api/users/search?query=alice"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    authMock.mockResolvedValueOnce({ userId: "viewer" });
    vi.mocked(rateLimit).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });
    const res = await GET(new Request("http://x/api/users/search?query=alice"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("searches the users collection and applies the block policy", async () => {
    authMock.mockResolvedValueOnce({ userId: "viewer" });
    getDbMock.mockResolvedValueOnce({
      collection: vi.fn(() => ({
        find: vi.fn(() => ({
          limit: vi.fn(() => ({
            toArray: async () => [fakeUser(), fakeUser({ clerkId: "blocked_user", name: "B" })],
          })),
        })),
      })),
    });
    const { getBlockedUserIds } = await import("@/app/lib/blocks");
    vi.mocked(getBlockedUserIds as () => Promise<string[]>).mockResolvedValueOnce(["blocked_user"]);

    const res = await GET(new Request("http://x/api/users/search?query=al"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.users[0].id).toBe("user_1");
  });

  it("rejects an empty query", async () => {
    authMock.mockResolvedValueOnce({ userId: "viewer" });
    const res = await GET(new Request("http://x/api/users/search?query="));
    expect(res.status).toBe(400);
  });
});
