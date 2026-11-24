import type {
  GroupBan,
  GroupMembership,
  GroupRecord,
  GroupRevision,
} from "@board-game-organizer/schemas";
import { notificationItemId } from "@board-game-organizer/schemas";
import { MongoServerError } from "mongodb";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GroupRecordPage } from "../group-records.repository";
import { GroupRecordsService } from "../group-records.service";

const provider = vi.hoisted(() => ({ getUser: vi.fn(), geocode: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser: provider.getUser } }),
}));
vi.mock("../../locations/geocoding", async (original) => ({
  ...(await original<typeof import("../../locations/geocoding")>()),
  geocodeAddresses: provider.geocode,
}));
const id = "11111111-1111-4111-8111-111111111111",
  logo = "22222222-2222-4222-8222-222222222222",
  nextLogo = "33333333-3333-4333-8333-333333333333";
const at = "2030-01-01T12:00:00.000Z";
const location = {
  id: logo,
  name: "Verified venue",
  address: "Via Roma 1",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};
const approved: GroupRevision = { name: "Approved board club", logoAssetId: logo, location };
const proposed: GroupRevision = { name: "Proposed board club", logoAssetId: nextLogo, location };
function member(userId: string, change: Partial<GroupMembership> = {}): GroupMembership {
  return {
    id: logo,
    groupId: id,
    userId,
    kind: "INVITATION",
    status: "ACCEPTED",
    role: "MEMBER",
    version: 1,
    createdAt: at,
    updatedAt: at,
    ...change,
  };
}
type Dependencies = ConstructorParameters<typeof GroupRecordsService>;
function setup(type: "PRIVATE" | "PUBLIC" = "PRIVATE") {
  const state: { group: GroupRecord | null } = {
    group: {
      id,
      type,
      adminUserId: "owner",
      approved: type === "PUBLIC" ? approved : { name: "Private board club" },
      ...(type === "PUBLIC" ? { proposal: proposed, reviewStatus: "PENDING" as const } : {}),
      reservedNames: type === "PUBLIC" ? ["approved board club", "proposed board club"] : [],
      version: 1,
      createdAt: at,
      updatedAt: at,
    },
  };
  const memberships = new Map<string, GroupMembership>();
  const bans = new Map<string, GroupBan>();
  const profiles = new Map(
    ["owner", "guest", "member", "other"].map((clerkId) => [
      clerkId,
      {
        clerkId,
        name: clerkId === "owner" ? "Creator Player" : `${clerkId} Player`,
        email: `${clerkId}@example.test`,
        username: `${clerkId}-handle` as string | null,
        avatarUrl: null,
        presence: { online: false, lastActiveAt: at },
      },
    ]),
  );
  const groups = {
    find: vi.fn(async (_id: string) => state.group),
    lock: vi.fn(async (_id: string) => state.group),
    membership: vi.fn(async (_id: string, userId: string) => memberships.get(userId) ?? null),
    ban: vi.fn(async (_id: string, userId: string) => bans.get(userId) ?? null),
    save: vi.fn(async (value: GroupRecord) => {
      state.group = value;
    }),
    create: vi.fn(async (value: GroupRecord) => {
      state.group = value;
    }),
    remove: vi.fn(async (_id: string) => ({ id, eventIds: [] })),
    saveMembership: vi.fn(async (value: GroupMembership) => {
      memberships.set(value.userId, value);
      return value;
    }),
    saveBan: vi.fn(async (value: GroupBan) => {
      bans.set(value.userId, value);
      return value;
    }),
    countMembers: vi.fn(
      async (_id: string) =>
        [...memberships.values()].filter((row) => row.status === "ACCEPTED").length,
    ),
    countEvents: vi.fn(async (_id: string) => 2),
    countPendingRequests: vi.fn(async (_id: string, _now: string) => 1),
    managerIds: vi.fn(async (_group: GroupRecord) => ["owner", "owner", "moderator"]),
    list: vi.fn(
      async (
        _user: string,
        _scope: string,
        _page: GroupRecordPage,
        _now: string,
      ): Promise<GroupRecord[]> => (state.group ? [state.group] : []),
    ),
    members: vi.fn(async (_id: string, status: GroupMembership["status"], _page: GroupRecordPage) =>
      [...memberships.values()].filter((row) => row.status === status),
    ),
    activeBans: vi.fn(async (_id: string, _now: string, _page: GroupRecordPage) => [
      ...bans.values(),
    ]),
    invitationCandidates: vi.fn(async (_id: string, _actor: string, _page: GroupRecordPage) =>
      [...profiles.values()].filter((row) => row.clerkId !== "owner"),
    ),
  };
  const assets = {
    claim: vi.fn(async (_id: string, _owner: string, _group: string) => true),
    find: vi.fn(
      async (_id: string): Promise<{ thumbnailBase64: string } | null> => ({
        thumbnailBase64: "AAAA",
      }),
    ),
    expireUnused: vi.fn(async (_id: string, _group: string) => undefined),
  };
  const users = {
    findById: vi.fn(async (userId: string) => profiles.get(userId) ?? null),
    findByIds: vi.fn(async (ids: string[]) => ids.flatMap((userId) => profiles.get(userId) ?? [])),
    moderatorIds: vi.fn(async () => ["reviewer", "reviewer"]),
  };
  const relationships = {
    isFriend: vi.fn(async (_actor: string, _target: string) => true),
    isBlocked: vi.fn(async (_actor: string, _target: string) => false),
    memberStates: vi.fn(
      async (_actor: string, ids: string[]) =>
        new Map(
          ids.map((userId) => [
            userId,
            { isFriend: true, isFollowing: false, isFollower: true, blockedByMe: false },
          ]),
        ),
    ),
  };
  const notifications = {
    notifyMany: vi.fn(async (..._args: Parameters<Dependencies[4]["notifyMany"]>) => []),
    acknowledgeItems: vi.fn(
      async (..._args: Parameters<Dependencies[4]["acknowledgeItems"]>) => undefined,
    ),
    retargetItems: vi.fn(
      async (..._args: Parameters<Dependencies[4]["retargetItems"]>) => undefined,
    ),
  };
  const departure = vi.fn(async (_id: string, _user: string, _reason: "LEFT" | "BAN") => undefined);
  // Nominal repository classes have private Mongo fields. Only these injected
  // I/O boundaries are replaced; service policy/schema/provider gates stay real.
  const service = new GroupRecordsService(
    groups as unknown as Dependencies[0],
    assets as unknown as Dependencies[1],
    users as unknown as Dependencies[2],
    relationships as unknown as Dependencies[3],
    notifications as unknown as Dependencies[4],
    departure,
    {} as Dependencies[6],
  );
  return {
    service,
    state,
    groups,
    assets,
    users,
    profiles,
    relationships,
    notifications,
    memberships,
    bans,
    departure,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(at);
  provider.getUser.mockResolvedValue({ publicMetadata: { bgoRole: "ADMIN" } });
  provider.geocode.mockResolvedValue([location]);
});
afterEach(() => vi.useRealTimers());

it("fails closed for absent records and pins delete authority/version before removing anything", async () => {
  const f = setup();
  await expect(
    f.service.remove("guest", id, { version: 1, deleteEvents: true }),
  ).rejects.toMatchObject({ status: 403, code: "GROUP_ADMIN_REQUIRED" });
  await expect(
    f.service.remove("owner", id, { version: 2, deleteEvents: true }),
  ).rejects.toMatchObject({ status: 409, code: "GROUP_CHANGED" });
  expect(f.groups.remove).not.toHaveBeenCalled();
  f.state.group = null;
  await expect(f.service.detail("owner", id)).rejects.toMatchObject({
    status: 404,
    code: "GROUP_NOT_FOUND",
  });
  await expect(
    f.service.remove("owner", id, { version: 1, deleteEvents: true }),
  ).rejects.toMatchObject({ status: 404, code: "GROUP_NOT_FOUND" });
});

it("requires fresh provider moderation authority and refuses private records on moderation endpoints", async () => {
  const f = setup();
  provider.getUser.mockResolvedValueOnce({ publicMetadata: { bgoRole: "MEMBER" } });
  await expect(f.service.moderationDetail("reviewer", id)).rejects.toMatchObject({
    status: 403,
    code: "MODERATOR_REQUIRED",
  });
  expect(f.groups.find).not.toHaveBeenCalled();
  await expect(f.service.moderationDetail("reviewer", id)).rejects.toMatchObject({
    status: 404,
    code: "GROUP_NOT_FOUND",
  });
  expect(provider.getUser).toHaveBeenCalledWith("reviewer");
});

it("separates proposed public metadata from the approved revision shown to ordinary readers", async () => {
  const f = setup("PUBLIC");
  const owner = await f.service.detail("owner", id);
  expect(owner).toMatchObject({
    name: proposed.name,
    proposal: proposed,
    reviewStatus: "PENDING",
    pendingRequestCount: 1,
    logo: "data:image/webp;base64,AAAA",
  });
  const visitor = await f.service.detail("guest", id);
  expect(visitor).toMatchObject({
    name: approved.name,
    reservedNames: [],
    pendingRequestCount: null,
    eventCount: null,
  });
  expect(visitor).not.toHaveProperty("proposal");
  expect(visitor).not.toHaveProperty("reviewStatus");
  const moderator = await f.service.moderationDetail("reviewer", id);
  expect(moderator.name).toBe(proposed.name);
  expect(moderator.proposal).toEqual(proposed);
  expect(moderator.pendingRequestCount).toBeNull();
});

it.each(["approve", "reject"] as const)(
  "applies a versioned public %s review and releases only unretained logo assets",
  async (decision) => {
    const f = setup("PUBLIC");
    const response = await f.service.review(
      "reviewer",
      id,
      decision === "approve"
        ? { decision, version: 1 }
        : { decision, version: 1, reason: "Venue details require correction" },
    );
    expect(response.version).toBe(2);
    expect(f.groups.lock).toHaveBeenCalledWith(id);
    if (decision === "approve") {
      expect(f.state.group).toMatchObject({
        approved: proposed,
        reservedNames: ["proposed board club"],
      });
      expect(f.state.group).not.toHaveProperty("proposal");
      expect(f.assets.expireUnused).toHaveBeenCalledExactlyOnceWith(logo, id);
    } else {
      expect(f.state.group).toMatchObject({
        approved,
        proposal: proposed,
        reviewStatus: "REJECTED",
        rejectionReason: "Venue details require correction",
      });
      expect(f.assets.expireUnused).not.toHaveBeenCalled();
    }
    expect(f.notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: "group_reviewed",
        recipientUserId: "owner",
        actorUserId: "reviewer",
      }),
      expect.objectContaining({ kind: "group_reviewed", recipientUserId: "moderator" }),
    ]);
  },
);

it.each(["stale", "already-reviewed", "no-proposal"] as const)(
  "refuses %s public moderation without saving or notifying",
  async (reason) => {
    const f = setup("PUBLIC");
    if (!f.state.group) throw new Error("Expected current group fixture");
    if (reason === "already-reviewed")
      f.state.group = {
        ...f.state.group,
        reviewStatus: "REJECTED",
        rejectionReason: "Correct venue",
      };
    if (reason === "no-proposal") {
      const { proposal: _proposal, ...value } = f.state.group;
      f.state.group = value;
    }
    await expect(
      f.service.review("reviewer", id, {
        decision: "approve",
        version: reason === "stale" ? 2 : 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: "GROUP_CHANGED" });
    expect(f.groups.save).not.toHaveBeenCalled();
    expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  },
);

it("keeps existing logo ownership and verified venues on edits, expiring a discarded prior logo once", async () => {
  const f = setup("PUBLIC");
  const saved = await f.service.save(
    "owner",
    { name: "Updated board club", logoAssetId: logo, location, version: 1 },
    id,
  );
  expect(saved).toMatchObject({ name: "Updated board club", version: 2, adminUserId: "owner" });
  expect(f.assets.claim).not.toHaveBeenCalled();
  expect(f.assets.expireUnused).toHaveBeenCalledExactlyOnceWith(nextLogo, id);
  // Existing canonical venue data is reused by the real verifier, without a provider round-trip.
  expect(provider.geocode).not.toHaveBeenCalled();
  expect(f.notifications.notifyMany).toHaveBeenCalledExactlyOnceWith([
    expect.objectContaining({
      kind: "group_review_requested",
      recipientUserId: "reviewer",
      resourceHref: `/moderation/${id}`,
    }),
  ]);
});

it.each(["logo", "venue"] as const)(
  "refuses an incomplete existing public %s edit before claiming assets or saving",
  async (missing) => {
    const f = setup("PUBLIC");
    await expect(
      f.service.save(
        "owner",
        {
          name: "Updated board club",
          version: 1,
          ...(missing === "logo" ? { location } : { logoAssetId: logo }),
        },
        id,
      ),
    ).rejects.toMatchObject({ status: 400, code: "PUBLIC_GROUP_REQUIRES_LOGO_VENUE" });
    expect(f.assets.claim).not.toHaveBeenCalled();
    expect(f.groups.save).not.toHaveBeenCalled();
  },
);

it("rejects unowned logos and provider-unverified new venues without persisting a substitute revision", async () => {
  const f = setup();
  f.assets.claim.mockResolvedValueOnce(false);
  await expect(
    f.service.save("owner", {
      type: "PRIVATE",
      name: "New private club",
      invitedUserIds: [],
      logoAssetId: logo,
    }),
  ).rejects.toMatchObject({ status: 400, code: "INVALID_LOGO" });
  provider.geocode.mockResolvedValueOnce([]);
  await expect(
    f.service.save("owner", {
      type: "PRIVATE",
      name: "New private club",
      invitedUserIds: [],
      location: { ...location, address: "Unverified venue" },
    }),
  ).rejects.toMatchObject({ status: 400, code: "CHOOSE_VERIFIED_ADDRESS" });
  expect(f.groups.create).not.toHaveBeenCalled();
});

it.each([true, false])(
  "maps only duplicate Mongo names to a conflict (duplicate=%s)",
  async (duplicate) => {
    const f = setup();
    const error = duplicate
      ? new MongoServerError({ code: 11000, message: "Duplicate reserved name" })
      : new Error("Storage unavailable");
    f.groups.create.mockRejectedValueOnce(error);
    const result = f.service.save("owner", {
      type: "PRIVATE",
      name: "New private club",
      invitedUserIds: [],
    });
    if (duplicate)
      await expect(result).rejects.toMatchObject({ status: 409, code: "GROUP_NAME_TAKEN" });
    else await expect(result).rejects.toBe(error);
    expect(f.notifications.notifyMany).not.toHaveBeenCalled();
    expect(f.assets.expireUnused).not.toHaveBeenCalled();
  },
);

it.each(["self", "missing", "not-friend", "blocked"] as const)(
  "rejects an ineligible %s invitation before granting membership",
  async (reason) => {
    const f = setup();
    const target = reason === "self" ? "owner" : reason === "missing" ? "missing" : "guest";
    if (reason === "not-friend") f.relationships.isFriend.mockResolvedValueOnce(false);
    if (reason === "blocked") f.relationships.isBlocked.mockResolvedValueOnce(true);
    await expect(f.service.invite("owner", id, target)).rejects.toMatchObject({
      code:
        reason === "self"
          ? "ALREADY_GROUP_MEMBER"
          : reason === "missing"
            ? "USER_NOT_FOUND"
            : "CONFIRMED_FRIEND_REQUIRED",
    });
    expect(f.groups.saveMembership).not.toHaveBeenCalled();
    expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  },
);

it.each(["PENDING", "ACCEPTED"] as const)(
  "does not overwrite an already %s membership with a second invitation",
  async (status) => {
    const f = setup();
    f.memberships.set("guest", member("guest", { status }));
    await expect(f.service.invite("owner", id, "guest")).rejects.toMatchObject({
      status: 409,
      code: "MEMBERSHIP_ALREADY_ACTIVE",
    });
    expect(f.groups.saveMembership).not.toHaveBeenCalled();
  },
);

it("reuses a departed membership identity with a fresh version, explicit pending consent and source invitation attention", async () => {
  const f = setup();
  f.memberships.set("guest", member("guest", { status: "LEFT", role: "MEMBER", version: 4 }));
  const saved = await f.service.invite("owner", id, "guest");
  expect(saved).toMatchObject({
    id: logo,
    userId: "guest",
    kind: "INVITATION",
    status: "PENDING",
    version: 5,
  });
  expect(saved).not.toHaveProperty("role");
  expect(f.notifications.notifyMany).toHaveBeenCalledWith([
    expect.objectContaining({
      kind: "group_invitation",
      recipientUserId: "guest",
      attentionItems: [{ id: notificationItemId(id, "invitation"), revision: 5, groupId: id }],
    }),
  ]);
});

it.each(["accept", "decline"] as const)(
  "acknowledges only the recipient's explicit invitation %s through the captured attention cutoff",
  async (action) => {
    const f = setup();
    f.memberships.set("guest", member("guest", { status: "PENDING" }));
    const through = "2029-12-31T23:59:59.000Z";
    const saved = await f.service.membershipAction("guest", id, "guest", {
      action,
      version: 1,
      attentionThrough: through,
    });
    expect(saved).toMatchObject({
      status: action === "accept" ? "ACCEPTED" : "DECLINED",
      version: 2,
      role: "MEMBER",
    });
    expect(f.notifications.acknowledgeItems).toHaveBeenCalledExactlyOnceWith(
      "guest",
      [notificationItemId(id, "invitation")],
      through,
      true,
    );
    expect(f.departure).not.toHaveBeenCalled();
  },
);

it("keeps member pagination owner-aware, filters the owner and never supplies social grants to pending readers", async () => {
  const f = setup();
  f.memberships.set("member", member("member"));
  const first = await f.service.members("owner", id, "accepted", { limit: 1 });
  expect(first.items.map((row) => row.userId)).toEqual(["owner"]);
  expect(first.nextCursor).toBe("owner");
  const next = await f.service.members("owner", id, "accepted", { limit: 1, cursor: "owner" });
  expect(next.items.map((row) => row.userId)).toEqual(["member"]);
  expect(next.items[0].social).toMatchObject({ isFriend: true });
  const filtered = await f.service.members("owner", id, "accepted", {
    limit: 2,
    query: "member",
  });
  expect(filtered.items.map((row) => row.userId)).toEqual(["member"]);
  f.memberships.set("guest", member("guest", { status: "PENDING" }));
  const pendingReader = await f.service.members("guest", id, "accepted", { limit: 5 });
  expect(pendingReader.items.every((row) => row.social === undefined)).toBe(true);
  await expect(f.service.members("guest", id, "pending", { limit: 5 })).rejects.toMatchObject({
    status: 403,
    code: "GROUP_MEMBER_REQUIRED",
  });
});

it.each([
  { actor: "owner", target: "owner", action: "cancel", code: "GROUP_ADMIN_CANNOT_LEAVE" },
  { actor: "owner", action: "promote", status: "PENDING", code: "MEMBERSHIP_CHANGED" },
  { actor: "owner", action: "demote", status: "ACCEPTED", code: "MEMBERSHIP_CHANGED" },
  { actor: "owner", action: "accept", status: "PENDING", code: "INVITATION_RECIPIENT_REQUIRED" },
  { actor: "guest", action: "decline", kind: "REQUEST", code: "INVITATION_RECIPIENT_REQUIRED" },
  { actor: "guest", action: "accept", status: "LEFT", code: "MEMBERSHIP_CHANGED" },
  { actor: "guest", action: "approve", kind: "REQUEST", code: "GROUP_ADMIN_REQUIRED" },
  { actor: "owner", action: "reject", status: "PENDING", code: "GROUP_ADMIN_REQUIRED" },
  {
    actor: "owner",
    action: "approve",
    kind: "REQUEST",
    status: "LEFT",
    code: "MEMBERSHIP_CHANGED",
  },
  { actor: "guest", action: "cancel", status: "PENDING", code: "MEMBERSHIP_ACTION_FORBIDDEN" },
  { actor: "other", action: "cancel", status: "ACCEPTED", code: "MEMBERSHIP_ACTION_FORBIDDEN" },
  { actor: "other", action: "remove", status: "ACCEPTED", code: "GROUP_MANAGER_PROTECTED" },
  { actor: "owner", action: "remove", status: "LEFT", code: "MEMBERSHIP_CHANGED" },
] as const)("rejects invalid membership $action by $actor with $code", async (testCase) => {
  const f = setup();
  const target = ("target" in testCase ? testCase.target : undefined) ?? "guest";
  const kind = "kind" in testCase ? testCase.kind : "INVITATION";
  const status = "status" in testCase ? testCase.status : "PENDING";
  const role = testCase.code === "GROUP_MANAGER_PROTECTED" ? "MODERATOR" : "MEMBER";
  if (role === "MODERATOR") f.memberships.set("other", member("other", { role }));
  const original = member(target, { kind, status, role });
  f.memberships.set(target, original);

  await expect(
    f.service.membershipAction(testCase.actor, id, target, {
      action: testCase.action,
      version: original.version,
    }),
  ).rejects.toMatchObject({ code: testCase.code });
  expect(f.memberships.get(target)).toBe(original);
  expect(f.groups.saveMembership).not.toHaveBeenCalled();
  expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  expect(f.notifications.acknowledgeItems).not.toHaveBeenCalled();
  expect(f.departure).not.toHaveBeenCalled();
});

it("lets the requester withdraw a pending public request and leaves invitation attention untouched", async () => {
  const f = setup("PUBLIC");
  const pending = await f.service.request("guest", id);
  const withdrawn = await f.service.membershipAction("guest", id, "guest", {
    action: "cancel",
    version: pending.version,
  });
  expect(withdrawn).toMatchObject({
    id: pending.id,
    status: "LEFT",
    version: pending.version + 1,
  });
  expect(f.departure).toHaveBeenCalledExactlyOnceWith(id, "guest", "LEFT");
  expect(f.notifications.acknowledgeItems).not.toHaveBeenCalled();
});

it("blocks enrollment while a public group awaits its first approval", async () => {
  const f = setup("PUBLIC");
  const group = f.state.group;
  if (!group) throw new Error("Missing public group fixture");
  const { approved: _approved, ...unapproved } = group;
  f.state.group = unapproved;

  await expect(f.service.invitationCandidates("owner", id, { limit: 5 })).rejects.toMatchObject({
    status: 409,
    code: "GROUP_NOT_APPROVED",
  });
  await expect(f.service.invite("owner", id, "guest")).rejects.toMatchObject({
    status: 409,
    code: "GROUP_NOT_APPROVED",
  });
  await expect(f.service.request("guest", id)).rejects.toMatchObject({
    status: 404,
    code: "GROUP_NOT_FOUND",
  });
  expect(f.groups.invitationCandidates).not.toHaveBeenCalled();
  expect(f.groups.saveMembership).not.toHaveBeenCalled();
  expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  expect(await f.service.moderationDetail("reviewer", id)).toMatchObject({ proposal: proposed });
});

it("requires moderation authority to list proposals and rejects stale group edits", async () => {
  const f = setup("PUBLIC");
  provider.getUser.mockResolvedValueOnce({ publicMetadata: { bgoRole: "MEMBER" } });
  await expect(f.service.list("reviewer", "moderation", { limit: 2 })).rejects.toMatchObject({
    status: 403,
    code: "MODERATOR_REQUIRED",
  });
  expect(f.groups.list).not.toHaveBeenCalled();
  const page = await f.service.list("reviewer", "moderation", { limit: 2 });
  expect(page.items).toEqual([expect.objectContaining({ id, proposal: proposed })]);
  await expect(
    f.service.save("owner", { name: proposed.name, version: 2 }, id),
  ).rejects.toMatchObject({ status: 409, code: "GROUP_CHANGED" });
  expect(f.groups.save).not.toHaveBeenCalled();
});

it("rejects self-enrollment by a public group's creator", async () => {
  const f = setup("PUBLIC");
  await expect(f.service.request("owner", id)).rejects.toMatchObject({
    status: 409,
    code: "ALREADY_GROUP_MEMBER",
  });
  expect(f.groups.saveMembership).not.toHaveBeenCalled();
});

it("refuses bans for absent users or past deadlines and preserves revoked bans", async () => {
  const f = setup();
  await expect(
    f.service.ban("owner", id, { userId: "missing", until: null }),
  ).rejects.toMatchObject({
    status: 404,
    code: "USER_NOT_FOUND",
  });
  await expect(f.service.ban("owner", id, { userId: "guest", until: at })).rejects.toMatchObject({
    status: 400,
    code: "BAN_EXPIRY_MUST_BE_FUTURE",
  });
  await expect(f.service.revoke("owner", id, "guest")).rejects.toMatchObject({
    status: 404,
    code: "BAN_NOT_FOUND",
  });
  expect(f.groups.saveBan).not.toHaveBeenCalled();
  const ban = await f.service.ban("owner", id, { userId: "guest", until: null });
  const revoked = await f.service.revoke("owner", id, "guest");
  expect(revoked).toMatchObject({ id: ban.id, revokedAt: at });
  await expect(f.service.revoke("owner", id, "guest")).rejects.toMatchObject({
    status: 404,
    code: "BAN_NOT_FOUND",
  });
  expect(f.groups.saveBan).toHaveBeenCalledTimes(2);
  expect(f.departure).toHaveBeenCalledExactlyOnceWith(id, "guest", "BAN");
});

it("keeps the accepted membership row visible during a delayed profile mirror", async () => {
  const f = setup();
  f.memberships.set("guest", member("guest"));
  f.profiles.delete("guest");
  const page = await f.service.members("owner", id, "accepted", { limit: 5 });
  expect(page.items).toContainEqual(
    expect.objectContaining({
      userId: "guest",
      membership: member("guest"),
      name: null,
      username: null,
      avatarUrl: null,
    }),
  );
});

it("continues to read legacy accepted memberships as members while rejecting a no-op demotion", async () => {
  const f = setup();
  const row = member("guest", { role: undefined });
  f.memberships.set("guest", row);
  await expect(
    f.service.membershipAction("owner", id, "guest", {
      action: "demote",
      version: row.version,
    }),
  ).rejects.toMatchObject({ status: 409, code: "MEMBERSHIP_CHANGED" });
  expect(f.groups.saveMembership).not.toHaveBeenCalled();
  expect(f.memberships.get("guest")).toBe(row);
});

it("uses the captured route filter and keeps sparse usernames nullable in invitation candidates", async () => {
  const f = setup();
  const page = { limit: 1, query: "Player" };
  const guest = f.profiles.get("guest")!;
  f.groups.invitationCandidates.mockResolvedValueOnce([
    { ...guest, username: null },
    f.profiles.get("member")!,
  ]);
  expect(await f.service.invitationCandidates("owner", id, page)).toEqual({
    items: [
      {
        id: "guest",
        name: guest.name,
        username: null,
        email: guest.email,
        avatarUrl: null,
        presence: guest.presence,
        isFriend: true,
      },
    ],
    nextCursor: "guest",
  });
  expect(f.groups.invitationCandidates).toHaveBeenCalledExactlyOnceWith(id, "owner", page);
});
