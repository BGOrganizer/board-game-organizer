import type { Group, GroupInvitation } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { GroupService } from "../group.service";

describe("group notifications", () => {
  const group = {
    id: "group_1",
    adminUserId: "admin",
    name: "Catan club",
    isPublic: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as Group;
  const invitation = {
    id: "invitation_1",
    groupId: group.id,
    inviteeUserId: "guest",
    status: "PENDING",
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  } as GroupInvitation;

  function setup() {
    const invitations: GroupInvitation[] = [];
    const groups = {
      create: vi.fn(async () => group),
      invite: vi.fn(async () => invitation),
      listInvitations: vi.fn(async () => invitations),
      serializeMembershipChange: vi.fn(async () => ({ matchedCount: 1 })),
      findById: vi.fn(async () => group),
      remove: vi.fn(async () => undefined),
      update: vi.fn(async () => group),
      findInvitation: vi.fn(async () => invitation),
      respond: vi.fn(async () => invitation),
    };
    const users = {
      findById: vi.fn(async () => ({ clerkId: "guest" })),
      findByIds: vi.fn(async () => []),
    };
    const relationships = {
      isBlocked: vi.fn(async () => false),
      isFriend: vi.fn(async () => true),
    };
    const notifications = { notifyMany: vi.fn(async () => []), notify: vi.fn(async () => null) };
    const service = new GroupService(
      groups as unknown as ConstructorParameters<typeof GroupService>[0],
      users as unknown as ConstructorParameters<typeof GroupService>[1],
      relationships as unknown as ConstructorParameters<typeof GroupService>[2],
      notifications as unknown as ConstructorParameters<typeof GroupService>[3],
    );
    return { service, groups, notifications, invitations };
  }

  it("notifies new invitees only, including invitations added by an edit", async () => {
    const { service, groups, notifications, invitations } = setup();
    await service.create("admin", { name: group.name, isPublic: false, invitedUserIds: ["guest"] });
    expect(notifications.notifyMany).toHaveBeenLastCalledWith([
      {
        kind: "group_invitation",
        recipientUserId: "guest",
        actorUserId: "admin",
        groupName: group.name,
        groupId: group.id,
      },
    ]);
    invitations.push(invitation);
    await service.update("admin", group.id, {
      name: group.name,
      isPublic: false,
      invitedUserIds: ["guest"],
    });
    expect(groups.invite).toHaveBeenCalledTimes(1);
    expect(notifications.notifyMany).toHaveBeenLastCalledWith([]);
    await service.update("admin", group.id, {
      name: group.name,
      isPublic: false,
      invitedUserIds: ["guest", "guest_2"],
    });
    expect(notifications.notifyMany).toHaveBeenLastCalledWith([
      {
        kind: "group_invitation",
        recipientUserId: "guest_2",
        actorUserId: "admin",
        groupName: group.name,
        groupId: group.id,
      },
    ]);
  });

  it("shows pending invitees the admin and accepted members, never other pending invitees", async () => {
    const { service, invitations } = setup();
    invitations.push(invitation, { ...invitation, id: "invitation_2", inviteeUserId: "guest_2" });
    expect((await service.detail("guest", group.id)).memberProfiles).toEqual([
      { id: "admin", name: "admin", email: null, avatarUrl: null },
    ]);
    invitations[0] = { ...invitation, status: "ACCEPTED" };
    expect((await service.detail("guest", group.id)).memberProfiles).toEqual([
      { id: "admin", name: "admin", email: null, avatarUrl: null },
      { id: "guest", name: "guest", email: null, avatarUrl: null },
    ]);
    const pendingView = await service.detail("guest_2", group.id);
    expect(pendingView.memberProfiles.map((person) => person.id)).toEqual(["admin", "guest"]);
    expect(pendingView.invitations.map((item) => item.inviteeUserId)).toEqual(["guest", "guest_2"]);
  });

  it("notifies admin on acceptance, not on decline", async () => {
    const { service, notifications, invitations } = setup();
    invitations.push(invitation);
    await service.respond("guest", invitation.id, "accept");
    expect(notifications.notify).toHaveBeenCalledWith({
      kind: "group_invitation_accepted",
      recipientUserId: "admin",
      actorUserId: "guest",
      groupName: group.name,
      groupId: group.id,
    });
    notifications.notify.mockClear();
    await service.respond("guest", invitation.id, "decline");
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
