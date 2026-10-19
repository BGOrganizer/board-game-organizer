import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), rankings: vi.fn(), tx: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: async () => ({}), withTransaction: m.tx }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: async () => {} }));
vi.mock("@/app/lib/community/record-services", () => ({
  recordServices: () => ({ groups: { rankings: m.rankings } }),
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/app/lib/notifications/push", () => ({ dispatchNotifications: vi.fn() }));

import { CommunityError } from "@/app/lib/community.error";
import { GET, OPTIONS } from "../route";

const id = "11111111-1111-4111-8111-111111111111",
  context = { params: Promise.resolve({ groupId: id }) };
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ userId: "viewer" });
  m.tx.mockImplementation(async (fn) => fn({}, {}));
  m.rankings.mockResolvedValue({ games: [], players: [], nextCursor: null });
});
it("delegates paginated real-table game/statistics queries to group-authorized service", async () => {
  expect(
    (await GET(new Request("https://api.test?gameId=1&cursor=25&limit=25"), context)).status,
  ).toBe(200);
  expect(m.rankings).toHaveBeenCalledWith("viewer", id, { gameId: 1, cursor: 25, limit: 25 });
  expect((await OPTIONS(new Request("https://api.test", { method: "OPTIONS" }))).status).toBe(204);
});
it("requires authentication and retains membership/private authorization failures", async () => {
  m.auth.mockResolvedValueOnce({ userId: null });
  expect((await GET(new Request("https://api.test"), context)).status).toBe(401);
  m.rankings.mockRejectedValueOnce(new CommunityError(403, "GROUP_MEMBER_REQUIRED"));
  expect((await GET(new Request("https://api.test"), context)).status).toBe(403);
});
it.each(["gameId=0", "cursor=-1", "limit=51", "cursor=2&cursor=3", "unknown=true", "query=abc"])(
  "rejects invalid group leaderboard query %s",
  async (query) => {
    expect((await GET(new Request("https://api.test?" + query), context)).status).toBe(400);
    expect(m.rankings).not.toHaveBeenCalled();
  },
);
