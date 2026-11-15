import { expect, it } from "vitest";
import { canGenerateTableInviteLink } from "../invitePolicy";

const eligible = {
  canInvite: true,
  groupId: "private-group",
  groupType: "PRIVATE" as const,
  status: "PLANNING" as const,
};
it("allows the current private Group manager during planning", () => {
  expect(canGenerateTableInviteLink(eligible)).toBe(true);
});
it.each([
  undefined,
  null,
  { ...eligible, canInvite: false },
  { ...eligible, groupId: null },
  { ...eligible, groupId: "" },
  { ...eligible, groupType: "PUBLIC" as const },
  { ...eligible, groupType: null },
  { ...eligible, status: "CONFIRMED" as const },
  { ...eligible, status: "TERMINATED" as const },
])("denies missing, unauthorized, public or closed contexts: %j", (event) => {
  expect(canGenerateTableInviteLink(event)).toBe(false);
});
