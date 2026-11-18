import type { CreateGroupInput, Group, GroupInvitation, User } from "@board-game-organizer/schemas";
import { ObjectId } from "mongodb";
import { expect, it, vi } from "vitest";
import { GroupError, GroupService } from "../group.service";

// Actual retained compatibility service; only repository/provider ports are
// controlled. No legacy route/writer is restored and no database is contacted.
const group: Group = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "admin",
  name: "Retained games club",
  isPublic: false,
  createdAt: "2030-06-01T10:00:00.000Z",
  updatedAt: "2030-06-01T10:00:00.000Z",
};
function invitation(id = "guest", patch: Partial<GroupInvitation> = {}): GroupInvitation {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    groupId: group.id,
    inviterUserId: "admin",
    inviteeUserId: id,
    status: "PENDING",
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    ...patch,
  };
}
function profile(clerkId = "guest"): User {
  return {
    _id: new ObjectId("000000000000000000000001"),
    clerkId,
    email: `${clerkId}@fixture.test`,
    name: `Profile ${clerkId}`,
    avatarUrl: `https://fixture.test/${clerkId}.png`,
    preferredLanguage: "en",
    plan: "free",
    presence: { online: false, lastActiveAt: new Date(group.createdAt) },
    createdAt: new Date(group.createdAt),
    updatedAt: new Date(group.updatedAt),
  };
}
const input = (invitedUserIds: string[] = []): CreateGroupInput => ({
  name: "Updated retained club",
  isPublic: true,
  invitedUserIds,
});
function setup(notify = true) {
  const state = { invitations: [invitation()] };
  const groups = {
    listPublic: vi.fn(async (): Promise<Group[]> => []),
    countAccepted: vi.fn(async () => 0),
    findById: vi.fn(async (): Promise<Group | null> => group),
    create: vi.fn(async () => group),
    invite: vi.fn(async (_gid: string, _admin: string, id: string) => invitation(id)),
    listInvitations: vi.fn(async () => state.invitations),
    listInvitationsForUser: vi.fn(async () => state.invitations),
    listForUser: vi.fn(async () => [group]),
    listInvitationsForGroups: vi.fn(async () => state.invitations),
    serializeMembershipChange: vi.fn(async () => ({ matchedCount: 1 })),
    remove: vi.fn(async () => ({ deletedCount: 1 })),
    update: vi.fn(
      async (
        _gid: string,
        _admin: string,
        name: string,
        isPublic: boolean,
      ): Promise<Group | null> => ({ ...group, name, isPublic }),
    ),
    archive: vi.fn(async () => ({ matchedCount: 1 })),
    findInvitation: vi.fn(
      async (): Promise<GroupInvitation | null> => state.invitations[0] ?? null,
    ),
    respond: vi.fn(
      async (
        _id: string,
        _guest: string,
        status: "ACCEPTED" | "DECLINED",
      ): Promise<GroupInvitation | null> => {
        const current = state.invitations[0];
        if (!current) return null;
        const updated = { ...current, status };
        state.invitations = [updated, ...state.invitations.slice(1)];
        return updated;
      },
    ),
    removeById: vi.fn(async () => ({ deletedCount: 1 })),
    listAcceptedMembers: vi.fn(async (_id: string, ids: string[]) =>
      state.invitations.filter(
        (row) => row.status === "ACCEPTED" && ids.includes(row.inviteeUserId),
      ),
    ),
  };
  const users = {
    findById: vi.fn(async (id: string): Promise<User | null> => profile(id)),
    findByIds: vi.fn(async (): Promise<User[]> => []),
  };
  const relationships = {
    isBlocked: vi.fn(async () => false),
    isFriend: vi.fn(async () => true),
  };
  const notifications = {
    notify: vi.fn(async () => null),
    notifyMany: vi.fn(async () => []),
  };
  const service = new GroupService(
    groups as unknown as ConstructorParameters<typeof GroupService>[0],
    users as unknown as ConstructorParameters<typeof GroupService>[1],
    relationships as unknown as ConstructorParameters<typeof GroupService>[2],
    notify
      ? (notifications as unknown as ConstructorParameters<typeof GroupService>[3])
      : undefined,
  );
  return { service, groups, users, relationships, notifications, state };
}
const failure = (status: number, message: string) => expect.objectContaining({ status, message });

it("bounds discovery enrichment to the requested page and emits the last returned row cursor only for lookahead", async () => {
  const f = setup(),
    second = { ...group, id: "33333333-3333-4333-8333-333333333333" };
  f.groups.listPublic.mockResolvedValue([group, second]);
  f.groups.countAccepted.mockResolvedValue(4);
  const page = { query: "club", cursor: "previous|row", limit: 1 };
  expect(await f.service.discover(page)).toEqual({
    items: [
      {
        id: group.id,
        name: group.name,
        memberCount: 5,
        createdAt: group.createdAt,
      },
    ],
    nextCursor: `${group.createdAt}|${group.id}`,
  });
  expect(f.groups.listPublic).toHaveBeenCalledExactlyOnceWith(page);
  expect(f.groups.countAccepted).toHaveBeenCalledExactlyOnceWith(group.id);
  expect(f.users.findByIds).not.toHaveBeenCalled();
});
it.each(["empty", "exhausted", "zero-budget"] as const)(
  "does not invent a discovery cursor for %s output",
  async (kind) => {
    const f = setup();
    f.groups.listPublic.mockResolvedValue(kind === "empty" ? [] : [group]);
    const result = await f.service.discover({
      limit: kind === "zero-budget" ? 0 : 1,
    });
    expect(result.nextCursor).toBeNull();
    expect(result.items).toHaveLength(kind === "exhausted" ? 1 : 0);
    expect(f.groups.countAccepted).toHaveBeenCalledTimes(kind === "exhausted" ? 1 : 0);
  },
);
it.each(["missing", "archived"] as const)(
  "hides %s groups before reading private invitations",
  async (kind) => {
    const f = setup();
    f.groups.findById.mockResolvedValue(
      kind === "missing" ? null : { ...group, archivedAt: group.updatedAt },
    );
    await expect(f.service.detail("admin", group.id)).rejects.toEqual(
      failure(404, "Group not found"),
    );
    expect(f.groups.listInvitations).not.toHaveBeenCalled();
    expect(f.users.findByIds).not.toHaveBeenCalled();
  },
);
it.each([
  {
    kind: "self",
    id: "admin",
    status: 400,
    message: "Admin is already a member",
  },
  { kind: "missing-user", id: "guest", status: 404, message: "User not found" },
  { kind: "blocked", id: "guest", status: 404, message: "User not found" },
  {
    kind: "not-friend",
    id: "guest",
    status: 400,
    message: "Only friends can be invited to a group",
  },
])(
  "rejects $kind invitees before any retained group write",
  async ({ kind, id, status, message }) => {
    const f = setup();
    if (kind === "missing-user") f.users.findById.mockResolvedValue(null);
    if (kind === "blocked") f.relationships.isBlocked.mockResolvedValue(true);
    if (kind === "not-friend") f.relationships.isFriend.mockResolvedValue(false);
    await expect(f.service.create("admin", input([id]))).rejects.toEqual(failure(status, message));
    expect(f.groups.create).not.toHaveBeenCalled();
    expect(f.groups.invite).not.toHaveBeenCalled();
    expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  },
);
it("hides declined and unrelated viewers without reading member profiles", async () => {
  const f = setup();
  f.state.invitations = [invitation("declined", { status: "DECLINED" })];
  for (const id of ["declined", "unrelated"])
    await expect(f.service.detail(id, group.id)).rejects.toEqual(failure(404, "Group not found"));
  expect(f.users.findByIds).not.toHaveBeenCalled();
});
it("projects invitation revocation between list snapshots without exposing other invitations or private profiles", async () => {
  const f = setup();
  f.groups.listInvitationsForUser.mockResolvedValue([invitation("viewer")]);
  f.state.invitations = [
    invitation("viewer", { status: "DECLINED" }),
    invitation("accepted", {
      id: "33333333-3333-4333-8333-333333333333",
      status: "ACCEPTED",
    }),
  ];
  const result = await f.service.list("viewer");
  expect(result[0].memberProfiles).toEqual([]);
  expect(result[0].invitations.map((row) => row.inviteeUserId)).toEqual(["viewer"]);
  expect(result[0].memberCount).toBe(2);
});
it("uses available current profiles and strips private invitation writer metadata from responses", async () => {
  const f = setup();
  f.state.invitations = [invitation("guest", { status: "ACCEPTED" })];
  f.users.findByIds.mockResolvedValue([profile("admin"), profile("guest")]);
  const result = await f.service.detail("guest", group.id);
  expect(result.memberProfiles).toEqual(
    ["admin", "guest"].map((id) => ({
      id,
      name: `Profile ${id}`,
      email: `${id}@fixture.test`,
      avatarUrl: `https://fixture.test/${id}.png`,
    })),
  );
  expect(result.invitations[0]).not.toHaveProperty("inviterUserId");
});
it("stops update when its membership lock cannot find the parent group", async () => {
  const f = setup();
  f.groups.serializeMembershipChange.mockResolvedValue({ matchedCount: 0 });
  await expect(f.service.update("admin", group.id, input())).rejects.toEqual(
    failure(404, "Group not found"),
  );
  expect(f.groups.findById).not.toHaveBeenCalled();
  expect(f.groups.update).not.toHaveBeenCalled();
});
it("requires the current administrator after taking the update membership lock", async () => {
  const f = setup();
  await expect(f.service.update("other", group.id, input())).rejects.toEqual(
    failure(403, "Only group admin can edit group"),
  );
  expect(f.groups.serializeMembershipChange).toHaveBeenCalledExactlyOnceWith(group.id);
  expect(f.groups.update).not.toHaveBeenCalled();
});
it("keeps accepted selections, removes omitted invitations, and validates declined reinvitations before notifying only new invitees", async () => {
  const f = setup();
  f.state.invitations = [
    invitation("retained", {
      id: "33333333-3333-4333-8333-333333333333",
      status: "ACCEPTED",
    }),
    invitation("omitted", { id: "44444444-4444-4444-8444-444444444444" }),
    invitation("guest", { status: "DECLINED" }),
  ];
  const result = await f.service.update(
    "admin",
    group.id,
    input(["retained", "guest", "new-guest"]),
  );
  expect(f.users.findById.mock.calls).toEqual([["guest"], ["new-guest"]]);
  expect(f.groups.remove.mock.calls).toEqual([
    [group.id, "omitted"],
    [group.id, "guest"],
  ]);
  expect(f.groups.invite.mock.calls).toEqual([
    [group.id, "admin", "guest"],
    [group.id, "admin", "new-guest"],
  ]);
  expect(f.groups.update).toHaveBeenCalledExactlyOnceWith(
    group.id,
    "admin",
    "Updated retained club",
    true,
  );
  expect(result.name).toBe("Updated retained club");
  expect(result.isPublic).toBe(true);
  expect(f.notifications.notifyMany).toHaveBeenCalledExactlyOnceWith(
    ["guest", "new-guest"].map((recipientUserId) => ({
      kind: "group_invitation",
      recipientUserId,
      actorUserId: "admin",
      groupName: "Updated retained club",
      groupId: group.id,
    })),
  );
});
it("does not publish success or invite notifications after a concurrent update loses its compare-and-set", async () => {
  const f = setup();
  f.groups.update.mockResolvedValue(null);
  await expect(f.service.update("admin", group.id, input(["guest"]))).rejects.toEqual(
    failure(409, "Group changed concurrently"),
  );
  expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  expect(f.users.findByIds).not.toHaveBeenCalled();
});
it.each(["not-admin", "conflict", "success"] as const)(
  "preserves archive authorization and compare-and-set for %s",
  async (kind) => {
    const f = setup();
    if (kind === "conflict") f.groups.archive.mockResolvedValue({ matchedCount: 0 });
    const action = f.service.archive(kind === "not-admin" ? "other" : "admin", group.id);
    if (kind === "not-admin") {
      await expect(action).rejects.toEqual(failure(403, "Only group admin can delete group"));
      expect(f.groups.archive).not.toHaveBeenCalled();
    } else if (kind === "conflict")
      await expect(action).rejects.toEqual(failure(409, "Group changed concurrently"));
    else {
      await expect(action).resolves.toBeUndefined();
      expect(f.groups.archive).toHaveBeenCalledExactlyOnceWith(group.id, "admin");
    }
  },
);
it.each(["missing", "other-user", "already-decided"] as const)(
  "rejects %s invitation responses before any lock/write",
  async (kind) => {
    const f = setup();
    f.groups.findInvitation.mockResolvedValue(
      kind === "missing"
        ? null
        : invitation(kind === "other-user" ? "other" : "guest", {
            status: kind === "already-decided" ? "ACCEPTED" : "PENDING",
          }),
    );
    await expect(f.service.respond("guest", invitation().id, "accept")).rejects.toEqual(
      failure(404, "Invitation not found"),
    );
    expect(f.groups.serializeMembershipChange).not.toHaveBeenCalled();
    expect(f.groups.respond).not.toHaveBeenCalled();
  },
);
it("rejects a response after its locked parent group disappeared", async () => {
  const f = setup();
  f.groups.serializeMembershipChange.mockResolvedValue({ matchedCount: 0 });
  await expect(f.service.respond("guest", invitation().id, "accept")).rejects.toEqual(
    failure(404, "Group not found"),
  );
  expect(f.groups.respond).not.toHaveBeenCalled();
  expect(f.notifications.notify).not.toHaveBeenCalled();
});
it("rejects a response whose pending invitation changed concurrently", async () => {
  const f = setup();
  f.groups.respond.mockResolvedValue(null);
  await expect(f.service.respond("guest", invitation().id, "accept")).rejects.toEqual(
    failure(409, "Invitation changed concurrently"),
  );
  expect(f.notifications.notify).not.toHaveBeenCalled();
});
it("returns null only for expected immediate access loss after an explicit decline", async () => {
  const f = setup();
  await expect(f.service.respond("guest", invitation().id, "decline")).resolves.toBeNull();
  expect(f.groups.respond).toHaveBeenCalledExactlyOnceWith(invitation().id, "guest", "DECLINED");
  expect(f.notifications.notify).not.toHaveBeenCalled();
});
it.each(["accepted-404", "declined-infrastructure", "declined-non404"] as const)(
  "does not suppress unrelated post-response detail errors (%s)",
  async (kind) => {
    const f = setup(),
      error =
        kind === "declined-infrastructure"
          ? new Error("Repository unavailable")
          : new GroupError(kind === "accepted-404" ? 404 : 503, "Current detail unavailable");
    f.groups.findById.mockResolvedValueOnce(group).mockRejectedValueOnce(error);
    await expect(
      f.service.respond("guest", invitation().id, kind === "accepted-404" ? "accept" : "decline"),
    ).rejects.toBe(error);
  },
);
it.each(["missing", "lock-missing", "not-admin", "conflict", "success"] as const)(
  "guards retained invitation removal for %s",
  async (kind) => {
    const f = setup();
    if (kind === "missing") f.groups.findInvitation.mockResolvedValue(null);
    if (kind === "lock-missing")
      f.groups.serializeMembershipChange.mockResolvedValue({ matchedCount: 0 });
    if (kind === "conflict") f.groups.removeById.mockResolvedValue({ deletedCount: 0 });
    const action = f.service.removeInvitation(
      kind === "not-admin" ? "other" : "admin",
      invitation().id,
    );
    if (kind === "missing")
      await expect(action).rejects.toEqual(failure(404, "Invitation not found"));
    else if (kind === "lock-missing")
      await expect(action).rejects.toEqual(failure(404, "Group not found"));
    else if (kind === "not-admin")
      await expect(action).rejects.toEqual(failure(403, "Only group admin can remove invitations"));
    else if (kind === "conflict")
      await expect(action).rejects.toEqual(failure(409, "Invitation changed concurrently"));
    else {
      await expect(action).resolves.toBeUndefined();
      expect(f.groups.removeById).toHaveBeenCalledExactlyOnceWith(invitation().id, group.id);
    }
    if (["missing", "lock-missing", "not-admin"].includes(kind))
      expect(f.groups.removeById).not.toHaveBeenCalled();
  },
);
it.each(["lock-missing", "admin", "membership-missing", "success"] as const)(
  "guards retained group departure for %s",
  async (kind) => {
    const f = setup();
    if (kind === "lock-missing")
      f.groups.serializeMembershipChange.mockResolvedValue({ matchedCount: 0 });
    if (kind === "membership-missing") f.groups.remove.mockResolvedValue({ deletedCount: 0 });
    const action = f.service.leave(kind === "admin" ? "admin" : "guest", group.id);
    if (kind === "lock-missing")
      await expect(action).rejects.toEqual(failure(404, "Group not found"));
    else if (kind === "admin")
      await expect(action).rejects.toEqual(failure(403, "Admin cannot leave their group"));
    else if (kind === "membership-missing")
      await expect(action).rejects.toEqual(failure(404, "Membership not found"));
    else {
      await expect(action).resolves.toBeUndefined();
      expect(f.groups.remove).toHaveBeenCalledExactlyOnceWith(group.id, "guest");
    }
    if (kind === "admin" || kind === "lock-missing") expect(f.groups.remove).not.toHaveBeenCalled();
  },
);
it("fails a locked roster assertion before using stale selections if the group lock is unavailable", async () => {
  const f = setup();
  f.groups.serializeMembershipChange.mockResolvedValue({ matchedCount: 0 });
  await expect(f.service.requireMembers(group.id, ["admin", "guest"], true)).rejects.toEqual(
    failure(409, "Group no longer available"),
  );
  expect(f.groups.findById).not.toHaveBeenCalled();
  expect(f.groups.listAcceptedMembers).not.toHaveBeenCalled();
});
it.each([false, true])(
  "requires accepted membership, treating only the administrator as implicit membership (lock:%s)",
  async (lock) => {
    const f = setup();
    f.state.invitations = [
      invitation("accepted", {
        id: "33333333-3333-4333-8333-333333333333",
        status: "ACCEPTED",
      }),
      invitation("pending", { id: "44444444-4444-4444-8444-444444444444" }),
    ];
    await expect(
      f.service.requireMembers(group.id, ["admin", "accepted"], lock),
    ).resolves.toBeUndefined();
    expect(f.groups.serializeMembershipChange).toHaveBeenCalledTimes(lock ? 1 : 0);
    await expect(f.service.requireMembers(group.id, ["admin", "pending"], lock)).rejects.toEqual(
      failure(409, "Every participant must be an accepted group member"),
    );
  },
);
it("does not invent members for an empty roster assertion", async () => {
  const f = setup();
  await expect(f.service.requireMembers(group.id, [])).resolves.toBeUndefined();
  expect(f.groups.listAcceptedMembers).toHaveBeenCalledExactlyOnceWith(group.id, []);
  expect(f.groups.serializeMembershipChange).not.toHaveBeenCalled();
});
it("keeps optional notification providers optional without changing successful results", async () => {
  const f = setup(false);
  expect((await f.service.create("admin", input())).id).toBe(group.id);
  expect((await f.service.update("admin", group.id, input(["guest"]))).name).toBe(
    "Updated retained club",
  );
  expect(
    (await f.service.respond("guest", invitation().id, "accept"))?.memberProfiles.map(
      (row) => row.id,
    ),
  ).toEqual(["admin", "guest"]);
  expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  expect(f.notifications.notify).not.toHaveBeenCalled();
});
