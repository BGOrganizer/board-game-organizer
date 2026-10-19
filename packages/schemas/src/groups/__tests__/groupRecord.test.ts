import { describe, expect, it } from "vitest";
import {
  banGroupUserSchema,
  createGroupRecordSchema,
  decideGroupMembershipSchema,
  decideGroupReviewSchema,
  editGroupRecordSchema,
} from "../dto/groupRecords";
import { groupBanSchema, groupMembershipSchema, groupRecordSchema } from "../models/groupRecord";

const id = "11111111-1111-4111-8111-111111111111";
const at = "2027-01-01T00:00:00Z";
const location = {
  id,
  name: "Club venue",
  address: "Via Roma 1, Roma, Italia",
  longitude: 12.5,
  latitude: 41.9,
};
const privateGroup = {
  id,
  adminUserId: "user_owner",
  type: "PRIVATE",
  approved: { name: "Private club" },
  reservedNames: [],
  version: 1,
  createdAt: at,
  updatedAt: at,
};
const revision = { name: "Public club", logoAssetId: id, location };

describe("unified group records", () => {
  it("allows optional private venue/logo but public revisions require both", () => {
    expect(groupRecordSchema.safeParse(privateGroup).success).toBe(true);
    expect(groupRecordSchema.safeParse({ ...privateGroup, approved: revision }).success).toBe(true);
    const pending = {
      ...privateGroup,
      type: "PUBLIC",
      approved: undefined,
      proposal: revision,
      reviewStatus: "PENDING",
      reservedNames: ["public club"],
    };
    expect(groupRecordSchema.safeParse(pending).success).toBe(true);
    expect(
      groupRecordSchema.safeParse({ ...pending, approved: revision, proposal: undefined }).success,
    ).toBe(true);
    expect(groupRecordSchema.safeParse({ ...pending, approved: revision }).success).toBe(true);
    for (const key of ["approved", "proposal"] as const) {
      expect(
        groupRecordSchema.safeParse({ ...pending, [key]: { name: "Missing fields" } }).success,
      ).toBe(false);
    }
    expect(groupRecordSchema.safeParse({ ...pending, reservedNames: [] }).success).toBe(false);
  });
  it("has no revision-less group or moderation flow for private groups", () => {
    for (const changed of [
      { approved: undefined },
      { proposal: revision },
      { reviewStatus: "PENDING" },
      { approved: undefined, proposal: revision },
    ])
      expect(groupRecordSchema.safeParse({ ...privateGroup, ...changed }).success).toBe(false);
    expect(
      groupRecordSchema.safeParse({ ...privateGroup, type: "PUBLIC", approved: undefined }).success,
    ).toBe(false);
  });
  it("rejects obsolete archival and any extra untrusted stored fields", () => {
    expect(groupRecordSchema.safeParse({ ...privateGroup, archivedAt: at }).success).toBe(false);
    expect(
      groupRecordSchema.safeParse({ ...privateGroup, anotherAdmin: "user_second" }).success,
    ).toBe(false);
  });
});
describe("unified group commands", () => {
  it("validates private/public creation and unique friend invitations", () => {
    const base = { name: "Club group", invitedUserIds: [] };
    expect(createGroupRecordSchema.safeParse({ ...base, type: "PRIVATE" }).success).toBe(true);
    expect(
      createGroupRecordSchema.safeParse({ ...base, ...revision, type: "PUBLIC" }).success,
    ).toBe(true);
    expect(createGroupRecordSchema.safeParse({ ...base, type: "PUBLIC" }).success).toBe(false);
    expect(
      createGroupRecordSchema.safeParse({
        ...base,
        type: "PRIVATE",
        invitedUserIds: ["user_friend", "user_friend"],
      }).success,
    ).toBe(false);
    expect(
      createGroupRecordSchema.safeParse({ ...base, type: "PRIVATE", adminUserId: "user_forged" })
        .success,
    ).toBe(false);
  });
  it("requires versioned edits and disallows type/administrator transfer", () => {
    const body = { name: "Edited club", version: 1 };
    expect(editGroupRecordSchema.safeParse(body).success).toBe(true);
    for (const extra of [
      { type: "PUBLIC" },
      { adminUserId: "user_second" },
      { version: 0 },
      { version: undefined },
    ]) {
      expect(editGroupRecordSchema.safeParse({ ...body, ...extra }).success).toBe(false);
    }
  });
  it("preserves mandatory rejection reason, recipient/member command version and separate ban expiry", () => {
    expect(decideGroupReviewSchema.safeParse({ decision: "approve", version: 1 }).success).toBe(
      true,
    );
    expect(
      decideGroupReviewSchema.safeParse({
        decision: "reject",
        version: 1,
        reason: "Incorrect venue",
      }).success,
    ).toBe(true);
    expect(
      decideGroupReviewSchema.safeParse({ decision: "reject", version: 1, reason: "  " }).success,
    ).toBe(false);
    expect(decideGroupMembershipSchema.safeParse({ action: "accept", version: 1 }).success).toBe(
      true,
    );
    expect(decideGroupMembershipSchema.safeParse({ action: "ban", version: 1 }).success).toBe(
      false,
    );
    expect(banGroupUserSchema.safeParse({ userId: "user_target", until: null }).success).toBe(true);
    expect(banGroupUserSchema.safeParse({ userId: "user_target", until: at }).success).toBe(true);
    expect(banGroupUserSchema.safeParse({ userId: "user_target", until: "tomorrow" }).success).toBe(
      false,
    );
  });
  it("stores nonmember bans independently of memberships without deleting expired records", () => {
    expect(
      groupBanSchema.safeParse({
        id,
        groupId: id,
        userId: "user_target",
        adminUserId: "user_owner",
        until: null,
        createdAt: at,
        updatedAt: at,
      }).success,
    ).toBe(true);
    const row = {
      id,
      groupId: id,
      userId: "user_target",
      kind: "REQUEST",
      status: "PENDING",
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    expect(groupMembershipSchema.safeParse(row).success).toBe(true);
    expect(groupMembershipSchema.safeParse({ ...row, status: "BANNED" }).success).toBe(false);
  });
});
