import type { Db } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";
import { CommunityError } from "../../community.error";
import { ProfileService } from "../profile.service";

const m = vi.hoisted(() => ({
  user: vi.fn(),
  social: vi.fn(),
  player: vi.fn(),
  games: vi.fn(),
  history: vi.fn(),
  blocked: vi.fn(),
  blockedIds: vi.fn(),
  page: vi.fn(),
  event: vi.fn(),
  group: vi.fn(),
}));
vi.mock("../profile.repository", () => ({
  ProfileRepository: vi.fn(() => ({
    user: m.user,
    social: m.social,
    player: m.player,
    games: m.games,
    history: m.history,
  })),
}));
vi.mock("../profile-activities.repository", () => ({
  ProfileActivitiesRepository: vi.fn(() => ({ page: m.page })),
}));
vi.mock("../../contacts/relationship.repository", () => ({
  RelationshipRepository: vi.fn(() => ({ isBlocked: m.blocked, getBlockedUserIds: m.blockedIds })),
}));
vi.mock("../../community/record-services", () => ({
  recordServices: () => ({ events: { activityResource: m.event }, groups: { detail: m.group } }),
}));
const service = () => new ProfileService({} as Db);
const at = "2030-06-03T12:00:00.000Z";
const row = (id: number, extra = {}) => ({
  id: String(id),
  source: `source:${id}`,
  userId: "subject",
  kind: "follower",
  occurredAt: at,
  otherUserId: `other${id}`,
  ...extra,
});
beforeEach(() => {
  vi.resetAllMocks();
  m.user.mockImplementation(async (id) => ({
    clerkId: id,
    name: "Name",
    username: "name",
    email: "private@example.test",
    mobileNumber: "private-phone",
    avatarUrl: null,
    bgoRole: "ADMIN",
  }));
  m.social.mockResolvedValue({ friends: 1, followers: 2, following: 3 });
  m.player.mockResolvedValue({ gamesPlayed: 4, gamesWon: 1, winRate: 25 });
  m.blocked.mockResolvedValue(false);
  m.blockedIds.mockResolvedValue([]);
  m.page.mockResolvedValue([]);
});
it("returns only public identity and approved aggregate fields, never email/phone/account/role", async () => {
  const value = await service().profile("viewer", "subject");
  expect(value).toEqual({
    id: "subject",
    name: "Name",
    username: "name",
    avatarUrl: null,
    social: { friends: 1, followers: 2, following: 3 },
    player: { gamesPlayed: 4, gamesWon: 1, winRate: 25 },
  });
  expect(m.blocked).toHaveBeenCalledWith("viewer", "subject");
});
it("does not leak the email fallback through profile names or social activity context", async () => {
  m.user.mockResolvedValue({
    name: "private@example.test",
    email: "private@example.test",
    username: "safe",
  });
  expect((await service().profile("viewer", "subject")).name).toBe("safe");
  m.page.mockResolvedValue([row(1)]);
  expect((await service().feed("viewer", "subject", { limit: 5 })).items[0].context).toBe("safe");
  m.user.mockResolvedValue({});
  expect((await service().profile("viewer", "subject")).name).toBe("");
  expect((await service().feed("viewer", "subject", { limit: 5 })).items[0].context).toBe("");
});
it("fails closed on every profile endpoint when either blocking direction or a missing subject denies access", async () => {
  m.blocked.mockResolvedValue(true);
  const s = service();
  for (const invoke of [
    () => s.profile("viewer", "subject"),
    () => s.games("viewer", "subject", 0, ""),
    () => s.history("viewer", "subject", 1),
    () => s.feed("viewer", "subject", { limit: 5 }),
  ])
    await expect(invoke()).rejects.toMatchObject({ status: 404, message: "PROFILE_NOT_FOUND" });
  expect(m.games).not.toHaveBeenCalled();
  expect(m.history).not.toHaveBeenCalled();
  expect(m.page).not.toHaveBeenCalled();
  m.blocked.mockResolvedValue(false);
  m.user.mockResolvedValue(null);
  await expect(s.profile("viewer", "missing")).rejects.toMatchObject({ status: 404 });
  await expect(s.profile("viewer", "")).rejects.toMatchObject({ status: 404 });
});
it("keeps self reads and source paging parameters; never adds parent permission from a profile", async () => {
  const s = service();
  await s.profile("viewer", "viewer");
  expect(m.blocked).not.toHaveBeenCalled();
  m.games.mockResolvedValue({ items: [], nextCursor: null });
  m.history.mockResolvedValue({ points: [] });
  await s.games("viewer", "subject", 20, "[Chess]");
  await s.history("viewer", "subject", 7, 101);
  expect(m.games).toHaveBeenCalledWith("subject", 20, "[Chess]");
  expect(m.history).toHaveBeenCalledWith("subject", 7, 101);
});
it("authorizes before the visible page limit, crosses denied source chunks, returns only visible cursors", async () => {
  const first = Array.from({ length: 50 }, (_, i) =>
    row(i, { groupId: "private", otherUserId: undefined }),
  );
  const second = Array.from({ length: 11 }, (_, i) => row(50 + i));
  m.page.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  m.group.mockResolvedValue({
    id: "private",
    type: "PRIVATE",
    name: "secret",
    canViewEvents: false,
  });
  const result = await service().feed("viewer", "subject", { kind: "follower", limit: 10 });
  expect(result.items.map((v) => v.id)).toEqual(
    Array.from({ length: 10 }, (_, i) => String(50 + i)),
  );
  expect(result.nextCursor).toBe(`${at}|59`);
  expect(m.page.mock.calls).toEqual([
    ["subject", "follower", undefined],
    ["subject", "follower", `${at}|49`],
  ]);
  expect(m.group).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("resolves current resource authorization and excludes departed private groups, blocked actors and removed resources", async () => {
  m.blockedIds.mockResolvedValue(["blocked"]);
  m.page.mockResolvedValue([
    row(1, { eventId: "gone", otherUserId: undefined }),
    row(2, { groupId: "private", otherUserId: undefined }),
    row(3, { otherUserId: "blocked" }),
    row(4, { otherUserId: "missing" }),
    row(5, { groupId: "public", otherUserId: undefined }),
    row(6, { otherUserId: undefined }),
  ]);
  m.event.mockRejectedValue(new CommunityError(404, "EVENT_NOT_FOUND"));
  m.group.mockImplementation(async (_viewer, id) => ({
    id,
    name: id,
    type: id === "public" ? "PUBLIC" : "PRIVATE",
    canViewEvents: false,
  }));
  m.user.mockImplementation(async (id) => (id === "missing" ? null : { name: id }));
  const result = await service().feed("viewer", "subject", { limit: 5 });
  expect(result).toEqual({
    items: [
      {
        id: "5",
        kind: "follower",
        occurredAt: at,
        context: "public",
        href: "/groups/public",
        groupId: "public",
      },
    ],
    nextCursor: null,
  });
  expect(m.event).toHaveBeenCalledWith("viewer", "gone", undefined);
});
it("keeps one played outcome and separate milestone, reuses source lookup and never consumes notification reads", async () => {
  m.page.mockResolvedValue([
    row(1, {
      kind: "played",
      eventId: "event",
      tableId: "table",
      outcome: "won",
      otherUserId: undefined,
    }),
    row(2, {
      kind: "milestone",
      eventId: "event",
      tableId: "table",
      milestone: 5,
      otherUserId: undefined,
    }),
  ]);
  m.event.mockResolvedValue({
    name: "Table",
    href: "/events/event/tables/table",
    groupId: "group",
  });
  const result = await service().feed("viewer", "subject", { limit: 5 });
  expect(result.items[0]).toMatchObject({ kind: "played", outcome: "won", groupId: "group" });
  expect(result.items[1]).toMatchObject({ kind: "milestone", milestone: 5 });
  expect(m.event).toHaveBeenCalledOnce();
  expect(result.nextCursor).toBeNull();
});
it("does not convert source transport/other domain failures to an empty feed", async () => {
  m.page.mockResolvedValue([row(1, { eventId: "event" })]);
  m.event.mockRejectedValue(new Error("database unavailable"));
  await expect(service().feed("viewer", "subject", { limit: 5 })).rejects.toThrow(
    "database unavailable",
  );
  m.event.mockRejectedValue(new CommunityError(409, "EVENT_CHANGED"));
  await expect(service().feed("viewer", "subject", { limit: 5 })).rejects.toMatchObject({
    status: 409,
  });
  m.event.mockRejectedValue(new CommunityError(403, "GROUP_MEMBER_REQUIRED"));
  expect((await service().feed("viewer", "subject", { limit: 5 })).items).toEqual([]);
});
it("ends an exhausted full denied chunk without manufacturing an inaccessible next cursor", async () => {
  m.page
    .mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => row(i, { otherUserId: "blocked" })))
    .mockResolvedValueOnce([]);
  m.blockedIds.mockResolvedValue(["blocked"]);
  expect(await service().feed("viewer", "subject", { limit: 5 })).toEqual({
    items: [],
    nextCursor: null,
  });
});
