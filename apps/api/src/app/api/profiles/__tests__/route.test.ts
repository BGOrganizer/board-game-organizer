import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "../route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  enrich: vi.fn(),
  getDb: vi.fn(async () => ({})),
  social: vi.fn(async () => ({ friends: 2, followers: 3, following: 4 })),
  player: vi.fn(async () => ({ gamesPlayed: 5, gamesWon: 2, winRate: 40 })),
  groupCounts: vi.fn(async () => ({ adminGroups: 1, joinedGroups: 1 })),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/clerk", () => ({ enrichSingleUser: mocks.enrich }));
vi.mock("@/app/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("@/app/lib/users/users.repository", () => ({
  UsersRepository: vi.fn(() => ({ findById: async () => ({ preferredLanguage: "en" }) })),
}));
vi.mock("@/app/lib/profile/profile.repository", () => ({
  ProfileRepository: vi.fn(() => ({
    social: mocks.social,
    player: mocks.player,
    groupCounts: mocks.groupCounts,
  })),
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
  it("requires authentication before reading private data", async () => {
    mocks.auth.mockResolvedValueOnce({ isAuthenticated: false, userId: "" });
    expect((await GET(request())).status).toBe(401);
    mocks.auth.mockResolvedValueOnce({ isAuthenticated: true, userId: "" });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("reports unavailable Clerk profiles without empty-list success", async () => {
    mocks.enrich.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(500);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("uses canonical unified results and source social counters, not retired Matches/Groups readers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "user_1",
      social: { friends: 2, followers: 3, following: 4 },
      player: { gamesPlayed: 5, gamesWon: 2, winRate: 40 },
      stats: {
        friends: 2,
        followers: 3,
        following: 4,
        playedMatches: 5,
        adminGroups: 1,
        joinedGroups: 1,
      },
    });
    for (const call of [mocks.social, mocks.player, mocks.groupCounts])
      expect(call).toHaveBeenCalledWith("user_1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("retains preflight", async () => {
    expect((await OPTIONS(request())).status).toBe(204);
  });
});
