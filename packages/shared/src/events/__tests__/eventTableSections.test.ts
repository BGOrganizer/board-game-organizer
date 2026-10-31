import type { TableSeatResponse } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import type { PendingTablePlace } from "../eventTablePending";
import type { EventTablePlace } from "../eventTableRoster";
import { eventTableSections } from "../eventTableSections";

const player = (position: TableSeatResponse["position"]): EventTablePlace => ({
  key: position,
  kind: "player",
  user: { id: position, position } as TableSeatResponse,
});
it("places the queue after primary reservations while preserving actual positions/order and unassigned local intent", () => {
  const waiting = player("WAITING"),
    seated = player("SEATED"),
    frozen = player("FROZEN");
  const reserved: EventTablePlace = { key: "reserved", kind: "reserved", queue: true };
  const queue: EventTablePlace = { key: "queue", kind: "empty", queue: true };
  const free: EventTablePlace = { key: "free", kind: "empty", queue: false };
  const saving: PendingTablePlace = {
    key: "saving",
    kind: "pending",
    userId: "known",
    name: "Known",
    avatarUrl: null,
  };
  const input = [waiting, reserved, saving, seated, queue, free, frozen];
  const result = eventTableSections(input, true);
  expect(result.seats).toEqual([reserved, saving, seated, free, frozen]);
  expect(result.waiting).toEqual([waiting, queue]);
  expect(waiting.kind === "player" && waiting.user.position).toBe("WAITING");
  expect(input[0]).toBe(waiting);
});
it("does not expose a waiting section before canonical capacity is exhausted", () => {
  const rows: EventTablePlace[] = [player("WAITING"), { key: "free", kind: "empty", queue: false }];
  expect(eventTableSections(rows, false)).toEqual({ seats: rows, waiting: [] });
  expect(eventTableSections([], true)).toEqual({ seats: [], waiting: [] });
});
