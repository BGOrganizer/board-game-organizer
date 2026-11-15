import type { GroupMembership, GroupRecordResponse } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { ownGroupActions } from "../groupPolicy";

it("keeps own membership actions specific to explicit consent, immutable type and current role", () => {
  const base: Pick<GroupRecordResponse, "role" | "type" | "approved" | "myMembership"> = {
    role: "none",
    type: "PUBLIC",
    approved: { name: "Approved club" },
    myMembership: null,
  };
  const pending = { status: "PENDING", kind: "INVITATION" } as GroupMembership;
  expect(ownGroupActions(base)).toEqual(["request"]);
  expect(ownGroupActions({ ...base, type: "PRIVATE" })).toEqual([]);
  expect(ownGroupActions({ ...base, approved: undefined })).toEqual([]);
  expect(ownGroupActions({ ...base, role: "admin" })).toEqual([]);
  expect(ownGroupActions({ ...base, role: "invited", myMembership: pending })).toEqual([
    "accept",
    "decline",
  ]);
  expect(
    ownGroupActions({ ...base, role: "requested", myMembership: { ...pending, kind: "REQUEST" } }),
  ).toEqual(["cancel"]);
  expect(
    ownGroupActions({
      ...base,
      role: "accepted",
      myMembership: { ...pending, status: "ACCEPTED" },
    }),
  ).toEqual(["cancel"]);
});
