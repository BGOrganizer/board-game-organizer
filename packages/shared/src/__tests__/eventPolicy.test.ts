import type {
  Event,
  EventBooking,
  EventTable,
  SaveEventInput,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  canModifyEvent,
  confirmedEventPlayers,
  defaultEventBookingClosesAt,
  eventBookingReservesSeat,
  eventIntervalsOverlap,
  eventScheduleChanged,
  eventTableChanged,
  hasConflictingEventBooking,
  normalizeOrganizationName,
} from "../eventPolicy";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const now = "2027-04-01T08:00:00Z";
const event: Event = {
  id,
  organizationId: otherId,
  adminUserId: "user_owner",
  name: "Sunday event",
  timeZone: "Europe/Rome",
  startsAt: "2027-04-11T08:00:00Z",
  endsAt: "2027-04-11T18:00:00Z",
  bookingClosesAt: "2027-04-10T08:00:00Z",
  location: {
    id,
    name: "Club venue",
    address: "Via Roma 1, Roma, Italia",
    longitude: 12.5,
    latitude: 41.9,
  },
  status: "PUBLISHED",
  version: 1,
  createdAt: now,
  updatedAt: now,
};
const table: EventTable = {
  id,
  eventId: id,
  name: "First table",
  startsAt: "2027-04-11T09:00:00Z",
  endsAt: "2027-04-11T11:00:00Z",
  minPlayers: 2,
  maxPlayers: 6,
  gameId: 1,
  openSkill: false,
  status: "PLANNING",
  createdAt: now,
  updatedAt: now,
};
const otherTable: EventTable = {
  ...table,
  id: otherId,
  startsAt: "2027-04-11T10:00:00Z",
  endsAt: "2027-04-11T12:00:00Z",
};
const booking: EventBooking = {
  id,
  eventId: id,
  tableId: otherId,
  userId: "user_player",
  kind: "INVITATION",
  status: "PENDING",
  createdAt: now,
  updatedAt: now,
};
const next: SaveEventInput = { ...event, status: "PUBLISHED", tables: [table] };

describe("organization names", () => {
  it("reserves case/spacing/Unicode-equivalent names identically", () => {
    expect(normalizeOrganizationName("  BOARD\t\n CLUB  ")).toBe("board club");
    expect(normalizeOrganizationName("Ｂｏａｒｄ Club")).toBe("board club");
    expect(normalizeOrganizationName("Caffe\u0301 Club")).toBe(
      normalizeOrganizationName("Caffé Club"),
    );
  });
});

describe("event closure", () => {
  it("defaults to exactly 24 hours, independent of DST and input offset", () => {
    expect(defaultEventBookingClosesAt(event.startsAt)).toBe(
      event.bookingClosesAt.replace("Z", ".000Z"),
    );
    expect(defaultEventBookingClosesAt("2027-10-31T03:00:00+01:00")).toBe(
      "2027-10-30T02:00:00.000Z",
    );
    expect(() => defaultEventBookingClosesAt("invalid")).toThrow(RangeError);
  });
  it("freezes published state at the exact deadline, even before worker execution", () => {
    const deadline = Date.parse(event.bookingClosesAt);
    expect(canModifyEvent(event, deadline - 1)).toBe(true);
    expect(canModifyEvent(event, deadline)).toBe(false);
    expect(canModifyEvent(event, deadline + 1)).toBe(false);
    expect(canModifyEvent({ ...event, closedAt: event.bookingClosesAt }, deadline - 1)).toBe(false);
    expect(canModifyEvent({ ...event, status: "CANCELLED" }, deadline - 1)).toBe(false);
    expect(canModifyEvent({ ...event, status: "DRAFT" }, deadline - 1)).toBe(true);
    expect(canModifyEvent({ ...event, status: "DRAFT" }, deadline)).toBe(false);
    expect(canModifyEvent({ ...event, status: "DRAFT" }, deadline + 1)).toBe(false);
  });
  it("counts confirmed bookings only: no implicit owner or demonstrator seats", () => {
    expect(
      confirmedEventPlayers([
        booking,
        { ...booking, userId: "user_second", status: "CONFIRMED" },
        { ...booking, userId: "user_third", status: "DECLINED" },
        { ...booking, userId: "user_fourth", status: "CANCELLED" },
      ]),
    ).toEqual(["user_second"]);
    expect(confirmedEventPlayers([])).toEqual([]);
    expect(eventBookingReservesSeat(booking)).toBe(true);
    expect(eventBookingReservesSeat({ status: "CONFIRMED" })).toBe(true);
    expect(eventBookingReservesSeat({ status: "DECLINED" })).toBe(false);
    expect(eventBookingReservesSeat({ status: "CANCELLED" })).toBe(false);
  });
});

describe("overlapping bookings", () => {
  it("rejects any overlap but allows adjacent intervals and distinct dates", () => {
    expect(eventIntervalsOverlap(table, otherTable)).toBe(true);
    expect(eventIntervalsOverlap(otherTable, table)).toBe(true);
    expect(eventIntervalsOverlap(table, { ...table })).toBe(true);
    expect(eventIntervalsOverlap(table, { ...otherTable, startsAt: table.endsAt })).toBe(false);
    expect(eventIntervalsOverlap({ ...otherTable, startsAt: table.endsAt }, table)).toBe(false);
    expect(
      eventIntervalsOverlap(table, {
        ...otherTable,
        startsAt: "2027-04-12T09:00:00Z",
        endsAt: "2027-04-12T11:00:00Z",
      }),
    ).toBe(false);
  });
  it("reserves pending invitations/requests as well as confirmed participation", () => {
    for (const kind of ["INVITATION", "REQUEST"] as const) {
      for (const status of ["PENDING", "CONFIRMED"] as const) {
        expect(
          hasConflictingEventBooking(
            table,
            booking.userId,
            [{ ...booking, kind, status }],
            [table, otherTable],
          ),
        ).toBe(true);
      }
    }
  });
  it("ignores released/foreign reservations but fails closed for a missing reserved table", () => {
    for (const changed of [
      { ...booking, userId: "user_other" },
      { ...booking, eventId: otherId },
      { ...booking, tableId: table.id },
      { ...booking, status: "DECLINED" as const },
      { ...booking, status: "CANCELLED" as const },
    ])
      expect(
        hasConflictingEventBooking(table, booking.userId, [changed], [table, otherTable]),
      ).toBe(false);
    expect(hasConflictingEventBooking(table, booking.userId, [booking], [table])).toBe(true);
    expect(
      hasConflictingEventBooking(
        table,
        booking.userId,
        [booking],
        [table, { ...otherTable, status: "CANCELLED" }],
      ),
    ).toBe(false);
    expect(
      hasConflictingEventBooking(
        table,
        booking.userId,
        [booking],
        [table, { ...otherTable, startsAt: table.endsAt }],
      ),
    ).toBe(false);
    expect(hasConflictingEventBooking(table, booking.userId, [], [table, otherTable])).toBe(false);
  });
});

describe("destructive edit matrix", () => {
  it("preserves bookings on event title/deadline and display-only venue identity changes", () => {
    expect(eventScheduleChanged(event, next)).toBe(false);
    expect(eventScheduleChanged(event, { ...next, name: "Renamed event" })).toBe(false);
    expect(eventScheduleChanged(event, { ...next, bookingClosesAt: "2027-04-09T08:00:00Z" })).toBe(
      false,
    );
    expect(
      eventScheduleChanged(event, {
        ...next,
        location: { ...next.location, id: otherId, name: "New venue label" },
      }),
    ).toBe(false);
    expect(eventScheduleChanged(event, { ...next, startsAt: "2027-04-11T10:00:00+02:00" })).toBe(
      false,
    );
  });
  it("resets participation for any date/time/time-zone/canonical-location change", () => {
    for (const changed of [
      { ...next, startsAt: "2027-04-11T08:01:00Z" },
      { ...next, endsAt: "2027-04-11T18:01:00Z" },
      { ...next, timeZone: "UTC" },
      { ...next, location: { ...next.location, address: "Via Roma 2, Roma, Italia" } },
      { ...next, location: { ...next.location, longitude: 12.6 } },
      { ...next, location: { ...next.location, latitude: 42 } },
    ])
      expect(eventScheduleChanged(event, changed)).toBe(true);
  });
  it("resets a table for every editable field, not transient/internal fields", () => {
    expect(eventTableChanged(table, table)).toBe(false);
    expect(eventTableChanged(table, { ...table, startsAt: "2027-04-11T11:00:00+02:00" })).toBe(
      false,
    );
    for (const changed of [
      { ...table, startsAt: "2027-04-11T09:01:00Z" },
      { ...table, endsAt: "2027-04-11T11:01:00Z" },
      { ...table, name: "Renamed table" },
      { ...table, minPlayers: 3 },
      { ...table, maxPlayers: 7 },
      { ...table, gameId: 2 },
      { ...table, demonstratorUserId: "user_demo" },
      { ...table, openSkill: true },
    ])
      expect(eventTableChanged(table, changed)).toBe(true);
    expect(eventTableChanged({ ...table, demonstratorUserId: "user_demo" }, table)).toBe(true);
  });
});
