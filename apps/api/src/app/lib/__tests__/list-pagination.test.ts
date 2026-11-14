import { describe, expect, it } from "vitest";
import { type ListRole, pageNamedList, parseListQuery } from "../list-pagination";

const rows = [
  {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Catan Night",
    createdAt: "2026-09-24T12:00:00.000Z",
    role: "admin",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "catan party",
    createdAt: "2026-09-24T12:00:00.000Z",
    role: "invited",
  },
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Chess",
    createdAt: "2026-09-22T12:00:00.000Z",
    role: "accepted",
  },
] satisfies Array<{ id: string; name: string; createdAt: string; role: ListRole }>;

function query(value: string) {
  return parseListQuery(new Request(`http://localhost/api/matches?${value}`));
}

function validQuery(value: string) {
  const parsed = query(value);
  if (!parsed) throw new Error(`Invalid test query: ${value}`);
  return parsed;
}

const role = (row: (typeof rows)[number]) => row.role;

describe("list search and cursor pagination", () => {
  it("combines roles as union and intersects names case-insensitively", () => {
    const options = validQuery("limit=20&query=CATAN&roles=admin,accepted");
    expect(pageNamedList(rows, options, role).items.map((row) => row.id)).toEqual([rows[0].id]);
    expect(
      pageNamedList(rows, validQuery("limit=20&roles=invited,accepted"), role).items.map(
        (row) => row.id,
      ),
    ).toEqual([rows[1].id, rows[2].id]);
    expect(pageNamedList(rows, validQuery("limit=20&roles="), role).items).toEqual([]);
  });

  it("paginates tied timestamps without repeating rows", () => {
    const first = pageNamedList(rows, validQuery("limit=1"), role);
    expect(first.items[0]?.id).toBe(rows[0].id);
    expect(first.nextCursor).toBe(`${rows[0].createdAt}|${rows[0].id}`);
    const second = pageNamedList(
      rows,
      validQuery(`limit=1&cursor=${encodeURIComponent(first.nextCursor ?? "")}`),
      role,
    );
    expect(second.items[0]?.id).toBe(rows[1].id);
    const third = pageNamedList(
      rows,
      validQuery(`limit=1&cursor=${encodeURIComponent(second.nextCursor ?? "")}`),
      role,
    );
    expect(third.items[0]?.id).toBe(rows[2].id);
    expect(third.nextCursor).toBeNull();
  });

  it("rejects invalid, duplicated, oversized, or unrecognized parameters", () => {
    for (const value of [
      "limit=0",
      "limit=51",
      "limit=oops",
      "query=abc",
      "roles=other",
      "cursor=bad&limit=2",
      "cursor=2026-09-24T12%3A00%3A00.000Z%7C00000000-0000-4000-8000-000000000003",
      "limit=20&limit=30",
      "unused=1",
      "x-vercel-protection-bypass=a&x-vercel-protection-bypass=b",
    ])
      expect(query(value)).toBeNull();
  });
});
