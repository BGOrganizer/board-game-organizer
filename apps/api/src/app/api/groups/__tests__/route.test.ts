import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ensure: vi.fn(),
  transaction: vi.fn(),
  factory: vi.fn(),
  push: vi.fn(),
  after: vi.fn(),
  db: {},
  session: {},
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/app/lib/db", () => ({
  getDb: async () => mocks.db,
  withTransaction: mocks.transaction,
}));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: mocks.ensure }));
vi.mock("@/app/lib/community/record-services", () => ({ recordServices: mocks.factory }));
vi.mock("@/app/lib/notifications/push", () => ({ dispatchNotifications: mocks.push }));

import { CommunityError } from "@/app/lib/community.error";
import * as assetComplete from "../../group-assets/[assetId]/complete/route";
import * as asset from "../../group-assets/[assetId]/route";
import * as assetStart from "../../group-assets/route";
import * as oldInvitation from "../../group-invitations/[invitationId]/route";
import * as revoke from "../[groupId]/bans/[userId]/route";
import * as bans from "../[groupId]/bans/route";
import * as invitees from "../[groupId]/invitees/route";
import * as person from "../[groupId]/members/[userId]/route";
import * as people from "../[groupId]/members/route";
import * as membership from "../[groupId]/membership/route";
import * as review from "../[groupId]/review/route";
import * as detail from "../[groupId]/route";
import * as discovery from "../discovery/route";
import * as groupsRoute from "../route";

const id = "11111111-1111-4111-8111-111111111111";
const input = { type: "PRIVATE", name: "Friday gamers", invitedUserIds: [] };
const context = { params: Promise.resolve({ groupId: id, userId: "guest", assetId: id }) };
const request = (method = "GET", body?: unknown, query = "") =>
  new Request(`https://api.test/api/groups${query}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
  });
const services = {
  groups: {
    save: vi.fn(),
    detail: vi.fn(),
    list: vi.fn(),
    request: vi.fn(),
    invite: vi.fn(),
    invitationCandidates: vi.fn(),
    members: vi.fn(),
    membershipAction: vi.fn(),
    ban: vi.fn(),
    revoke: vi.fn(),
    review: vi.fn(),
    moderationDetail: vi.fn(),
    remove: vi.fn(),
  },
  assets: { start: vi.fn(), append: vi.fn(), complete: vi.fn(), preview: vi.fn() },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.ensure.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(async (fn) => fn(mocks.session, mocks.db));
  mocks.factory.mockReturnValue(services);
  for (const domain of Object.values(services))
    for (const call of Object.values(domain)) call.mockReset().mockResolvedValue({ id });
});
describe("unified Group HTTP contracts", () => {
  it("authenticates Group-scoped invitation candidates and validates search/cursor paging without broad fallback", async () => {
    const response = await invitees.GET(
      request("GET", undefined, "?limit=1&cursor=friend&query=board"),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(services.groups.invitationCandidates).toHaveBeenCalledWith("owner", id, {
      limit: 1,
      cursor: "friend",
      query: "board",
    });
    for (const query of [
      "?query=abc",
      "?limit=0",
      "?limit=51",
      "?unknown=1",
      "?cursor=",
      "?query=board&query=other",
    ])
      expect((await invitees.GET(request("GET", undefined, query), context)).status).toBe(400);
    expect(
      (await invitees.GET(request(), { params: Promise.resolve({ groupId: "bad" }) })).status,
    ).toBe(400);
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await invitees.GET(request(), context)).status).toBe(401);
    services.groups.invitationCandidates.mockRejectedValueOnce(
      new CommunityError(403, "GROUP_ADMIN_REQUIRED"),
    );
    expect((await invitees.GET(request(), context)).status).toBe(403);
    expect((await invitees.OPTIONS(request("OPTIONS"))).status).toBe(204);
  });
  it("lists canonical roles and source searches; validates creates without changing immutable type", async () => {
    expect((await groupsRoute.GET(request("GET", undefined, "?roles=accepted,admin"))).status).toBe(
      200,
    );
    expect(services.groups.list).toHaveBeenCalledWith("owner", "mine", {
      limit: 20,
      roles: ["admin", "accepted"],
    });
    const created = await groupsRoute.POST(request("POST", input));
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("private, no-store");
    expect(services.groups.save).toHaveBeenCalledWith("owner", input);
    for (const body of [
      { name: "legacy", isPublic: true },
      { ...input, unexpected: true },
      { ...input, type: "PUBLIC" },
    ])
      expect((await groupsRoute.POST(request("POST", body))).status).toBe(400);
    expect((await groupsRoute.GET(request("GET", undefined, "?unknown=1"))).status).toBe(400);
    expect((await groupsRoute.OPTIONS(request("OPTIONS"))).status).toBe(204);
    expect("DELETE" in detail).toBe(true);
    expect("DELETE" in membership).toBe(false);
  });
  it("requires authentication, a valid Group ID, version and explicit cascade consent for deletion", async () => {
    const body = { version: 2, deleteEvents: true };
    const response = await detail.DELETE(request("DELETE", body), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(services.groups.remove).toHaveBeenCalledWith("owner", id, body);
    for (const invalid of [
      undefined,
      {},
      { version: 2 },
      { ...body, deleteEvents: false },
      { ...body, extra: true },
    ])
      expect((await detail.DELETE(request("DELETE", invalid), context)).status).toBe(400);
    expect(
      (
        await detail.DELETE(request("DELETE", body), {
          params: Promise.resolve({ groupId: "bad" }),
        })
      ).status,
    ).toBe(400);
    expect((await detail.DELETE(request("DELETE", body, "?unknown=1"), context)).status).toBe(400);
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await detail.DELETE(request("DELETE", body), context)).status).toBe(401);
    services.groups.remove.mockRejectedValueOnce(new CommunityError(403, "GROUP_ADMIN_REQUIRED"));
    expect((await detail.DELETE(request("DELETE", body), context)).status).toBe(403);
    services.groups.remove.mockRejectedValueOnce(new CommunityError(409, "GROUP_CHANGED"));
    expect((await detail.DELETE(request("DELETE", body), context)).status).toBe(409);
  });
  it("routes detail, versioned edits, moderation and explicit self membership requests", async () => {
    await detail.GET(request(), context);
    expect(services.groups.detail).toHaveBeenCalledWith("owner", id);
    await detail.PATCH(request("PATCH", { name: input.name, version: 1 }), context);
    expect(services.groups.save).toHaveBeenLastCalledWith(
      "owner",
      { name: input.name, version: 1 },
      id,
    );
    await review.GET(request(), context);
    expect(services.groups.moderationDetail).toHaveBeenCalledWith("owner", id);
    await review.PATCH(request("PATCH", { decision: "approve", version: 1 }), context);
    expect(services.groups.review).toHaveBeenCalledWith("owner", id, {
      decision: "approve",
      version: 1,
    });
    await membership.POST(request("POST"), context);
    expect(services.groups.request).toHaveBeenCalledWith("owner", id);
    expect((await discovery.GET(request())).status).toBe(400);
    await discovery.GET(request("GET", undefined, "?query=club"));
    expect(services.groups.list).toHaveBeenLastCalledWith("owner", "public", {
      query: "club",
      limit: 20,
    });
  });
  it("routes accepted/pending/excluded feeds, friend invitations, versioned decisions and ban revocation", async () => {
    await people.GET(request("GET", undefined, "?mode=pending&limit=1"), context);
    expect(services.groups.members).toHaveBeenCalledWith("owner", id, "pending", { limit: 1 });
    await people.GET(request("GET", undefined, "?mode=bans"), context);
    expect(services.groups.members).toHaveBeenCalledWith("owner", id, "banned", { limit: 20 });
    await people.POST(request("POST", { userId: "guest" }), context);
    expect(services.groups.invite).toHaveBeenCalledWith("owner", id, "guest");
    await person.PATCH(request("PATCH", { action: "approve", version: 2 }), context);
    expect(services.groups.membershipAction).toHaveBeenCalledWith("owner", id, "guest", {
      action: "approve",
      version: 2,
    });
    await bans.POST(request("POST", { userId: "guest", until: null }), context);
    expect(services.groups.ban).toHaveBeenCalledWith("owner", id, { userId: "guest", until: null });
    await revoke.DELETE(request("DELETE"), context);
    expect(services.groups.revoke).toHaveBeenCalledWith("owner", id, "guest");
    expect(
      (
        await person.PATCH(request("PATCH", { action: "approve", version: 2 }), {
          params: Promise.resolve({ groupId: id, userId: " " }),
        })
      ).status,
    ).toBe(400);
  });
  it("keeps chunk ownership/completion/preview in the asset service and validates metadata/chunks", async () => {
    await assetStart.POST(request("POST", { mimeType: "image/png", byteLength: 3 }));
    expect(services.assets.start).toHaveBeenCalledWith("owner", {
      mimeType: "image/png",
      byteLength: 3,
    });
    await asset.PATCH(request("PATCH", { offset: 0, base64: "YWJj" }), context);
    expect(services.assets.append).toHaveBeenCalledWith("owner", id, { offset: 0, base64: "YWJj" });
    await asset.GET(request(), context);
    expect(services.assets.preview).toHaveBeenCalledWith("owner", id);
    await assetComplete.POST(request("POST"), context);
    expect(services.assets.complete).toHaveBeenCalledWith("owner", id);
    expect(
      (await assetStart.POST(request("POST", { mimeType: "text/plain", byteLength: 3 }))).status,
    ).toBe(400);
  });
  it("requires auth, preserves domain failures, hides unknown exceptions and rejects invalid IDs/JSON", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await groupsRoute.POST(request("POST", input))).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    services.groups.save.mockRejectedValueOnce(new CommunityError(403, "GROUP_ADMIN_REQUIRED"));
    const forbidden = await groupsRoute.POST(request("POST", input));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "GROUP_ADMIN_REQUIRED" });
    services.groups.save.mockRejectedValueOnce(new Error("private diagnostic"));
    const failed = await groupsRoute.POST(request("POST", input));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Internal server error" });
    expect(
      (await detail.GET(request(), { params: Promise.resolve({ groupId: "bad" }) })).status,
    ).toBe(400);
    expect(
      (
        await groupsRoute.POST(
          new Request("https://api.test/api/groups", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400);
  });
  it("replays body safely on transaction retry and sends only committed notification IDs after commit", async () => {
    const rolledBack = new ObjectId(),
      committed = new ObjectId();
    let attempt = 0;
    mocks.factory.mockImplementation((_db, _session, ids: ObjectId[]) => {
      services.groups.save.mockImplementation(async () => {
        ids.push(attempt++ === 0 ? rolledBack : committed);
        return { id };
      });
      return services;
    });
    mocks.transaction.mockImplementation(async (fn) => {
      await fn(mocks.session, mocks.db);
      expect(mocks.after).not.toHaveBeenCalled();
      return fn(mocks.session, mocks.db);
    });
    const req = request("POST", input),
      json = vi.spyOn(req, "json");
    expect((await groupsRoute.POST(req)).status).toBe(201);
    expect(json).toHaveBeenCalledOnce();
    expect(services.groups.save).toHaveBeenCalledTimes(2);
    expect(mocks.push).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.push).toHaveBeenCalledWith([committed]);
  });
  it("never schedules push on aborted transactions and retires old invitation writes without database access", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("aborted"));
    expect((await groupsRoute.POST(request("POST", input))).status).toBe(500);
    expect(mocks.after).not.toHaveBeenCalled();
    mocks.transaction.mockClear();
    expect((await oldInvitation.PATCH(request("PATCH"))).status).toBe(410);
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await oldInvitation.PATCH(request("PATCH"))).status).toBe(401);
  });
});
