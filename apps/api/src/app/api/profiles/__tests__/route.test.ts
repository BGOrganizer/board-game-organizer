import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "../route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ isAuthenticated: true, userId: "user_1" })),
  enrich: vi.fn(async () => ({
    id: "user_1",
    fullName: "Alex",
    emailAddress: "alex@example.com",
    imageUrl: "https://example.com/avatar.png",
  })),
  getDb: vi.fn(async () => ({})),
  list: vi.fn(async (_userId: string, type: string) => {
    const lengths: Record<string, number> = { friends: 2, followers: 3, following: 4 };
    return Array.from({ length: lengths[type] ?? 0 }, () => ({}));
  }),
  countPlayedByUser: vi.fn(async () => 5),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/clerk", () => ({ enrichSingleUser: mocks.enrich }));
vi.mock("@/app/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/app/lib/relationship.repository", () => ({ RelationshipRepository: vi.fn() }));
vi.mock("@/app/lib/relationship.service", () => ({
  RelationshipService: vi.fn().mockImplementation(() => ({ list: mocks.list })),
}));
vi.mock("@/app/lib/matches.repository", () => ({
  MatchesRepository: vi
    .fn()
    .mockImplementation(() => ({ countPlayedByUser: mocks.countPlayedByUser })),
}));

const request = () => new Request("http://localhost/api/profiles") as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ isAuthenticated: true, userId: "user_1" });
  mocks.enrich.mockResolvedValue({
    id: "user_1",
    fullName: "Alex",
    emailAddress: "alex@example.com",
    imageUrl: "https://example.com/avatar.png",
  });
});

describe("GET /api/profiles", () => {
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValueOnce({ isAuthenticated: false, userId: "" });
    expect((await GET(request())).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ isAuthenticated: true, userId: "" });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("reports unavailable Clerk profiles without returning empty counters", async () => {
    mocks.enrich.mockResolvedValueOnce(null as never);
    expect((await GET(request())).status).toBe(500);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns current social and played-match counts", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "user_1",
      stats: { friends: 2, followers: 3, following: 4, playedMatches: 5 },
    });
    expect(mocks.list.mock.calls).toEqual([
      ["user_1", "friends"],
      ["user_1", "followers"],
      ["user_1", "following"],
    ]);
    expect(mocks.countPlayedByUser).toHaveBeenCalledWith("user_1");
  });

  it("responds to preflight requests", async () => {
    expect((await OPTIONS(request())).status).toBe(204);
  });
});
