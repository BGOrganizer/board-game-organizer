import { expect, it } from "vitest";
import { decideGroupMembershipSchema } from "../dto/groupRecords";
import { groupMembershipSchema } from "../models/groupRecord";

const membership = {
  id: "11111111-1111-4111-8111-111111111111",
  groupId: "22222222-2222-4222-8222-222222222222",
  userId: "user_member",
  kind: "INVITATION",
  status: "ACCEPTED",
  version: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};
it("reads historical memberships as ordinary members and accepts only explicit scoped moderator roles", () => {
  expect(groupMembershipSchema.parse(membership).role).toBeUndefined();
  expect(groupMembershipSchema.parse({ ...membership, role: "MEMBER" }).role).toBe("MEMBER");
  expect(groupMembershipSchema.parse({ ...membership, role: "MODERATOR" }).role).toBe("MODERATOR");
  expect(groupMembershipSchema.safeParse({ ...membership, role: "ADMIN" }).success).toBe(false);
  for (const status of ["PENDING", "LEFT", "DECLINED"])
    expect(
      groupMembershipSchema.safeParse({ ...membership, status, role: "MODERATOR" }).success,
    ).toBe(false);
});
it("requires pinned versions on role decisions and rejects client-authored authority fields", () => {
  for (const action of ["promote", "demote"]) {
    expect(decideGroupMembershipSchema.safeParse({ action, version: 1 }).success).toBe(true);
    expect(decideGroupMembershipSchema.safeParse({ action }).success).toBe(false);
    expect(
      decideGroupMembershipSchema.safeParse({ action, version: 1, role: "MODERATOR" }).success,
    ).toBe(false);
  }
});
