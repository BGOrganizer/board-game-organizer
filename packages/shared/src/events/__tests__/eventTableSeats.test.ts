import { describe, expect, it } from "vitest";
import { eventTableSeats, type TableSeatUser } from "../eventTableSeats";

const first: TableSeatUser = { id: "booking-one", userId: "one", name: "One", avatarUrl: null };
const mine: TableSeatUser = { id: "booking-me", userId: "me", name: "Me", avatarUrl: null };
const seats = (
  users: TableSeatUser[],
  reservedCount: number,
  pin?: { userId: string; index: number },
  limit = 20,
  maxPlayers = 4,
) => eventTableSeats({ users, reservedCount, pin, limit, maxPlayers });

describe("anonymous event places", () => {
  it("shows participants, private reservations and remaining empty places without an implicit admin", () => {
    expect(seats([first], 2)).toEqual([
      { index: 0, user: first, reserved: true },
      { index: 1, user: undefined, reserved: true },
      { index: 2, user: undefined, reserved: false },
      { index: 3, user: undefined, reserved: false },
    ]);
    expect(seats([], 0).every((s) => !s.reserved && !s.user)).toBe(true);
    expect(seats([], 4).every((s) => s.reserved && !s.user)).toBe(true);
  });
  it("keeps the real user's pending booking in the clicked row, not a fabricated booking", () => {
    const result = seats([first, mine], 3, { userId: "me", index: 3 });
    expect(result[3]).toEqual({ index: 3, user: mine, reserved: true });
    expect(result[0].user).toBe(first);
    expect(result[1]).toEqual({ index: 1, user: undefined, reserved: true });
    expect(result[2].reserved).toBe(false);
    expect(seats([first, mine], 2, { userId: "me", index: 0 })[1].user).toBe(first);
  });
  it.each([-1, 4, 1.5, Number.NaN])("ignores invalid local pin %s", (index) => {
    expect(seats([first, mine], 2, { userId: "me", index })).toEqual(seats([first, mine], 2));
  });
  it("does not create an identity when the pinned user is absent", () => {
    expect(seats([first], 1, { userId: "missing", index: 2 })).toEqual(seats([first], 1));
  });
  it("deduplicates page overlaps and never marks known bookings empty when counts lag", () => {
    const latest = { ...first, name: "Updated" };
    expect(
      seats([first, latest, mine], 0)
        .filter((s) => s.user)
        .map((s) => s.user),
    ).toEqual([latest, mine]);
  });
  it("bounds rendering by the requested page, including zero and negative bounds", () => {
    expect(seats([], 0, undefined, 20, 100_000)).toHaveLength(20);
    expect(seats([], 0, undefined, 40, 23)).toHaveLength(23);
    expect(seats([], 0, undefined, 20, 0)).toEqual([]);
    expect(seats([], 0, undefined, -1, 4)).toEqual([]);
  });
});
