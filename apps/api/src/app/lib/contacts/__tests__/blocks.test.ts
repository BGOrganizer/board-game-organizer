import { describe, expect, it, vi } from "vitest";
import { COLLECTIONS } from "@/app/lib/db";
import {
  filterBlockedByMe,
  getBlockContext,
  getBlockedByUserIds,
  getBlockedUserIds,
} from "../blocks";

describe("blocks helper", () => {
  function fakeCol(rows: unknown[]) {
    return { find: vi.fn(() => ({ toArray: async () => rows })) };
  }

  it("getBlockedUserIds returns users the viewer blocked", async () => {
    const db = { collection: vi.fn(() => fakeCol([{ toUserId: "b" }, { toUserId: "c" }])) };
    const ids = await getBlockedUserIds(db as never, "me");
    expect(ids).toEqual(["b", "c"]);
    expect(db.collection).toHaveBeenCalledWith(COLLECTIONS.BLOCKS);
  });

  it("getBlockedByUserIds returns users who blocked the viewer", async () => {
    const db = { collection: vi.fn(() => fakeCol([{ fromUserId: "a" }])) };
    const ids = await getBlockedByUserIds(db as never, "me");
    expect(ids).toEqual(["a"]);
  });

  it("filterBlockedByMe removes blocked ids, keeps the rest", () => {
    const blocked = new Set(["b"]);
    expect(filterBlockedByMe(["a", "b", "c"], blocked)).toEqual(["a", "c"]);
  });

  it("getBlockContext returns both sets", async () => {
    const db = {
      collection: vi.fn((name: string) =>
        name === COLLECTIONS.BLOCKS
          ? fakeCol([{ toUserId: "x" }, { fromUserId: "y" }])
          : fakeCol([]),
      ),
    };
    const ctx = await getBlockContext(db as never, "me");
    expect(ctx.blockedByMe.has("x")).toBe(true);
    expect(ctx.blockedMe.has("y")).toBe(true);
  });
});
