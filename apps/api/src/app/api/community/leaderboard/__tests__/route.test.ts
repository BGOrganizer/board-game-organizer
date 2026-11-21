import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), leaderboard: vi.fn(), tx: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: async () => ({}), withTransaction: m.tx }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: async () => {} }));
vi.mock("@/app/lib/community/record-services", () => ({
  recordServices: () => ({ globalLeaderboard: m.leaderboard }),
}));
vi.mock("@/app/lib/notifications/push", () => ({ dispatchNotifications: vi.fn() }));

import { GET, OPTIONS } from "../route";

const empty = { games: [], players: [], nextCursor: null };
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ userId: "viewer" });
  m.tx.mockImplementation(async (read) => read({}, {}));
  m.leaderboard.mockResolvedValue(empty);
});

it("serves the authenticated global page with validated source ordering and no shared caching", async () => {
  const response = await GET(
    new Request("https://api.test?gameId=17&sort=nd&direction=asc&cursor=25"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual(empty);
  expect(m.leaderboard).toHaveBeenCalledWith("viewer", {
    gameId: 17,
    sort: "nd",
    direction: "asc",
    cursor: 25,
    limit: 25,
  });
  expect((await OPTIONS(new Request("https://api.test", { method: "OPTIONS" }))).status).toBe(204);
});

it("requires authentication before querying Community rankings", async () => {
  m.auth.mockResolvedValueOnce({ userId: null });
  expect((await GET(new Request("https://api.test"))).status).toBe(401);
  expect(m.leaderboard).not.toHaveBeenCalled();
});

it.each(["groupId=foreign", "cursor=-1", "sort=winner", "direction=ASC", "limit=25&limit=26"])(
  "rejects invalid global leaderboard query %s",
  async (query) => {
    expect((await GET(new Request(`https://api.test?${query}`))).status).toBe(400);
    expect(m.leaderboard).not.toHaveBeenCalled();
  },
);
