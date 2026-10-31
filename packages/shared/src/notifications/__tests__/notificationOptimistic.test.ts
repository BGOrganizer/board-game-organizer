import { describe, expect, it } from "vitest";
import { optimisticNotificationData } from "../notificationOptimistic";

const at = "2030-01-01T00:00:00.000Z";
const page = (notifications: Array<{ id: string; readAt: string | null }>, unreadCount = 4) => ({
  pages: [
    { notifications, unreadCount, nextCursor: "next" },
    { notifications: [], unreadCount, nextCursor: null },
  ],
  pageParams: ["", "next"],
});
const data = page([
  { id: "one", readAt: null },
  { id: "two", readAt: at },
]);
const apply = (
  action: "read" | "delete",
  id: string | undefined,
  known = false,
  input: unknown = data,
) => optimisticNotificationData(input, action, id, "pending-time", known) as typeof data;

describe("notification operation projection", () => {
  it("marks one existing notification and its counter across pages without changing cursors", () => {
    const result = apply("read", "one");
    expect(result.pages.map((row) => row.unreadCount)).toEqual([3, 3]);
    expect(result.pages[0].notifications).toEqual([
      { id: "one", readAt: "pending-time" },
      { id: "two", readAt: at },
    ]);
    expect(result.pageParams).toEqual(data.pageParams);
    expect(result.pages[0].nextCursor).toBe("next");
    expect(data.pages[0].notifications[0].readAt).toBeNull();
    expect(apply("read", "two", true).pages[0].unreadCount).toBe(4);
  });
  it("updates cached bell/locale counters when the target is known from another inbox", () => {
    expect(apply("read", "unloaded", true).pages[0].unreadCount).toBe(3);
    expect(apply("read", "unloaded").pages[0].unreadCount).toBe(4);
  });
  it("removes only its target and decrements only an unread notification", () => {
    expect(apply("delete", "one").pages[0]).toMatchObject({
      unreadCount: 3,
      notifications: [{ id: "two" }],
    });
    expect(apply("delete", "two").pages[0]).toMatchObject({
      unreadCount: 4,
      notifications: [{ id: "one" }],
    });
    expect(apply("delete", "unknown").pages[0].notifications).toEqual(data.pages[0].notifications);
    // Another committed operation already removed a once-loaded target: do not
    // decrement an unrelated notification's counter a second time.
    expect(
      (optimisticNotificationData(page([]), "delete", "one", at, true, true) as typeof data)
        .pages[0].unreadCount,
    ).toBe(4);
  });
  it("clears every loaded page, count and cursor without changing the source snapshot", () => {
    const source = {
      pages: [
        { notifications: [{ id: "one", readAt: null }], unreadCount: 7, nextCursor: "one" },
        { notifications: [{ id: "two", readAt: at }], unreadCount: 7, nextCursor: "two" },
      ],
      pageParams: ["", "one"],
    };
    const result = apply("delete", undefined, false, source);
    expect(result.pages).toEqual([
      { notifications: [], unreadCount: 0, nextCursor: null },
      { notifications: [], unreadCount: 0, nextCursor: null },
    ]);
    expect(result.pageParams).toBe(source.pageParams);
    expect(source.pages[0].notifications).toHaveLength(1);
    expect(source.pages[0].nextCursor).toBe("one");
    expect(optimisticNotificationData(undefined, "delete", undefined, at, false)).toBeUndefined();
  });
  it("marks all loaded rows while preserving existing read timestamps", () => {
    const result = apply("read", undefined);
    expect(result.pages.map((row) => row.unreadCount)).toEqual([0, 0]);
    expect(result.pages[0].notifications).toEqual([
      { id: "one", readAt: "pending-time" },
      { id: "two", readAt: at },
    ]);
  });
  it("does not create missing inbox data or negative counts", () => {
    expect(optimisticNotificationData(undefined, "read", "one", at, false)).toBeUndefined();
    expect(apply("delete", "unloaded", true, page([], 0)).pages[0].unreadCount).toBe(0);
  });
});
