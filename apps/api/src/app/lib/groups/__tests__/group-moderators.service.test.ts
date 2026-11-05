import type { GroupBan, GroupMembership, GroupRecord } from "@board-game-organizer/schemas";
import { beforeEach, expect, it, vi } from "vitest";
import { GroupRecordsService } from "../group-records.service";

vi.mock("../../locations/community-location", () => ({
  verifyCommunityLocation: vi.fn(async (v) => v),
}));
vi.mock("../../organizations/community-role", () => ({
  requireBgoModerator: vi.fn(async () => {
    throw new Error("Global moderator required");
  }),
}));
const at = "2030-01-01T00:00:00.000Z",
  id = "11111111-1111-4111-8111-111111111111";
function setup() {
  let group: GroupRecord = {
    id,
    adminUserId: "owner",
    type: "PRIVATE",
    approved: { name: "Private group" },
    reservedNames: [],
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
  const members = new Map<string, GroupMembership>(),
    bans = new Map<string, GroupBan>();
  for (const userId of ["mod", "peer", "member", "request"])
    members.set(userId, {
      id,
      groupId: id,
      userId,
      kind: userId === "request" ? "REQUEST" : "INVITATION",
      status: userId === "request" ? "PENDING" : "ACCEPTED",
      role: userId === "mod" || userId === "peer" ? "MODERATOR" : "MEMBER",
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
  const groups = {
    find: vi.fn(async () => group),
    lock: vi.fn(async () => group),
    membership: vi.fn(async (_id: string, userId: string) => members.get(userId) ?? null),
    ban: vi.fn(async (_id: string, userId: string) => bans.get(userId) ?? null),
    saveMembership: vi.fn(async (row: GroupMembership) => {
      members.set(row.userId, row);
      return row;
    }),
    saveBan: vi.fn(async (row: GroupBan) => {
      bans.set(row.userId, row);
      return row;
    }),
    save: vi.fn(async (row: GroupRecord) => {
      group = row;
      return row;
    }),
    remove: vi.fn(async () => ({ id, eventIds: [] })),
    countMembers: vi.fn(async () => members.size),
    countEvents: vi.fn(async () => 0),
    countPendingRequests: vi.fn(async () => 1),
    managerIds: vi.fn(async () => [
      "owner",
      ...[...members.values()]
        .filter((m) => m.status === "ACCEPTED" && m.role === "MODERATOR")
        .map((m) => m.userId),
    ]),
  };
  const users = {
    findById: vi.fn(async (userId: string) => ({ clerkId: userId })),
    moderatorIds: vi.fn(async () => []),
  };
  const assets = { claim: vi.fn(async () => true), expireUnused: vi.fn() };
  const relationships = { isFriend: vi.fn(async () => true), isBlocked: vi.fn(async () => false) };
  const notifications = {
    notifyMany: vi.fn(async () => []),
    acknowledgeItems: vi.fn(),
    retargetItems: vi.fn(),
  };
  const departure = vi.fn(async () => {}),
    assertBanAllowed = vi.fn(async () => {});
  const service = new GroupRecordsService(
    groups as never,
    assets as never,
    users as never,
    relationships as never,
    notifications as never,
    departure,
    assertBanAllowed,
    {} as never,
  );
  return { service, groups, members, bans, notifications, departure, assertBanAllowed };
}
beforeEach(() => vi.clearAllMocks());
it("only creator appoints/demotes accepted members with pinned versions and safe Group capabilities", async () => {
  const f = setup();
  for (const actor of ["mod", "member", "outsider"])
    for (const action of ["promote", "demote"] as const)
      await expect(
        f.service.membershipAction(actor, id, "member", { action, version: 1 }),
      ).rejects.toMatchObject({ code: "GROUP_ADMIN_REQUIRED" });
  await expect(
    f.service.membershipAction("owner", id, "request", { action: "promote", version: 1 }),
  ).rejects.toMatchObject({ code: "MEMBERSHIP_CHANGED" });
  await expect(
    f.service.membershipAction("owner", id, "owner", { action: "promote", version: 1 }),
  ).rejects.toMatchObject({ code: "GROUP_ADMIN_CANNOT_LEAVE" });
  const promoted = await f.service.membershipAction("owner", id, "member", {
    action: "promote",
    version: 1,
  });
  expect(promoted).toMatchObject({ role: "MODERATOR", status: "ACCEPTED", version: 2 });
  expect(await f.service.detail("member", id)).toMatchObject({
    role: "moderator",
    canEdit: true,
    canInvite: true,
    pendingRequestCount: 1,
    adminUserId: "owner",
  });
  await expect(
    f.service.membershipAction("owner", id, "member", { action: "demote", version: 1 }),
  ).rejects.toMatchObject({ code: "MEMBERSHIP_CHANGED" });
  await expect(
    f.service.membershipAction("owner", id, "member", { action: "promote", version: 2 }),
  ).rejects.toMatchObject({ code: "MEMBERSHIP_CHANGED" });
  expect(
    await f.service.membershipAction("owner", id, "member", { action: "demote", version: 2 }),
  ).toMatchObject({ role: "MEMBER", status: "ACCEPTED", version: 3 });
  expect(await f.service.detail("member", id)).toMatchObject({
    role: "accepted",
    canEdit: false,
    canInvite: false,
    pendingRequestCount: null,
  });
  expect(f.departure).not.toHaveBeenCalled();
});
it("moderators manage Group content, invitations and ordinary requests without taking ownership", async () => {
  const f = setup();
  expect(await f.service.save("mod", { version: 1, name: "Edited group" }, id)).toMatchObject({
    adminUserId: "owner",
    name: "Edited group",
    role: "moderator",
  });
  await f.service.invite("mod", id, "newcomer");
  expect(f.members.get("newcomer")).toMatchObject({ status: "PENDING" });
  expect(
    await f.service.membershipAction("mod", id, "request", { action: "approve", version: 1 }),
  ).toMatchObject({ status: "ACCEPTED" });
  await expect(
    f.service.remove("mod", id, { version: 2, deleteEvents: true }),
  ).rejects.toMatchObject({ code: "GROUP_ADMIN_REQUIRED" });
  await expect(f.service.review("mod", id, { version: 2, decision: "approve" })).rejects.toThrow(
    "Global moderator required",
  );
});
it("moderators cannot remove/ban creator or peer moderators, while creator can remove/demote them", async () => {
  const f = setup();
  await expect(
    f.service.membershipAction("mod", id, "owner", { action: "remove", version: 1 }),
  ).rejects.toMatchObject({ code: "GROUP_ADMIN_CANNOT_LEAVE" });
  await expect(
    f.service.membershipAction("mod", id, "peer", { action: "remove", version: 1 }),
  ).rejects.toMatchObject({ code: "GROUP_MANAGER_PROTECTED" });
  await expect(f.service.ban("mod", id, { userId: "owner", until: null })).rejects.toMatchObject({
    code: "GROUP_ADMIN_CANNOT_LEAVE",
  });
  await expect(f.service.ban("mod", id, { userId: "peer", until: null })).rejects.toMatchObject({
    code: "GROUP_MANAGER_PROTECTED",
  });
  expect(f.groups.saveBan).not.toHaveBeenCalled();
  expect(
    await f.service.membershipAction("owner", id, "peer", { action: "remove", version: 1 }),
  ).toMatchObject({ status: "LEFT", role: "MEMBER" });
  expect(
    await f.service.membershipAction("mod", id, "member", { action: "remove", version: 1 }),
  ).toMatchObject({ status: "LEFT" });
});
it("ban, departure and reinvitation cannot restore moderator authority", async () => {
  const f = setup();
  await f.service.ban("owner", id, { userId: "mod", until: null });
  expect(f.members.get("mod")).toMatchObject({ role: "MEMBER", status: "LEFT" });
  await expect(
    f.service.save("mod", { version: 1, name: "Forbidden change" }, id),
  ).rejects.toMatchObject({ code: "GROUP_BANNED" });
  await f.service.revoke("owner", id, "mod");
  const invited = await f.service.invite("owner", id, "mod");
  await f.service.membershipAction("mod", id, "mod", {
    action: "accept",
    version: invited.version,
  });
  expect(await f.service.detail("mod", id)).toMatchObject({
    role: "accepted",
    canEdit: false,
    canInvite: false,
  });
  expect(f.departure).toHaveBeenCalledWith(id, "mod", "BAN");
});
it("a moderator leaving voluntarily loses authority and frozen ban guards remain enforced", async () => {
  const f = setup();
  expect(
    await f.service.membershipAction("mod", id, "mod", { action: "cancel", version: 1 }),
  ).toMatchObject({ role: "MEMBER", status: "LEFT" });
  await expect(
    f.service.save("mod", { version: 1, name: "Forbidden change" }, id),
  ).rejects.toMatchObject({ code: "GROUP_ADMIN_REQUIRED" });
  f.assertBanAllowed.mockRejectedValueOnce(new Error("BAN_FROZEN_PARTICIPATION"));
  await expect(f.service.ban("peer", id, { userId: "member", until: null })).rejects.toThrow(
    "BAN_FROZEN_PARTICIPATION",
  );
  expect(f.groups.saveBan).not.toHaveBeenCalled();
});
