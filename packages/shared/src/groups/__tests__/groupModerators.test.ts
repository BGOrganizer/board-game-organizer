import type {
  GroupMembership,
  GroupPersonResponse,
  GroupRecord,
  GroupRecordResponse,
} from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { canManageEvent, eventRecordCapabilities } from "../../events/eventRecordPolicy";
import {
  canReadGroup,
  groupCapabilities,
  groupPersonActions,
  groupViewerRole,
  isGroupManagerRole,
  isGroupModerator,
  ownGroupActions,
} from "../groupPolicy";

const group = {
  id: "group",
  adminUserId: "owner",
  approved: { name: "Group" },
  type: "PRIVATE",
} as GroupRecord;
const member = {
  userId: "mod",
  status: "ACCEPTED",
  role: "MODERATOR",
  kind: "INVITATION",
} as GroupMembership;
it("grants scoped management only to accepted moderators without confusing global review authority", () => {
  expect(isGroupModerator(null)).toBe(false);
  expect(groupViewerRole(group, "mod", member)).toBe("moderator");
  expect(groupCapabilities(group, "mod", member, null, 0)).toMatchObject({
    canInvite: true,
    canEdit: true,
    canViewMembers: true,
    canViewEvents: true,
    canViewRankings: true,
  });
  expect(canReadGroup(group, "mod", member, null, 0)).toBe(true);
  expect(canReadGroup(group, "global-moderator", null, null, 0, true)).toBe(false);
  expect(isGroupManagerRole("moderator")).toBe(true);
  expect(isGroupManagerRole("accepted")).toBe(false);
  for (const status of ["LEFT", "DECLINED", "PENDING"] as const) {
    const row = { ...member, status };
    expect(isGroupModerator(row)).toBe(false);
    expect(groupCapabilities(group, "mod", row, null, 0).canEdit).toBe(false);
  }
  expect(groupCapabilities(group, "mod", member, { until: null } as never, 0).canEdit).toBe(false);
  expect(
    ownGroupActions({
      role: "moderator",
      type: "PRIVATE",
      myMembership: member,
      approved: group.approved,
    } as GroupRecordResponse),
  ).toEqual(["cancel"]);
});
it("creator alone manages roles; peer moderators and creator remain protected from moderator removal/ban", () => {
  const person = { isAdmin: false, membership: member, ban: null } as GroupPersonResponse;
  expect(groupPersonActions({ role: "moderator" }, person)).toEqual([]);
  expect(groupPersonActions({ role: "moderator" }, { ...person, isAdmin: true })).toEqual([]);
  expect(groupPersonActions({ role: "admin" }, person)).toEqual(["remove", "ban", "demote"]);
  expect(
    groupPersonActions(
      { role: "moderator" },
      { ...person, membership: { ...member, role: "MEMBER" } },
    ),
  ).toEqual(["remove", "ban"]);
  expect(
    groupPersonActions({ role: "admin" }, { ...person, membership: { ...member, role: "MEMBER" } }),
  ).toEqual(["remove", "ban", "promote"]);
});
it("authoritative Event management overrides legacy creator equality, including demotion and read-only guards", () => {
  const event = { adminUserId: "original", status: "PLANNING" } as never;
  expect(canManageEvent(undefined, "original")).toBe(false);
  expect(canManageEvent({ adminUserId: "original" }, "original")).toBe(true);
  expect(canManageEvent({ adminUserId: "original", canManage: true }, "mod")).toBe(true);
  expect(canManageEvent({ adminUserId: "original", canManage: false }, "original")).toBe(false);
  expect(canManageEvent({ adminUserId: "original", canManage: true, readOnly: true }, "mod")).toBe(
    false,
  );
  expect(eventRecordCapabilities(event, "PRIVATE", "mod", true, [], 0, true)).toMatchObject({
    canEdit: true,
    canInvite: true,
    canConfirm: true,
    canVote: false,
  });
  expect(eventRecordCapabilities(event, "PRIVATE", "original", true, [], 0, false)).toMatchObject({
    canEdit: false,
    canInvite: false,
    canConfirm: false,
  });
});
