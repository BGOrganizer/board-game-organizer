import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "@/app/lib/community.error";
import { GET as network } from "../../community/activities/route";
import { GET as activities } from "../[userId]/activities/route";
import { GET as history } from "../[userId]/games/[gameId]/route";
import { GET as games } from "../[userId]/games/route";
import { OPTIONS, GET as profile } from "../[userId]/route";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  ensure: vi.fn(),
  db: vi.fn(async () => ({})),
  profile: vi.fn(),
  feed: vi.fn(),
  network: vi.fn(),
  games: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: m.db }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: m.ensure }));
vi.mock("@/app/lib/profile/profile.service", () => ({
  ProfileService: vi.fn(() => ({
    profile: m.profile,
    feed: m.feed,
    networkFeed: m.network,
    games: m.games,
    history: m.history,
  })),
}));
const context = (userId = "subject", gameId = "7") => ({
  params: Promise.resolve({ userId, gameId }),
});
const request = (suffix = "") => new Request(`http://api.test/api/profiles/subject${suffix}`);
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ isAuthenticated: true, userId: "viewer" });
  m.db.mockResolvedValue({});
  m.profile.mockResolvedValue({ id: "subject" });
  m.feed.mockResolvedValue({ items: [], nextCursor: null });
  m.network.mockResolvedValue({ items: [], nextCursor: null });
  m.games.mockResolvedValue({ items: [], nextCursor: null });
  m.history.mockResolvedValue({ points: [], nextCursor: null });
});
it("requires a fully authenticated viewer on all direct endpoints, independent of target id", async () => {
  for (const identity of [
    { isAuthenticated: false, userId: "viewer" },
    { isAuthenticated: true, userId: null },
  ]) {
    m.auth.mockResolvedValue(identity);
    expect((await network(request())).status).toBe(401);
    for (const read of [profile, activities, games, history])
      expect((await read(request(), context())).status).toBe(401);
  }
  expect(m.db).not.toHaveBeenCalled();
  expect(m.ensure).not.toHaveBeenCalled();
});
it("repairs only the authenticated mirror, retains no-store and CORS/preflight", async () => {
  const response = await profile(request("?x-vercel-protection-bypass=allowed"), context());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: "subject" });
  expect(m.ensure).toHaveBeenCalledWith("viewer", {});
  expect(m.profile).toHaveBeenCalledWith("viewer", "subject");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(OPTIONS(request()).status).toBe(204);
});
it("uses strict shared query parsing without turning the Preview protection bypass into a domain filter", async () => {
  expect(
    (
      await activities(
        request("?limit=5&kind=played&x-vercel-protection-bypass=allowed"),
        context(),
      )
    ).status,
  ).toBe(200);
  expect(m.feed).toHaveBeenCalledWith("viewer", "subject", { limit: 5, kind: "played" });
  expect(
    (await games(request("?query=chess&cursor=20&x-vercel-protection-bypass=allowed"), context()))
      .status,
  ).toBe(200);
  expect(m.games).toHaveBeenCalledWith("viewer", "subject", 20, "chess");
  expect(
    (await history(request("?cursor=101&x-vercel-protection-bypass=allowed"), context())).status,
  ).toBe(200);
  expect(m.history).toHaveBeenCalledWith("viewer", "subject", 7, 101);
});
it.each([
  "?other=1",
  "?cursor=1&cursor=2",
  "?limit=1",
  "?kind=won",
  "?cursor=2030-99-99T99:99:99.000Z%7C11111111-1111-4111-8111-111111111111",
  "?cursor=2030-06-03T12:00:00.000Z%7C------------------------------------",
  "?x-vercel-protection-bypass=",
  "?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b",
])("rejects malformed/duplicate activity queries %s", async (query) => {
  expect((await activities(request(query), context())).status).toBe(400);
  expect(m.feed).not.toHaveBeenCalled();
});
it("validates defaults, numeric game ids, game paging and unsupported profile filters", async () => {
  await activities(request(), context());
  expect(m.feed).toHaveBeenCalledWith("viewer", "subject", { limit: 10 });
  await games(request(), context());
  expect(m.games).toHaveBeenCalledWith("viewer", "subject", 0, "");
  await history(request(), context());
  expect(m.history).toHaveBeenCalledWith("viewer", "subject", 7, undefined);
  expect((await profile(request("?unknown=1"), context())).status).toBe(400);
  expect((await games(request("?cursor=-1"), context())).status).toBe(400);
  expect((await games(request("?cursor=1&cursor=2"), context())).status).toBe(400);
  for (const id of ["0", "-1", "1.1", "no", "9007199254740992"])
    expect((await history(request(), context("subject", id))).status).toBe(400);
  expect((await profile(request(), context(""))).status).toBe(400);
});
it("authenticates network feeds from the session, not a supplied viewer, and validates network/cursor/limit", async () => {
  const response = await network(
    request("?network=friends&limit=10&x-vercel-protection-bypass=allowed"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.network).toHaveBeenCalledWith("viewer", { network: "friends", limit: 10 });
  for (const query of [
    "?network=followers",
    "?limit=5",
    "?viewer=someone",
    "?cursor=bad",
    "?network=all&network=friends",
  ])
    expect((await network(request(query))).status).toBe(400);
});
it("keeps denial status while hiding unknown internal errors", async () => {
  m.profile.mockRejectedValueOnce(new CommunityError(404, "PROFILE_NOT_FOUND"));
  const denied = await profile(request(), context());
  expect(denied.status).toBe(404);
  expect(await denied.json()).toEqual({ error: "PROFILE_NOT_FOUND" });
  m.games.mockRejectedValueOnce(new Error("private connection details"));
  const failure = await games(request(), context());
  expect(failure.status).toBe(500);
  expect(await failure.json()).toEqual({ error: "Could not load profile" });
  expect(failure.headers.get("cache-control")).toBe("private, no-store");
});
