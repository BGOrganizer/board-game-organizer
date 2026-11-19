import type {
  Organization,
  OrganizationMembership,
  SaveOrganizationInput,
  User,
} from "@board-game-organizer/schemas";
import { MongoServerError, ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationsService } from "../organizations.service";

const clerk = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser: clerk.getUser } }),
}));

// Retained service units, not public endpoint acceptance: real authorization,
// location verification and DTO construction; repository/Clerk ports only.
const now = "2030-06-01T10:00:00.000Z";
const location = {
  id: "verified-venue",
  name: "Games club",
  address: "Via Roma 1, Roma, Italia",
  latitude: 41.9028,
  longitude: 12.4964,
  timeZone: "Europe/Rome",
};
const revision = {
  name: "Approved games club",
  logoAssetId: "22222222-2222-4222-8222-222222222222",
  location,
};
const organization: Organization = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "admin",
  status: "CREATED",
  approved: revision,
  reservedNames: ["approved games club"],
  version: 2,
  createdAt: now,
  updatedAt: now,
};
function membership(patch: Partial<OrganizationMembership> = {}): OrganizationMembership {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    organizationId: organization.id,
    userId: "guest",
    kind: "INVITATION",
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}
function profile(clerkId: string): User {
  return {
    _id: new ObjectId("000000000000000000000001"),
    clerkId,
    email: `${clerkId}@fixture.test`,
    name: `Profile ${clerkId}`,
    username: clerkId,
    avatarUrl: `https://fixture.test/${clerkId}.png`,
    preferredLanguage: "en",
    plan: "free",
    presence: { online: false, lastActiveAt: new Date(now) },
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}
function setup(current: Organization | null = organization) {
  const repo = {
    find: vi.fn(async (): Promise<Organization | null> => current),
    lock: vi.fn(async (): Promise<Organization | null> => current),
    findMembership: vi.fn(async (): Promise<OrganizationMembership | null> => null),
    saveMembership: vi.fn(async (_value: OrganizationMembership) => undefined),
    save: vi.fn(async (_value: Organization) => undefined),
    create: vi.fn(async (_value: Organization) => undefined),
    list: vi.fn(async (): Promise<Organization[]> => []),
    listMemberships: vi.fn(async (): Promise<OrganizationMembership[]> => []),
    countMembers: vi.fn(async () => 3),
    countPublishedEvents: vi.fn(async () => 2),
  };
  const assets = {
    find: vi.fn(
      async (): Promise<{ thumbnailBase64?: string } | null> => ({
        thumbnailBase64: "preview",
      }),
    ),
    claim: vi.fn(async () => true),
    expireUnused: vi.fn(async () => undefined),
  };
  const users = {
    findById: vi.fn(async (id: string): Promise<User | null> => profile(id)),
    findByIds: vi.fn(async (_ids: string[]): Promise<User[]> => []),
    moderatorIds: vi.fn(async () => ["moderator", "moderator"]),
  };
  const relationships = {
    isFriend: vi.fn(async () => true),
    isBlocked: vi.fn(async () => false),
    memberStates: vi.fn(async () => new Map()),
  };
  const notifications = { notifyMany: vi.fn(async () => undefined) };
  const departure = vi.fn(async () => undefined);
  const service = new OrganizationsService(
    repo as unknown as ConstructorParameters<typeof OrganizationsService>[0],
    assets as unknown as ConstructorParameters<typeof OrganizationsService>[1],
    users as unknown as ConstructorParameters<typeof OrganizationsService>[2],
    relationships as unknown as ConstructorParameters<typeof OrganizationsService>[3],
    notifications as unknown as ConstructorParameters<typeof OrganizationsService>[4],
    departure,
  );
  return {
    service,
    repo,
    assets,
    users,
    relationships,
    notifications,
    departure,
  };
}
function unchangedInput(): SaveOrganizationInput {
  return { ...revision, name: "Proposed club name" };
}
beforeEach(() => {
  clerk.getUser.mockReset();
  clerk.getUser.mockResolvedValue({ publicMetadata: { bgoRole: "ADMIN" } });
});

describe("retained organization read and moderation authority", () => {
  it("rejects a missing public record without assets or relationship reads", async () => {
    const s = setup(null);
    await expect(s.service.detail("guest", organization.id)).rejects.toMatchObject({
      status: 404,
      message: "ORGANIZATION_NOT_FOUND",
    });
    expect(s.assets.find).not.toHaveBeenCalled();
  });
  it("rejects a missing locked record before membership writes", async () => {
    const s = setup(null);
    await expect(s.service.request("guest", organization.id)).rejects.toMatchObject({
      status: 404,
    });
    expect(s.repo.saveMembership).not.toHaveBeenCalled();
  });
  it("fails closed for a historical owner record with neither revision", async () => {
    const s = setup({
      ...organization,
      approved: undefined,
      proposal: undefined,
    });
    await expect(s.service.detail("admin", organization.id)).rejects.toThrow(
      "ORGANIZATION_NOT_FOUND",
    );
    expect(s.repo.findMembership).not.toHaveBeenCalled();
  });
  it.each([null, {}])("keeps a missing thumbnail fallback explicit (%s)", async (asset) => {
    const s = setup();
    s.assets.find.mockResolvedValue(asset);
    await expect(s.service.detail("guest", organization.id)).resolves.toMatchObject({
      logo: "data:image/webp;base64,",
      memberCount: 4,
      publishedEventCount: 2,
    });
  });
  it("allows only freshly authorized moderation to inspect excluded membership", async () => {
    const s = setup();
    s.repo.findMembership.mockResolvedValue(
      membership({ status: "EXCLUDED", excludedReason: "BANNED" }),
    );
    await expect(s.service.detail("guest", organization.id)).rejects.toThrow(
      "ORGANIZATION_EXCLUDED",
    );
    await expect(s.service.moderationDetail("guest", organization.id)).resolves.toMatchObject({
      role: "excluded",
      myMembership: { status: "EXCLUDED" },
    });
    expect(clerk.getUser).toHaveBeenCalledWith("guest");
    clerk.getUser.mockResolvedValue({ publicMetadata: {} });
    await expect(s.service.moderationDetail("guest", organization.id)).rejects.toThrow(
      "MODERATOR_REQUIRED",
    );
  });
  it("bounds moderation lists and uses the last visible record for its cursor", async () => {
    const proposal = { ...revision, name: "Private pending proposal" };
    const s = setup();
    s.repo.list.mockResolvedValue([
      { ...organization, proposal, status: "MODIFIED" },
      { ...organization, id: "lookahead" },
    ]);
    const page = { limit: 1 };
    const result = await s.service.list("moderator", "moderation", page, ["admin"]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: proposal.name,
      proposal,
      status: "MODIFIED",
    });
    expect(result.nextCursor).toBe(`${now}|${organization.id}`);
    expect(s.repo.list).toHaveBeenCalledWith("moderator", "moderation", page, ["admin"]);
    expect(s.assets.find).toHaveBeenCalledTimes(1);
  });
  it("does not query moderation records after current provider authority is revoked", async () => {
    const s = setup();
    clerk.getUser.mockResolvedValue({ publicMetadata: { bgoRole: "USER" } });
    await expect(s.service.list("guest", "moderation", { limit: 10 })).rejects.toMatchObject({
      status: 403,
    });
    expect(s.repo.list).not.toHaveBeenCalled();
  });
});

describe("retained organization revision conflict safety", () => {
  it("requires the actual owner before version or logo writes", async () => {
    const s = setup();
    await expect(
      s.service.save("guest", { ...unchangedInput(), version: 2 }, organization.id),
    ).rejects.toThrow("ORGANIZATION_ADMIN_REQUIRED");
    expect(s.assets.claim).not.toHaveBeenCalled();
    expect(s.repo.save).not.toHaveBeenCalled();
  });
  it.each([undefined, 1])("rejects an absent or stale update version (%s)", async (version) => {
    const s = setup();
    const input = version === undefined ? unchangedInput() : { ...unchangedInput(), version };
    await expect(s.service.save("admin", input, organization.id)).rejects.toThrow(
      "ORGANIZATION_CHANGED",
    );
    expect(s.assets.claim).not.toHaveBeenCalled();
  });
  it("rejects an unclaimable logo after verifying the retained canonical location", async () => {
    const s = setup();
    s.assets.claim.mockResolvedValue(false);
    await expect(
      s.service.save("admin", { ...unchangedInput(), version: 2 }, organization.id),
    ).rejects.toMatchObject({ status: 400, message: "INVALID_LOGO" });
    expect(s.assets.claim).toHaveBeenCalledWith(revision.logoAssetId, "admin", organization.id);
    expect(s.repo.save).not.toHaveBeenCalled();
    expect(s.notifications.notifyMany).not.toHaveBeenCalled();
  });
  it.each([
    new Error("Storage offline"),
    new MongoServerError({ message: "Storage validation", code: 121 }),
  ])("preserves non-duplicate storage failures without notifications (%s)", async (error) => {
    const s = setup();
    s.repo.save.mockRejectedValue(error);
    await expect(
      s.service.save("admin", { ...unchangedInput(), version: 2 }, organization.id),
    ).rejects.toBe(error);
    expect(s.assets.expireUnused).not.toHaveBeenCalled();
    expect(s.notifications.notifyMany).not.toHaveBeenCalled();
  });
  it("maps only duplicate names to a conflict", async () => {
    const s = setup();
    s.repo.save.mockRejectedValue(new MongoServerError({ message: "Duplicate", code: 11000 }));
    await expect(
      s.service.save("admin", { ...unchangedInput(), version: 2 }, organization.id),
    ).rejects.toMatchObject({
      status: 409,
      message: "ORGANIZATION_NAME_TAKEN",
    });
  });
  it("keeps the approved logo, expires only the superseded proposal, and deduplicates moderator notices", async () => {
    const oldProposal = {
      ...revision,
      logoAssetId: "44444444-4444-4444-8444-444444444444",
    };
    const s = setup({ ...organization, proposal: oldProposal });
    const result = await s.service.save(
      "admin",
      { ...unchangedInput(), version: 2 },
      organization.id,
    );
    expect(result).toMatchObject({
      name: "Proposed club name",
      status: "MODIFIED",
      version: 3,
      approved: revision,
      proposal: { location: { timeZone: "Europe/Rome" } },
    });
    expect(s.assets.expireUnused).toHaveBeenCalledExactlyOnceWith(
      oldProposal.logoAssetId,
      organization.id,
    );
    expect(s.notifications.notifyMany).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({
        recipientUserId: "moderator",
        resourceName: "Proposed club name",
        resourceHref: "/moderation",
      }),
    ]);
  });
  it.each([
    { proposal: undefined, reviewStatus: "PENDING" as const, version: 2 },
    { proposal: revision, reviewStatus: "REJECTED" as const, version: 2 },
    { proposal: revision, reviewStatus: "PENDING" as const, version: 3 },
  ])("rejects a stale/non-pending review snapshot (%j)", async (patch) => {
    const s = setup({ ...organization, ...patch });
    await expect(
      s.service.review("moderator", organization.id, {
        decision: "approve",
        version: 2,
      }),
    ).rejects.toThrow("ORGANIZATION_CHANGED");
    expect(s.repo.save).not.toHaveBeenCalled();
    expect(s.notifications.notifyMany).not.toHaveBeenCalled();
  });
});

describe("retained organization membership transition guards", () => {
  it.each(["invite", "request"] as const)(
    "rejects %s for an unapproved organization",
    async (method) => {
      const s = setup({
        ...organization,
        approved: undefined,
        proposal: revision,
      });
      const promise =
        method === "invite"
          ? s.service.invite("admin", organization.id, "guest")
          : s.service.request("guest", organization.id);
      await expect(promise).rejects.toMatchObject({
        status: method === "invite" ? 409 : 404,
      });
      expect(s.repo.saveMembership).not.toHaveBeenCalled();
    },
  );
  it.each(["invite", "request"] as const)("rejects administrator self-%s", async (method) => {
    const s = setup();
    const promise =
      method === "invite"
        ? s.service.invite("admin", organization.id, "admin")
        : s.service.request("admin", organization.id);
    await expect(promise).rejects.toThrow("ALREADY_ORGANIZATION_MEMBER");
    expect(s.users.findById).not.toHaveBeenCalled();
  });
  it("rejects a missing target before relationship reads", async () => {
    const s = setup();
    s.users.findById.mockResolvedValue(null);
    await expect(s.service.invite("admin", organization.id, "guest")).rejects.toThrow(
      "USER_NOT_FOUND",
    );
    expect(s.relationships.isFriend).not.toHaveBeenCalled();
  });
  it.each(["not-friend", "blocked"])(
    "requires a confirmed unblocked friend (%s)",
    async (condition) => {
      const s = setup();
      s.relationships.isFriend.mockResolvedValue(condition !== "not-friend");
      s.relationships.isBlocked.mockResolvedValue(condition === "blocked");
      await expect(s.service.invite("admin", organization.id, "guest")).rejects.toThrow(
        "CONFIRMED_FRIEND_REQUIRED",
      );
      expect(s.repo.saveMembership).not.toHaveBeenCalled();
      expect(s.notifications.notifyMany).not.toHaveBeenCalled();
    },
  );
  it.each(["invite", "request"] as const)(
    "cannot reactivate excluded membership through %s",
    async (method) => {
      const s = setup();
      s.repo.findMembership.mockResolvedValue(membership({ status: "EXCLUDED" }));
      const promise =
        method === "invite"
          ? s.service.invite("admin", organization.id, "guest")
          : s.service.request("guest", organization.id);
      await expect(promise).rejects.toThrow("ORGANIZATION_EXCLUDED");
      expect(s.repo.saveMembership).not.toHaveBeenCalled();
    },
  );
  it.each(["ACCEPTED", "PENDING"] as const)(
    "rejects duplicate requests against %s membership",
    async (status) => {
      const s = setup();
      s.repo.findMembership.mockResolvedValue(membership({ status }));
      await expect(s.service.request("guest", organization.id)).rejects.toThrow(
        "MEMBERSHIP_ALREADY_ACTIVE",
      );
    },
  );
  it("protects the immutable administrator membership", async () => {
    const s = setup();
    await expect(
      s.service.membershipAction("admin", organization.id, "admin", "remove"),
    ).rejects.toThrow("ORGANIZATION_ADMIN_CANNOT_LEAVE");
    expect(s.repo.findMembership).not.toHaveBeenCalled();
  });
  it("rejects an absent membership before mutation", async () => {
    const s = setup();
    await expect(
      s.service.membershipAction("admin", organization.id, "guest", "approve"),
    ).rejects.toThrow("MEMBERSHIP_NOT_FOUND");
    expect(s.repo.saveMembership).not.toHaveBeenCalled();
  });
  it.each(["accept", "decline"] as const)("rejects replayed invitation %s", async (action) => {
    const s = setup();
    s.repo.findMembership.mockResolvedValue(membership({ status: "ACCEPTED" }));
    await expect(
      s.service.membershipAction("guest", organization.id, "guest", action),
    ).rejects.toThrow("MEMBERSHIP_CHANGED");
    expect(s.repo.saveMembership).not.toHaveBeenCalled();
  });
  it("declines an invitation and notifies its administrator without departure side effects", async () => {
    const s = setup();
    const original = membership();
    s.repo.findMembership.mockResolvedValue(original);
    const result = await s.service.membershipAction("guest", organization.id, "guest", "decline");
    expect(result).toMatchObject({
      id: original.id,
      status: "DECLINED",
      createdAt: original.createdAt,
    });
    expect(result).not.toHaveProperty("excludedReason");
    expect(s.departure).not.toHaveBeenCalled();
    expect(s.notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientUserId: "admin",
        resourceName: revision.name,
      }),
    ]);
  });
  it.each([
    ["guest", "REQUEST"],
    ["admin", "INVITATION"],
  ] as const)("requires the request administrator (%s / %s)", async (actor, kind) => {
    const s = setup();
    s.repo.findMembership.mockResolvedValue(membership({ kind }));
    await expect(
      s.service.membershipAction(actor, organization.id, "guest", "reject"),
    ).rejects.toThrow("ORGANIZATION_ADMIN_REQUIRED");
    expect(s.repo.saveMembership).not.toHaveBeenCalled();
  });
  it.each(["approve", "reject"] as const)("rejects replayed request %s", async (action) => {
    const s = setup();
    s.repo.findMembership.mockResolvedValue(membership({ kind: "REQUEST", status: "DECLINED" }));
    await expect(
      s.service.membershipAction("admin", organization.id, "guest", action),
    ).rejects.toThrow("MEMBERSHIP_CHANGED");
  });
  it("rejects a pending request without excluding or departing the user", async () => {
    const s = setup();
    s.repo.findMembership.mockResolvedValue(membership({ kind: "REQUEST" }));
    await expect(
      s.service.membershipAction("admin", organization.id, "guest", "reject"),
    ).resolves.toMatchObject({ status: "DECLINED", kind: "REQUEST" });
    expect(s.departure).not.toHaveBeenCalled();
    expect(s.notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({ recipientUserId: "guest" }),
    ]);
  });
  it.each([
    ["admin", "ACCEPTED", "INVITATION"],
    ["guest", "DECLINED", "REQUEST"],
    ["guest", "PENDING", "INVITATION"],
  ] as const)("forbids cancellation by %s in %s/%s", async (actor, status, kind) => {
    const s = setup();
    s.repo.findMembership.mockResolvedValue(membership({ kind, status }));
    await expect(
      s.service.membershipAction(actor, organization.id, "guest", "cancel"),
    ).rejects.toThrow("MEMBERSHIP_ACTION_FORBIDDEN");
    expect(s.repo.saveMembership).not.toHaveBeenCalled();
    expect(s.departure).not.toHaveBeenCalled();
  });
  it.each(["ACCEPTED", "PENDING"] as const)(
    "permits self-cancellation of %s requests and preserves original identity",
    async (status) => {
      const s = setup();
      const current = membership({ kind: "REQUEST", status });
      s.repo.findMembership.mockResolvedValue(current);
      await expect(
        s.service.membershipAction("guest", organization.id, "guest", "cancel"),
      ).resolves.toMatchObject({
        id: current.id,
        status: "LEFT",
        createdAt: now,
      });
      expect(s.departure).toHaveBeenCalledExactlyOnceWith(organization.id, "guest");
    },
  );
  it.each(["remove", "ban", "revoke"] as const)(
    "requires current administrator authority for %s",
    async (action) => {
      const s = setup();
      s.repo.findMembership.mockResolvedValue(membership({ status: "ACCEPTED" }));
      await expect(
        s.service.membershipAction("outsider", organization.id, "guest", action),
      ).rejects.toThrow("ORGANIZATION_ADMIN_REQUIRED");
      expect(s.repo.saveMembership).not.toHaveBeenCalled();
    },
  );
  it.each(["ACCEPTED", "PENDING", "LEFT"] as const)(
    "cannot revoke non-excluded membership (%s)",
    async (status) => {
      const s = setup();
      s.repo.findMembership.mockResolvedValue(membership({ status }));
      await expect(
        s.service.membershipAction("admin", organization.id, "guest", "revoke"),
      ).rejects.toThrow("MEMBERSHIP_CHANGED");
    },
  );
  it("permits departure from a retained revisionless record without inventing a resource name", async () => {
    const s = setup({ ...organization, approved: undefined });
    s.repo.findMembership.mockResolvedValue(membership({ status: "ACCEPTED" }));
    await s.service.membershipAction("guest", organization.id, "guest", "cancel");
    expect(s.notifications.notifyMany).toHaveBeenCalledWith([
      expect.objectContaining({
        resourceName: "",
        resourceHref: `/organizations/${organization.id}`,
      }),
    ]);
  });
});

describe("retained organization membership list completeness", () => {
  it("preserves missing mirrored user rows, admin identity, bounded lookahead and a canonical cursor", async () => {
    const s = setup();
    const visible = membership({ status: "ACCEPTED" });
    s.repo.listMemberships.mockResolvedValue([
      visible,
      membership({ id: "lookahead", userId: "other", status: "ACCEPTED" }),
    ]);
    const result = await s.service.members("admin", organization.id, {
      limit: 1,
    });
    expect(result.items).toEqual([
      {
        userId: "admin",
        name: null,
        username: null,
        avatarUrl: null,
        social: undefined,
        isAdmin: true,
        membership: null,
      },
      {
        userId: "guest",
        name: null,
        username: null,
        avatarUrl: null,
        social: undefined,
        isAdmin: false,
        membership: visible,
      },
    ]);
    expect(result.nextCursor).toBe(`${now}|${visible.id}`);
    expect(s.users.findByIds).toHaveBeenCalledWith(["guest", "admin"]);
  });
  it.each(["pending", "excluded"] as const)(
    "does not expose private %s lists to accepted ordinary members",
    async (mode) => {
      const s = setup();
      s.repo.findMembership.mockResolvedValue(membership({ status: "ACCEPTED" }));
      await expect(
        s.service.members("guest", organization.id, { limit: 10 }, mode),
      ).rejects.toThrow("ORGANIZATION_MEMBER_REQUIRED");
      expect(s.repo.listMemberships).not.toHaveBeenCalled();
    },
  );
  it("does not duplicate the administrator on a continuation page", async () => {
    const s = setup();
    const visible = membership({ status: "ACCEPTED" });
    s.repo.findMembership.mockResolvedValue(visible);
    s.repo.listMemberships.mockResolvedValue([visible]);
    s.users.findByIds.mockResolvedValue([profile("guest")]);
    const result = await s.service.members("guest", organization.id, {
      limit: 1,
      cursor: "prior|id",
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        userId: "guest",
        username: "guest",
        isAdmin: false,
      }),
    ]);
    expect(result.nextCursor).toBeNull();
    expect(s.users.findByIds).toHaveBeenCalledWith(["guest"]);
  });
});
