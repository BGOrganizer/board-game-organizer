import { describe, expect, it } from "vitest";
import { mapCommunityCache, restoreCommunityFields, versionedCommunityChange } from "../queryCache";

describe("owned community cache updates", () => {
  it("replays only known entity versions across list/detail and preserves authoritative updates", () => {
    type Row = {
      id: string;
      name: string;
      version?: number;
      updatedAt?: string;
      membership?: { version: number } | null;
    };
    const guarded = versionedCommunityChange<Row>(
      (row) => ({ ...row, name: "pending" }),
      (row) => row.id,
    );
    const before = { id: "one", name: "before", version: 1 };
    expect(guarded.change(before, ["list"])).toMatchObject({ name: "pending" });
    guarded.change({ id: "time", name: "before", updatedAt: "old" }, ["table"]);
    guarded.change({ id: "member", name: "before", membership: { version: 1 } }, ["people"]);
    guarded.change({ id: "plain", name: "before", membership: null }, ["plain"]);
    guarded.seal();
    expect(guarded.change(before, ["new-detail"])).toMatchObject({ name: "pending" });
    const newer = { ...before, name: "server", version: 2 };
    expect(guarded.change(newer, ["list"])).toBe(newer);
    const newRow = { id: "arrived", name: "server", version: 1 };
    expect(guarded.change(newRow, ["list"])).toBe(newRow);
    const newerTime = { id: "time", name: "server", updatedAt: "new" };
    expect(guarded.change(newerTime, ["table"])).toBe(newerTime);
    expect(
      guarded.change({ id: "member", name: "server", membership: { version: 2 } }, ["people"]),
    ).toMatchObject({ name: "server" });
    expect(guarded.change({ id: "plain", name: "before" }, ["plain"])).toMatchObject({
      name: "pending",
    });
  });
  it.each(["membership", "myMembership", "myRegistration", "registration"])(
    "protects newer nested %s versions even when the outer version is unchanged",
    (field) => {
      const guarded = versionedCommunityChange<Record<string, unknown>>(
        (row) => ({ ...row, pending: true }),
        (row) => String(row.id),
      );
      const before = { id: "row", version: 1, [field]: { version: 1 } };
      guarded.change(before, ["first"]);
      guarded.change({ ...before, version: 4 }, ["second"]);
      guarded.seal();
      const fresh = { ...before, [field]: { version: 2 } };
      expect(guarded.change(fresh, ["first"])).toBe(fresh);
      expect(guarded.change({ ...before, version: 4 }, ["first"])).not.toHaveProperty("pending");
      expect(guarded.change({ ...before, version: 8 }, ["new-view"])).not.toHaveProperty("pending");
      expect(
        guarded.apply(before, ["first"], (row) => ({ ...row, acknowledged: true })),
      ).toHaveProperty("acknowledged", true);
    },
  );
  it("protects unversioned table timestamps while retaining selective rollback", () => {
    const before = { name: "before", updatedAt: "old" },
      optimistic = { ...before, name: "pending" };
    const fresh = { ...optimistic, updatedAt: "new", avatar: "server" };
    expect(restoreCommunityFields(fresh, before, optimistic)).toBe(fresh);
    expect(restoreCommunityFields(optimistic, before, optimistic)).toEqual(before);
    expect(
      restoreCommunityFields({ name: "pending", updatedAt: "server" }, before, {
        name: "pending",
        updatedAt: "optimistic",
      }),
    ).toEqual({ name: "before", updatedAt: "server" });
    expect(restoreCommunityFields({ name: "pending" }, before, { name: "pending" })).toEqual({
      name: "before",
    });
  });
  it("restores nested social changes while preserving unrelated social changes and newer entity versions", () => {
    const before = {
      social: { following: false, blocked: false },
      membership: { status: "ACCEPTED", version: 1 },
    };
    const optimistic = {
      social: { following: false, blocked: true },
      membership: { status: "LEFT", version: 1 },
    };
    const current = {
      social: { following: true, blocked: true },
      membership: { status: "LEFT", version: 2 },
    };
    expect(restoreCommunityFields(current, before, optimistic)).toEqual({
      social: { following: true, blocked: false },
      membership: { status: "LEFT", version: 2 },
    });
    expect(restoreCommunityFields({ value: [] }, { value: null }, { value: [] })).toEqual({
      value: null,
    });
    expect(restoreCommunityFields({ value: {} }, { value: null }, { value: {} })).toEqual({
      value: null,
    });
    expect(restoreCommunityFields({ value: {} }, { value: {} }, { value: null })).toEqual({
      value: {},
    });
    expect(
      restoreCommunityFields({ value: {} }, { value: { old: true } }, { value: { next: true } }),
    ).toEqual({ value: {} });
    expect(restoreCommunityFields({ version: 2 }, { version: 1 }, {})).toEqual({ version: 2 });
    expect(restoreCommunityFields({}, { version: 1 }, {})).toEqual({});
  });
  it("updates detail and every loaded page without changing cursors or other entities", () => {
    const change = (row: { id: string; name: string }) =>
      row.id === "one" ? { ...row, name: "next" } : row;
    expect(mapCommunityCache({ id: "one", name: "old" }, change)).toEqual({
      id: "one",
      name: "next",
    });
    const other = { id: "other", name: "keep" };
    const result = mapCommunityCache(
      {
        pages: [
          { items: [{ id: "one", name: "old" }, other], nextCursor: "cursor" },
          { items: [], nextCursor: null },
        ],
        pageParams: ["", "cursor"],
      },
      change,
    );
    expect(result).toEqual({
      pages: [
        { items: [{ id: "one", name: "next" }, other], nextCursor: "cursor" },
        { items: [], nextCursor: null },
      ],
      pageParams: ["", "cursor"],
    });
    expect(mapCommunityCache(undefined, change)).toBeUndefined();
    expect(mapCommunityCache("not-data", change)).toBe("not-data");
    expect(mapCommunityCache({ pages: null }, change)).toEqual({ pages: null });
  });
  it("restores only affected fields and preserves concurrent changes/refetched server truth", () => {
    const before = { name: "before", count: 2, version: 1 };
    const optimistic = { ...before, name: "pending" };
    expect(restoreCommunityFields({ ...optimistic, count: 3 }, before, optimistic)).toEqual({
      name: "before",
      count: 3,
      version: 1,
    });
    expect(
      restoreCommunityFields({ ...optimistic, name: "newer", version: 2 }, before, optimistic),
    ).toEqual({ name: "newer", count: 2, version: 2 });
  });
});
