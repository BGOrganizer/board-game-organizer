import { auth } from "@clerk/nextjs/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as invitationRoute from "@/app/api/group-invitations/[invitationId]/route";
import * as membershipRoute from "@/app/api/groups/[groupId]/membership/route";
import * as detailRoute from "@/app/api/groups/[groupId]/route";
import * as groupsRoute from "@/app/api/groups/route";
import { withTransaction } from "@/app/lib/db";
import { GroupError, GroupService } from "@/app/lib/group.service";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/app/lib/ensureCurrentUser", () => ({ ensureCurrentUser: vi.fn() }));
vi.mock("@/app/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/db")>();
  return { ...actual, withTransaction: vi.fn(), getDb: vi.fn(async () => ({})) };
});

const groupId = "1f454adb-43e3-47ad-8c29-57b97a55a211";
const invitationId = "7a3be646-063b-4b02-9c0b-ddcb6b468c41";
const group = { id: groupId, name: "Game Night", adminUserId: "user_admin", isPublic: false };
const body = { name: "Game Night", isPublic: false, invitedUserIds: [] };
const request = (path: string, method = "GET", input?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: input === undefined ? undefined : { "Content-Type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
const context = { params: Promise.resolve({ groupId }) };
const invitationContext = { params: Promise.resolve({ invitationId }) };

describe("group API routes", () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ userId: "user_admin" } as never);
    vi.mocked(withTransaction).mockImplementation(async (operation) =>
      operation({ id: "session" } as never, {} as never),
    );
    vi.spyOn(GroupService.prototype, "list").mockResolvedValue([group] as never);
    vi.spyOn(GroupService.prototype, "detail").mockResolvedValue(group as never);
    vi.spyOn(GroupService.prototype, "create").mockResolvedValue(group as never);
    vi.spyOn(GroupService.prototype, "update").mockResolvedValue(group as never);
    vi.spyOn(GroupService.prototype, "archive").mockResolvedValue();
    vi.spyOn(GroupService.prototype, "respond").mockResolvedValue(group as never);
    vi.spyOn(GroupService.prototype, "leave").mockResolvedValue();
  });
  afterEach(() => vi.restoreAllMocks());

  it("lists and creates groups with validated data", async () => {
    const list = await groupsRoute.GET(request("/api/groups?x-vercel-protection-bypass=test"));
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ groups: [group] });
    const created = await groupsRoute.POST(request("/api/groups", "POST", body));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ group });
    expect(GroupService.prototype.create).toHaveBeenCalledWith("user_admin", body);
    expect(
      (await groupsRoute.POST(request("/api/groups", "POST", { ...body, name: "abc" }))).status,
    ).toBe(400);
    expect(
      (
        await groupsRoute.POST(
          request("/api/groups", "POST", {
            ...body,
            invitedUserIds: ["user_friend", "user_friend"],
          }),
        )
      ).status,
    ).toBe(400);
    expect((await groupsRoute.GET(request("/api/groups?unexpected=true"))).status).toBe(400);
  });

  it("requires authentication and preserves authorization errors", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as never);
    expect((await groupsRoute.GET(request("/api/groups"))).status).toBe(401);
    vi.mocked(GroupService.prototype.update).mockRejectedValueOnce(
      new GroupError(403, "Only admin can edit"),
    );
    const denied = await detailRoute.PATCH(
      request(`/api/groups/${groupId}`, "PATCH", body),
      context,
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "Only admin can edit" });
  });

  it("routes detail, edit, archive, invitation responses and membership removal", async () => {
    expect((await detailRoute.GET(request(`/api/groups/${groupId}`), context)).status).toBe(200);
    expect(
      (await detailRoute.PATCH(request(`/api/groups/${groupId}`, "PATCH", body), context)).status,
    ).toBe(200);
    expect(GroupService.prototype.update).toHaveBeenCalledWith("user_admin", groupId, body);
    expect(
      (await detailRoute.DELETE(request(`/api/groups/${groupId}`, "DELETE"), context)).status,
    ).toBe(200);
    expect(GroupService.prototype.archive).toHaveBeenCalledWith("user_admin", groupId);
    expect(
      (
        await invitationRoute.PATCH(
          request(`/api/group-invitations/${invitationId}`, "PATCH", {
            decision: "accept",
          }),
          invitationContext,
        )
      ).status,
    ).toBe(200);
    expect(GroupService.prototype.respond).toHaveBeenCalledWith(
      "user_admin",
      invitationId,
      "accept",
    );
    expect(
      (
        await membershipRoute.DELETE(
          request(`/api/groups/${groupId}/membership`, "DELETE"),
          context,
        )
      ).status,
    ).toBe(200);
    expect(GroupService.prototype.leave).toHaveBeenCalledWith("user_admin", groupId);
  });

  it("rejects malformed IDs, bodies and unexpected query parameters before mutations", async () => {
    const invalid = { params: Promise.resolve({ groupId: "bad" }) };
    expect((await detailRoute.DELETE(request("/api/groups/bad", "DELETE"), invalid)).status).toBe(
      400,
    );
    expect(
      (await membershipRoute.DELETE(request("/api/groups/bad/membership", "DELETE"), invalid))
        .status,
    ).toBe(400);
    expect(
      (
        await invitationRoute.PATCH(
          request("/api/group-invitations/bad", "PATCH", { decision: "accept" }),
          { params: Promise.resolve({ invitationId: "bad" }) },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await invitationRoute.PATCH(
          request(`/api/group-invitations/${invitationId}`, "PATCH", {
            decision: "other",
          }),
          invitationContext,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await detailRoute.PATCH(
          request(`/api/groups/${groupId}`, "PATCH", { isPublic: "yes" }),
          context,
        )
      ).status,
    ).toBe(400);
    expect(GroupService.prototype.update).not.toHaveBeenCalled();
  });
});
