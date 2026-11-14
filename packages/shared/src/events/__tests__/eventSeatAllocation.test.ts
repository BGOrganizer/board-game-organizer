import { expect, it } from "vitest";
import type { AgreementRegistration } from "../eventAgreement";
import {
  allocateReservedPlaces,
  reservationPriority,
  reservedSeatIndex,
} from "../eventSeatAllocation";

const row = (id: string, seatIndex?: number | null, locked = false): AgreementRegistration => ({
  id,
  userId: id,
  tableId: "table",
  status: "ACCEPTED",
  priorityAt: "2030-01-01T00:00:00Z",
  sequence: id.charCodeAt(0),
  ...(seatIndex === undefined ? {} : { seatIndex }),
  locked,
});
it("keeps legacy priority allocation and resolves its ordinal without rewriting stored rows", () => {
  const a = row("a"),
    b = row("b");
  expect(allocateReservedPlaces([b, a], 1)).toEqual({ seated: [a], waiting: [b] });
  expect(reservedSeatIndex([a], "a")).toBe(0);
  expect(reservedSeatIndex([a], "missing")).toBeNull();
  expect(reservedSeatIndex([row("a", 3)], "a")).toBe(3);
  expect(reservationPriority(a, { ...b, priorityAt: "2031-01-01T00:00:00Z" })).toBeLessThan(0);
  expect(reservationPriority({ ...a, sequence: 0 }, { ...b, sequence: 0 })).toBeLessThan(0);
});
it("preserves holes and a locked last slot, including when everyone else is queued", () => {
  const a = row("a", null),
    b = row("b", 3, true);
  expect(allocateReservedPlaces([b, a], 4)).toEqual({ seated: [b], waiting: [a] });
  const mixed = allocateReservedPlaces([row("c"), b, a], 4);
  expect(mixed.seated.map((person) => [person.id, person.seatIndex])).toEqual([
    ["c", 0],
    ["b", 3],
  ]);
  expect(mixed.waiting).toEqual([a]);
});
it("Assisted compacts only unlocked people and fills vacancies in queue priority", () => {
  const result = allocateReservedPlaces([row("c", null), row("b", 3, true), row("a", 2)], 4, false);
  expect(result.seated.map((person) => [person.id, person.seatIndex])).toEqual([
    ["a", 0],
    ["c", 1],
    ["b", 3],
  ]);
  expect(
    allocateReservedPlaces([row("a", 0), row("b", 1), row("c", null)], 2, false).waiting,
  ).toEqual([row("c", null)]);
});
it("rejects duplicate/out-of-capacity explicit seats and never allocates a capacity-sized array", () => {
  expect(() => allocateReservedPlaces([row("a", 0), row("b", 0)], 2)).toThrow();
  expect(() => allocateReservedPlaces([row("a", 2)], 2)).toThrow();
  expect(allocateReservedPlaces([row("a", 999999999, true)], 1000000000).seated).toHaveLength(1);
});
