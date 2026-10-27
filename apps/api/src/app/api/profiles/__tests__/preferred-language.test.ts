import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  enrich: vi.fn(),
  mirror: vi.fn(),
  setLanguage: vi.fn(),
  ensure: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/app/lib/clerk", () => ({ enrichSingleUser: m.enrich }));
vi.mock("@/app/lib/db", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: m.ensure }));
vi.mock("@/app/lib/users/users.repository", () => ({
  UsersRepository: vi.fn(() => ({ findById: m.mirror, setPreferredLanguage: m.setLanguage })),
}));
vi.mock("@/app/lib/contacts/relationship.repository", () => ({ RelationshipRepository: vi.fn() }));
vi.mock("@/app/lib/contacts/relationship.service", () => ({
  RelationshipService: vi.fn(() => ({ list: async () => [] })),
}));
vi.mock("@/app/lib/groups/groups.repository", () => ({
  GroupsRepository: vi.fn(() => ({
    listInvitationsForUser: async () => [
      { status: "ACCEPTED", groupId: "mine" },
      { status: "PENDING", groupId: "pending" },
    ],
    listForUser: async () => [{ adminUserId: "viewer" }, { adminUserId: "other" }],
  })),
}));
vi.mock("@/app/lib/matches/matches.repository", () => ({
  MatchesRepository: vi.fn(() => ({ countPlayedByUser: async () => 0 })),
}));

import { GET, OPTIONS, PATCH } from "../route";

const request = (
  body: unknown = { preferredLanguage: "it" },
  query = "",
  contentType = "application/json",
) =>
  new Request(`http://api.test/api/profiles${query}`, {
    method: "PATCH",
    headers: { "Content-Type": contentType, Origin: "https://client.vercel.app" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ isAuthenticated: true, userId: "viewer" });
  m.enrich.mockResolvedValue({
    id: "viewer",
    fullName: "Viewer",
    username: "viewer",
    emailAddress: "v@example.test",
    imageUrl: "avatar",
    bgoRole: "ADMIN",
  });
  m.mirror.mockResolvedValue({ preferredLanguage: "en" });
  m.setLanguage.mockResolvedValue({ matchedCount: 1 });
  m.ensure.mockResolvedValue(undefined);
});
it("uses actual persisted preference and keeps central CORS/no-store headers", async () => {
  const response = await GET(new NextRequest("http://api.test/api/profiles"));
  expect(await response.json()).toMatchObject({
    preferredLanguage: "en",
    bgoRole: "ADMIN",
    stats: { adminGroups: 1, joinedGroups: 1 },
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.mirror).toHaveBeenCalledWith("viewer");
  expect(OPTIONS(request()).headers.get("access-control-allow-methods")).toContain("PATCH");
  m.mirror.mockResolvedValue({ preferredLanguage: "it" });
  expect(await (await GET(new NextRequest("http://api.test/api/profiles"))).json()).toMatchObject({
    preferredLanguage: "it",
  });
});
it("retains missing-mirror/name fallbacks and profile failure", async () => {
  m.mirror.mockResolvedValue(null);
  m.enrich.mockResolvedValue({ id: "viewer", emailAddress: "fallback@example.test" });
  expect(await (await GET(new NextRequest("http://api.test"))).json()).toMatchObject({
    name: "fallback@example.test",
    preferredLanguage: "en",
    username: null,
    avatarUrl: "",
  });
  m.enrich.mockResolvedValue({ id: "viewer" });
  expect(await (await GET(new NextRequest("http://api.test"))).json()).toMatchObject({
    name: "Unknown",
    email: "",
  });
  m.enrich.mockResolvedValue(null);
  expect((await GET(new NextRequest("http://api.test"))).status).toBe(500);
});
it.each([
  { isAuthenticated: false, userId: null },
  { isAuthenticated: false, userId: "viewer" },
  { isAuthenticated: true, userId: null },
])("rejects anonymous preference/profile access %j", async (identity) => {
  m.auth.mockResolvedValue(identity);
  expect((await PATCH(request())).status).toBe(401);
  expect((await GET(new NextRequest("http://api.test"))).status).toBe(401);
  expect(m.setLanguage).not.toHaveBeenCalled();
});
it.each([
  ["{", "", "application/json"],
  ["x".repeat(8193), "", "application/json"],
  [{ preferredLanguage: "fr" }, "", "application/json"],
  [{ preferredLanguage: "it", userId: "other" }, "", "application/json"],
  [{}, "", "application/json"],
  [{ preferredLanguage: "it" }, "?extra=1", "application/json"],
  [
    { preferredLanguage: "it" },
    "?x-vercel-protection-bypass=a&x-vercel-protection-bypass=b",
    "application/json",
  ],
  [{ preferredLanguage: "it" }, "", "text/plain"],
])("validates bounded, strict preference requests", async (body, query, contentType) => {
  expect((await PATCH(request(body, query, contentType))).status).toBe(400);
  expect(m.ensure).not.toHaveBeenCalled();
  expect(m.setLanguage).not.toHaveBeenCalled();
});
it("syncs only the authenticated caller independently of push permission", async () => {
  const response = await PATCH(
    request(
      { preferredLanguage: "it" },
      "?x-vercel-protection-bypass=ok",
      "application/json; charset=utf-8",
    ),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ preferredLanguage: "it" });
  expect(m.ensure).toHaveBeenCalledWith("viewer", {});
  expect(m.setLanguage).toHaveBeenCalledWith("viewer", "it");
  expect(response.headers.get("access-control-allow-origin")).toBe("https://client.vercel.app");
  m.setLanguage.mockResolvedValue({ matchedCount: 0 });
  expect((await PATCH(request())).status).toBe(404);
  m.setLanguage.mockRejectedValue(new Error("db"));
  expect((await PATCH(request())).status).toBe(500);
});
