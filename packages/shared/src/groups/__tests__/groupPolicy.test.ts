import type { GroupBan, GroupMembership, GroupRecord } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import { canReadGroup, groupBanIsActive, groupCapabilities, groupViewerRole } from "../groupPolicy";

const at = "2027-01-01T00:00:00Z";
const now = Date.parse(at);
const group: GroupRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "user_owner",
  type: "PRIVATE",
  approved: { name: "Private club" },
  reservedNames: [],
  version: 1,
  createdAt: at,
  updatedAt: at,
};
const membership: GroupMembership = {
  id: "22222222-2222-4222-8222-222222222222",
  groupId: group.id,
  userId: "user_member",
  kind: "INVITATION",
  status: "PENDING",
  version: 1,
  createdAt: at,
  updatedAt: at,
};
const ban: GroupBan = {
  id: membership.id,
  groupId: group.id,
  userId: "user_member",
  adminUserId: group.adminUserId,
  until: null,
  createdAt: at,
  updatedAt: at,
};

describe("group bans", () => {
  it("uses exact server instants and revocation, without restoring any membership", () => {
    expect(groupBanIsActive(null, now)).toBe(false);
    expect(groupBanIsActive(ban, now)).toBe(true);
    expect(groupBanIsActive({ ...ban, revokedAt: at }, now)).toBe(false);
    expect(groupBanIsActive({ ...ban, until: at }, now)).toBe(false);
    expect(groupBanIsActive({ ...ban, until: at }, now - 1)).toBe(true);
    expect(groupBanIsActive({ ...ban, until: at }, now + 1)).toBe(false);
    expect(groupViewerRole(group, "user_member", null)).toBe("none");
  });
});
describe("group roles and visibility", () => {
  it("keeps creator authoritative, independent of a missing membership row", () => {
    expect(groupViewerRole(group, group.adminUserId, null)).toBe("admin");
    expect(groupViewerRole(group, "user_member", { ...membership, status: "ACCEPTED" })).toBe(
      "accepted",
    );
    expect(groupViewerRole(group, "user_member", membership)).toBe("invited");
    expect(groupViewerRole(group, "user_member", { ...membership, kind: "REQUEST" })).toBe(
      "requested",
    );
    expect(groupViewerRole(group, "user_member", { ...membership, status: "LEFT" })).toBe("none");
    expect(groupViewerRole(group, "user_member", { ...membership, status: "DECLINED" })).toBe(
      "none",
    );
  });
  it("never reveals private groups to outsiders, requesters or BGO moderators", () => {
    expect(canReadGroup(group, "user_outsider", null, null, now)).toBe(false);
    expect(canReadGroup(group, "user_member", { ...membership, kind: "REQUEST" }, null, now)).toBe(
      false,
    );
    expect(canReadGroup(group, "user_outsider", null, null, now, true)).toBe(false);
    expect(canReadGroup(group, group.adminUserId, null, null, now)).toBe(true);
    expect(canReadGroup(group, "user_member", membership, null, now)).toBe(true);
    expect(
      canReadGroup(group, "user_member", { ...membership, status: "ACCEPTED" }, null, now),
    ).toBe(true);
  });
  it("exposes public approved information only; moderation sees pending proposals", () => {
    const pending: GroupRecord = {
      ...group,
      type: "PUBLIC",
      approved: undefined,
      proposal: { name: "Public club" },
      reviewStatus: "PENDING",
      reservedNames: ["public club"],
    };
    expect(canReadGroup(pending, "user_outsider", null, null, now)).toBe(false);
    expect(canReadGroup(pending, group.adminUserId, null, null, now)).toBe(true);
    expect(canReadGroup(pending, "user_moderator", null, null, now, true)).toBe(true);
    expect(
      canReadGroup({ ...pending, approved: pending.proposal }, "user_outsider", null, null, now),
    ).toBe(true);
    expect(
      canReadGroup({ ...pending, approved: pending.proposal }, "user_member", membership, ban, now),
    ).toBe(false);
    expect(canReadGroup(pending, "user_moderator", null, ban, now, true)).toBe(true);
  });
});
describe("scoped capabilities", () => {
  it("allows only approved, non-banned public roster browsing before requesting, never social/events/rankings", () => {
    const publicGroup = { ...group, type: "PUBLIC" as const };
    const browseOnly = {
      canViewMembers: true,
      canViewEvents: false,
      canViewRankings: false,
      canSocialInteract: false,
      canInvite: false,
      canEdit: false,
    };
    expect(groupCapabilities(publicGroup, "user_member", null, null, now)).toEqual(browseOnly);
    expect(
      groupCapabilities(publicGroup, "user_member", { ...membership, status: "LEFT" }, null, now),
    ).toEqual(browseOnly);
    expect(groupCapabilities(publicGroup, "user_member", null, ban, now).canViewMembers).toBe(
      false,
    );
    expect(
      groupCapabilities({ ...publicGroup, approved: undefined }, "user_member", null, null, now)
        .canViewMembers,
    ).toBe(false);
  });
  it("allows pending roster access but no group social actions, events or rankings", () => {
    for (const kind of ["INVITATION", "REQUEST"] as const) {
      expect(groupCapabilities(group, "user_member", { ...membership, kind }, null, now)).toEqual({
        canViewMembers: true,
        canViewEvents: false,
        canViewRankings: false,
        canSocialInteract: false,
        canInvite: false,
        canEdit: false,
      });
    }
  });
  it("allows accepted members and owner, without inventing owner social mutations", () => {
    expect(
      groupCapabilities(group, "user_member", { ...membership, status: "ACCEPTED" }, null, now),
    ).toEqual({
      canViewMembers: true,
      canViewEvents: true,
      canViewRankings: true,
      canSocialInteract: true,
      canInvite: false,
      canEdit: false,
    });
    expect(groupCapabilities(group, group.adminUserId, null, null, now)).toEqual({
      canViewMembers: true,
      canViewEvents: true,
      canViewRankings: true,
      canSocialInteract: true,
      canInvite: true,
      canEdit: true,
    });
  });
  it("denies capabilities to outsiders, banned/former users and an unapproved public group", () => {
    const none = {
      canViewMembers: false,
      canViewEvents: false,
      canViewRankings: false,
      canSocialInteract: false,
      canInvite: false,
      canEdit: false,
    };
    expect(groupCapabilities(group, "user_member", null, null, now)).toEqual(none);
    expect(groupCapabilities(group, "user_member", membership, ban, now)).toEqual(none);
    expect(
      groupCapabilities(group, "user_member", { ...membership, status: "LEFT" }, null, now),
    ).toEqual(none);
    expect(
      groupCapabilities(
        { ...group, type: "PUBLIC", approved: undefined },
        group.adminUserId,
        null,
        null,
        now,
      ),
    ).toEqual({ ...none, canEdit: true });
    expect(groupCapabilities(group, "user_member", null, { ...ban, until: at }, now)).toEqual(none);
  });
});
