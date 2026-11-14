import { describe, expect, it } from "vitest";
import {
  moveSeatOrder,
  normalizeSeatOrder,
  seatOrderPlaces,
  sendSeatToWaiting,
} from "../tableSeatOrderDraft";

const row = (id: string, seatIndex: number | null, locked = false) => ({ id, seatIndex, locked });
const positions = (rows: ReturnType<typeof row>[] | null) =>
  rows?.map(({ id, seatIndex }) => [id, seatIndex]);

describe("sparse seat-order draft", () => {
  it("normalizes legacy snapshots once and preserves explicit holes and queue order", () => {
    expect(normalizeSeatOrder([{ id: "a" }, { id: "b" }, { id: "c" }], 2)).toEqual([
      { id: "a", seatIndex: 0 },
      { id: "b", seatIndex: 1 },
      { id: "c", seatIndex: null },
    ]);
    expect(
      positions(normalizeSeatOrder([row("q", null), row("d", 3), row("b", 1), row("q2", null)], 4)),
    ).toEqual([
      ["b", 1],
      ["d", 3],
      ["q", null],
      ["q2", null],
    ]);
  });
  it("swaps across anchored places in both directions without moving the anchor", () => {
    const rows = [row("a", 0), row("b", 1, true), row("c", 2)];
    for (const [index, delta] of [
      [0, 1],
      [2, -1],
    ])
      expect(positions(moveSeatOrder(rows, index, delta, 3))).toEqual([
        ["c", 0],
        ["b", 1],
        ["a", 2],
      ]);
    expect(rows[0].seatIndex).toBe(0);
    expect(moveSeatOrder(rows, 1, 1, 3)).toBeNull();
  });
  it("moves into adjacent empty places while retaining all other physical indices", () => {
    expect(positions(moveSeatOrder([row("a", 0), row("c", 2)], 1, -1, 4))).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
    expect(positions(moveSeatOrder([row("a", 0), row("c", 2)], 0, 1, 4))).toEqual([
      ["a", 1],
      ["c", 2],
    ]);
    expect(moveSeatOrder([row("a", 0)], 0, -1, 4)).toBeNull();
  });
  it("can demote any unlocked seat into an empty queue and preserves later anchors", () => {
    const rows = [row("a", 0), row("d", 3, true)];
    expect(positions(sendSeatToWaiting(rows, 0))).toEqual([
      ["d", 3],
      ["a", null],
    ]);
    expect(sendSeatToWaiting(rows, 1)).toBeNull();
    expect(sendSeatToWaiting(rows, 5)).toBeNull();
    expect(sendSeatToWaiting([row("q", null)], 0)).toBeNull();
    expect(positions(sendSeatToWaiting([row("a", 0), row("q", null)], 0))).toEqual([
      ["a", null],
      ["q", null],
    ]);
  });
  it("down beyond the last movable physical place reaches the queue even if empty", () => {
    expect(positions(moveSeatOrder([row("a", 0)], 0, 1, 1))).toEqual([["a", null]]);
    expect(positions(moveSeatOrder([row("a", 0), row("b", 1, true)], 0, 1, 2))).toEqual([
      ["b", 1],
      ["a", null],
    ]);
  });
  it("promotes the first waiting person into the first opening, not a compacted count", () => {
    expect(positions(moveSeatOrder([row("b", 1, true), row("q", null)], 1, -1, 4))).toEqual([
      ["q", 0],
      ["b", 1],
    ]);
    expect(positions(moveSeatOrder([row("q", null)], 0, -1, 4))).toEqual([["q", 0]]);
    expect(positions(moveSeatOrder([row("a", 0), row("b", 1), row("q", null)], 2, -1, 4))).toEqual([
      ["a", 0],
      ["b", 1],
      ["q", 2],
    ]);
  });
  it("a full table swaps the first waiting person with its last unlocked seated person", () => {
    expect(
      positions(moveSeatOrder([row("a", 0), row("b", 1, true), row("q", null)], 2, -1, 2)),
    ).toEqual([
      ["q", 0],
      ["b", 1],
      ["a", null],
    ]);
    expect(positions(moveSeatOrder([row("a", 0), row("q", null)], 1, -1, 1))).toEqual([
      ["q", 0],
      ["a", null],
    ]);
    expect(moveSeatOrder([row("a", 0, true), row("q", null)], 1, -1, 1)).toBeNull();
    expect(moveSeatOrder([row("q", null)], 0, -1, 0)).toBeNull();
  });
  it("reorders within the queue and rejects boundaries or an invalid locked queue", () => {
    const rows = [row("a", 0), row("q", null), row("r", null)];
    expect(positions(moveSeatOrder(rows, 1, 1, 2))).toEqual([
      ["a", 0],
      ["r", null],
      ["q", null],
    ]);
    expect(positions(moveSeatOrder(rows, 2, -1, 2))).toEqual([
      ["a", 0],
      ["r", null],
      ["q", null],
    ]);
    expect(moveSeatOrder(rows, 2, 1, 2)).toBeNull();
    expect(moveSeatOrder([row("q", null), row("r", null, true)], 0, 1, 2)).toBeNull();
    expect(moveSeatOrder(rows, -1, 1, 2)).toBeNull();
    expect(moveSeatOrder(rows, 0, 0, 2)).toBeNull();
    expect(moveSeatOrder(rows, 0, 2, 2)).toBeNull();
  });
  it("keeps invitation consent and extra profile fields untouched through moves", () => {
    const rows = [
      { ...row("pending", 0), status: "PENDING" },
      { ...row("accepted", 1), status: "ACCEPTED" },
    ];
    expect(moveSeatOrder(rows, 0, 1, 2)?.find((r) => r.id === "pending")).toMatchObject({
      status: "PENDING",
      seatIndex: 1,
    });
    expect(sendSeatToWaiting(rows, 0)?.find((r) => r.id === "pending")).toMatchObject({
      status: "PENDING",
      seatIndex: null,
    });
  });
  it("renders bounded empty ranges, including a physically large table and an empty roster", () => {
    const rows = [row("a", 1), row("d", 999999, true), row("q", null)];
    const view = seatOrderPlaces(rows, 1000000);
    expect(view.seated.map((p) => (p.kind === "empty" ? [p.first, p.last] : p.row.id))).toEqual([
      [0, 0],
      "a",
      [2, 999998],
      "d",
    ]);
    expect(view.waiting).toEqual([{ kind: "player", key: "q", row: rows[2], index: 2 }]);
    expect(seatOrderPlaces([], 0)).toEqual({ seated: [], waiting: [] });
    expect(seatOrderPlaces([], 4).seated).toEqual([
      { kind: "empty", key: "empty:0", first: 0, last: 3 },
    ]);
    expect(seatOrderPlaces([row("a", 0)], 3).seated.at(-1)).toEqual({
      kind: "empty",
      key: "empty:1",
      first: 1,
      last: 2,
    });
  });
});
