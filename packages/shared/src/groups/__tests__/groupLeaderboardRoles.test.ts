import { expect, it } from "vitest";
import { groupLeaderboardRoles } from "../groupLeaderboardRoles";

it.each([
  ["ADMIN", ["admin"]],
  ["MODERATOR", ["moderator"]],
  ["MEMBER", ["acceptedMember"]],
  [null, []],
  [undefined, []],
] as const)("projects only the current authoritative %s role", (groupRole, roles) => {
  expect(groupLeaderboardRoles({ left: false, groupRole })).toEqual(roles);
});
it.each(["ADMIN", "MODERATOR", "MEMBER", null, undefined] as const)(
  "never revives a former member's %s role",
  (groupRole) => {
    expect(groupLeaderboardRoles({ left: true, groupRole })).toEqual([]);
  },
);
