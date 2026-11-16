import { expect, it } from "vitest";
import { contactRelationshipIds } from "../contactRelationshipIds";
import type { RelationshipRow } from "../hooks/useContacts";

it("keeps only canonical IDs across retained pages without reading other profile fields", () => {
  expect([...contactRelationshipIds(undefined)]).toEqual([]);
  const profile = {
    id: "target",
    get name(): string {
      throw new Error("profile projection is not metadata");
    },
    email: null,
    avatarUrl: null,
    presence: { online: false, lastActiveAt: "" },
  };
  const row: RelationshipRow = { fromUserId: "owner", toUserId: "target", profile };
  const ids = contactRelationshipIds([
    { rows: [{ ...row, profile: null }, row] },
    {
      rows: [
        row,
        {
          ...row,
          profile: {
            id: "second",
            name: "Second",
            email: null,
            avatarUrl: null,
            presence: { online: false, lastActiveAt: "" },
          },
        },
      ],
    },
  ]);
  expect([...ids]).toEqual(["target", "second"]);
});
