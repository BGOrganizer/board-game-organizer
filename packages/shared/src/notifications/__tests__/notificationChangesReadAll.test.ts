import type { NotificationChangeRow, NotificationChangesPage } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { readNotificationChangesSnapshot } from "../notificationChangesReadAll";

const asOf = "2026-01-01T00:00:00.000Z";
function page(ids: string[], nextCursor: string | null = null): NotificationChangesPage {
  return {
    asOf,
    nextCursor,
    tabCounts: { details: ids.length, members: 0, tables: 0, participants: 0 },
    changes: ids.map((notificationId) => {
      const reference = { notificationId, effectiveAt: asOf };
      return {
        ...reference,
        messageCode: "information",
        requiresResponse: notificationId === "invitation",
        readReference: reference,
      } as NotificationChangeRow;
    }),
  };
}
describe("read the captured complete notification resource", () => {
  it("reads unloaded pages sequentially with one cutoff and excludes pending decisions", async () => {
    const first = page(["one", "invitation"], "second");
    const load = vi.fn(async () => page(["two"]));
    const read = vi.fn(async () => {});
    await readNotificationChangesSnapshot(first, load, read, () => true);
    expect(load).toHaveBeenCalledWith("second");
    expect(read.mock.calls).toEqual([
      [asOf, [first.changes[0].readReference]],
      [asOf, [page(["two"]).changes[0].readReference]],
    ]);
  });
  it("has no informational write for empty or invitation-only pages", async () => {
    const read = vi.fn();
    await readNotificationChangesSnapshot(page(["invitation"]), vi.fn(), read, () => true);
    expect(read).not.toHaveBeenCalled();
  });
  it("never dispatches for an old owner and stops before loading once ownership changes", async () => {
    const load = vi.fn(),
      read = vi.fn();
    await readNotificationChangesSnapshot(page(["one"]), load, read, () => false);
    expect(read).not.toHaveBeenCalled();
    let current = true;
    read.mockImplementation(async () => {
      current = false;
    });
    await readNotificationChangesSnapshot(page(["one"], "second"), load, read, () => current);
    expect(load).not.toHaveBeenCalled();
  });
  it("preserves observable page, snapshot-contract and mutation failures", async () => {
    const first = page(["one"], "next");
    const fail = vi.fn(async () => {
      throw Error("offline");
    });
    await expect(readNotificationChangesSnapshot(first, fail, vi.fn(), () => true)).rejects.toThrow(
      "offline",
    );
    await expect(
      readNotificationChangesSnapshot(
        first,
        async () => ({ ...page([]), asOf: "2026-01-02T00:00:00.000Z" }),
        vi.fn(),
        () => true,
      ),
    ).rejects.toThrow("Notification snapshot changed");
    await expect(readNotificationChangesSnapshot(first, vi.fn(), fail, () => true)).rejects.toThrow(
      "offline",
    );
  });
});
