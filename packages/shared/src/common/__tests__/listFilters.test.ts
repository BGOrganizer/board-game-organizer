import { describe, expect, it } from "vitest";
import { filterPagedRows, listPagePath, patchPagedList } from "../hooks/listFilters";

const rows = [
  { id: "admin", name: "Catan", adminUserId: "me", invitations: [] },
  {
    id: "invited",
    name: "Catan",
    adminUserId: "other",
    invitations: [{ inviteeUserId: "me", status: "PENDING" }],
  },
  {
    id: "accepted",
    name: "Chess",
    adminUserId: "other",
    invitations: [{ inviteeUserId: "me", status: "ACCEPTED" }],
  },
];

describe("list filters", () => {
  it("combines roles with name, excluding former members", () => {
    expect(
      filterPagedRows(rows, "me", [
        "groups",
        "paged",
        "api",
        "token",
        "catan",
        "admin,invited",
      ]).map((row) => row.id),
    ).toEqual(["admin", "invited"]);
    expect(
      filterPagedRows(rows, "me", ["matches", "paged", "api", "token", "", "accepted"]).map(
        (row) => row.id,
      ),
    ).toEqual(["accepted"]);
    expect(
      filterPagedRows(rows, "outsider", [
        "groups",
        "paged",
        "api",
        "token",
        "",
        "admin,invited,accepted",
      ]),
    ).toEqual([]);
    expect(filterPagedRows(rows, "me", ["groups", "paged", "api", "token", "", ""])).toEqual([]);
  });

  it("encodes page parameters and only patches paginated items", () => {
    expect(
      listPagePath(
        "matches",
        { limit: 20, query: "Catan & friends", roles: ["admin", "accepted"] },
        "date|id",
      ),
    ).toBe("matches?limit=20&roles=admin%2Caccepted&query=Catan+%26+friends&cursor=date%7Cid");
    expect(listPagePath("groups", { limit: 20, query: "", roles: [] }, "")).toBe(
      "groups?limit=20&roles=",
    );
    const data = { pages: [{ groups: rows, nextCursor: "next" }], pageParams: [""] };
    expect(
      patchPagedList(data, "groups", (items: typeof rows, index) =>
        index === 0 ? items.slice(1) : items,
      ),
    ).toEqual({ pages: [{ groups: rows.slice(1), nextCursor: "next" }], pageParams: [""] });
    expect(patchPagedList(null, "groups", (items: typeof rows) => items)).toBeNull();
    expect(
      patchPagedList({ pages: [{ other: [] }] }, "groups", (items: typeof rows) => items),
    ).toEqual({ pages: [{ other: [] }] });
  });
});
