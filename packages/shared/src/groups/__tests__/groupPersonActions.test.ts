import type { GroupBan, GroupMembership, GroupPersonResponse } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { groupPersonActions } from "../groupPolicy";

it("separates group administration from global social blocking and protects the sole administrator", () => {
  const member: Pick<GroupPersonResponse, "isAdmin" | "membership" | "ban"> = {
    isAdmin: false,
    membership: null,
    ban: null,
  };
  const membership = { status: "PENDING", kind: "REQUEST" } as GroupMembership;
  expect(groupPersonActions({ role: "accepted" }, member)).toEqual([]);
  expect(groupPersonActions({ role: "admin" }, { ...member, isAdmin: true })).toEqual([]);
  expect(groupPersonActions({ role: "admin" }, member)).toEqual([]);
  expect(groupPersonActions({ role: "admin" }, { ...member, membership })).toEqual([
    "approve",
    "reject",
    "ban",
  ]);
  expect(
    groupPersonActions(
      { role: "admin" },
      { ...member, membership: { ...membership, kind: "INVITATION" } },
    ),
  ).toEqual(["remove", "ban"]);
  expect(
    groupPersonActions(
      { role: "admin" },
      { ...member, membership: { ...membership, status: "ACCEPTED" } },
    ),
  ).toEqual(["remove", "ban"]);
  expect(
    groupPersonActions(
      { role: "admin" },
      { ...member, membership: { ...membership, status: "LEFT" } },
    ),
  ).toEqual([]);
  expect(
    groupPersonActions(
      { role: "admin" },
      { ...member, membership: { ...membership, status: "DECLINED" } },
    ),
  ).toEqual([]);
  expect(groupPersonActions({ role: "admin" }, { ...member, ban: {} as GroupBan })).toEqual([
    "revoke",
  ]);
  expect(
    groupPersonActions(
      { role: "admin" },
      { ...member, ban: { revokedAt: "2027-01-01T00:00:00Z" } as GroupBan },
    ),
  ).toEqual([]);
});
