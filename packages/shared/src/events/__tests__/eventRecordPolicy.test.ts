import type { EventRecord, TableRecord, TableRegistration } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  banHasProtectedParticipation,
  eventDateWall,
  eventRecordCapabilities,
  eventRecordDay,
  eventRecordDisplayTimeZone,
  eventRecordPeriods,
  eventRecordPreviewDate,
  hasPublicTableConflict,
  plannedTableInterval,
  publicBookingIsClosed,
  recordIntervalsOverlap,
} from "../eventRecordPolicy";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const at = "2027-01-01T00:00:00Z";
const event: EventRecord = {
  id,
  groupId: id,
  adminUserId: "user_owner",
  name: "Club event",
  timeZone: "UTC",
  startTime: "09:00",
  endsAt: "2027-01-02T18:00:00.000Z",
  bookingClosesAt: "2027-01-01T08:00:00Z",
  dates: [{ id, day: "2027-01-02" }],
  locations: [
    {
      id,
      name: "Club venue",
      address: "Via Roma 1, Roma, Italia",
      longitude: 12.5,
      latitude: 41.9,
    },
  ],
  status: "PLANNING",
  version: 1,
  planningGeneration: 1,
  nextPriority: 0,
  nextTableOrder: 0,
  createdAt: at,
  updatedAt: at,
};
const table: TableRecord = {
  id,
  eventId: id,
  name: "First table",
  order: 0,
  minPlayers: 2,
  maxPlayers: 4,
  games: [
    { gameId: 1, durationMinutes: 30 },
    { gameId: 2, durationMinutes: 90 },
  ],
  rankingEnabled: true,
  startsAt: "2027-01-02T10:00:00.000Z",
  createdAt: at,
  updatedAt: at,
};
const registration: TableRegistration = {
  id,
  eventId: id,
  tableId: id,
  userId: "user_member",
  kind: "INVITATION",
  status: "ACCEPTED",
  priorityAt: at,
  sequence: 1,
  version: 1,
  gameVotes: {},
  createdAt: at,
  updatedAt: at,
};
const frozen: EventRecord = {
  ...event,
  status: "CONFIRMED",
  confirmed: { dateId: id, locationId: id, at },
};

describe("exact public cutoff and state rights", () => {
  it("blocks user actions AND administrator invitations at the exact cutoff", () => {
    const cutoff = Date.parse(event.bookingClosesAt as string);
    expect(publicBookingIsClosed(event, "PUBLIC", cutoff - 1)).toBe(false);
    expect(publicBookingIsClosed(event, "PUBLIC", cutoff)).toBe(true);
    expect(publicBookingIsClosed(event, "PUBLIC", cutoff + 1)).toBe(true);
    expect(publicBookingIsClosed({ ...event, bookingClosesAt: undefined }, "PUBLIC", cutoff)).toBe(
      true,
    );
    expect(publicBookingIsClosed({ ...event, bookingClosesAt: "bad" }, "PUBLIC", cutoff)).toBe(
      true,
    );
    expect(publicBookingIsClosed(event, "PRIVATE", cutoff)).toBe(false);
    expect(publicBookingIsClosed(event, null, cutoff)).toBe(false);
    const rights = eventRecordCapabilities(event, "PUBLIC", event.adminUserId, true, [], cutoff);
    expect(rights).toEqual({
      canEdit: false,
      canInvite: false,
      canRegister: false,
      canVote: false,
      canConfirm: true,
      canReplan: false,
      canFinalize: false,
    });
  });
  it("never lets a pending invitee vote and never gives the organizer an implicit playing seat", () => {
    const rights = (user: string, rows: TableRegistration[], member = true) =>
      eventRecordCapabilities(event, "PRIVATE", user, member, rows, Date.parse(at));
    expect(rights(event.adminUserId, []).canVote).toBe(false);
    expect(rights("user_member", [{ ...registration, status: "PENDING" }]).canVote).toBe(false);
    expect(rights("user_member", [registration]).canVote).toBe(true);
    expect(rights("user_other", [registration]).canVote).toBe(false);
    expect(rights("user_member", [registration], false).canRegister).toBe(false);
    expect(
      eventRecordCapabilities(event, null, "user_member", true, [registration], Date.parse(at))
        .canRegister,
    ).toBe(false);
    expect(
      eventRecordCapabilities(event, null, event.adminUserId, false, [], Date.parse(at))
        .canRegister,
    ).toBe(true);
  });
  it("keeps confirmation manual and finalization/return admin-only; TERMINATED is irreversible", () => {
    const before = Date.parse(at);
    expect(eventRecordCapabilities(frozen, "PUBLIC", event.adminUserId, true, [], before)).toEqual({
      canEdit: false,
      canInvite: false,
      canRegister: false,
      canVote: false,
      canConfirm: false,
      canReplan: true,
      canFinalize: true,
    });
    expect(
      eventRecordCapabilities(frozen, "PUBLIC", "user_member", true, [registration], before)
        .canReplan,
    ).toBe(false);
    expect(
      eventRecordCapabilities(
        { ...frozen, status: "TERMINATED" },
        "PUBLIC",
        event.adminUserId,
        true,
        [],
        before,
      ).canFinalize,
    ).toBe(false);
  });
});
it("previews proposed or chosen clocks without turning proposals into an agreed filtering date", () => {
  const second = { id: other, day: "2027-01-02", startTime: "16:45" };
  const proposed = { ...event, dates: [...event.dates, second] };
  expect(eventDateWall(proposed, proposed.dates[0])).toBe("2027-01-02T09:00");
  expect(eventDateWall(proposed, second)).toBe("2027-01-02T16:45");
  expect(eventRecordPreviewDate(proposed)).toEqual(event.dates[0]);
  expect(eventRecordDay(proposed, "PRIVATE")).toBeNull();
  const chosen = {
    ...proposed,
    status: "CONFIRMED" as const,
    confirmed: { dateId: other, locationId: id, at },
  };
  expect(eventRecordPreviewDate(chosen)).toEqual(second);
  expect(
    plannedTableInterval({ ...chosen, timeZone: "Europe/Rome" }, table, "PRIVATE", other).startsAt,
  ).toBe("2027-01-02T15:45:00.000Z");
  expect(eventRecordPreviewDate({ ...chosen, status: "PLANNING" })).toEqual(event.dates[0]);
  expect(eventRecordPreviewDate({ ...chosen, confirmed: undefined })).toEqual(event.dates[0]);
  expect(
    eventRecordPreviewDate({ ...chosen, confirmed: { ...chosen.confirmed, dateId: "missing" } }),
  ).toEqual(event.dates[0]);
  expect(eventRecordPreviewDate({ ...event, dates: [] })).toBeUndefined();
  expect(eventRecordDisplayTimeZone(event, "PRIVATE")).toBe("UTC");
  const multi = {
    ...event,
    locations: [
      ...event.locations,
      { ...event.locations[0], id: other, timeZone: "America/New_York" },
    ],
  };
  expect(eventRecordDisplayTimeZone(multi, "PRIVATE")).toBeNull();
  expect(eventRecordDisplayTimeZone(multi, "PUBLIC")).toBe("UTC");
  expect(eventRecordDisplayTimeZone({ ...multi, status: "CONFIRMED" }, "PRIVATE")).toBe("UTC");
});
describe("local day periods", () => {
  it("places unchosen dates in BOTH periods, independently of proposed dates", () => {
    expect(eventRecordDay(event, null)).toBeNull();
    expect(eventRecordDay(event, "PRIVATE")).toBeNull();
    expect(eventRecordPeriods(event, "PRIVATE", Date.parse("2030-01-01T12:00:00Z"))).toEqual([
      "past",
      "future",
    ]);
    expect(eventRecordDay({ ...frozen, confirmed: undefined }, "PRIVATE")).toBeNull();
    expect(
      eventRecordDay({ ...frozen, confirmed: { ...frozen.confirmed!, dateId: other } }, "PRIVATE"),
    ).toBeNull();
  });
  it("uses the chosen day, not event end time, with the stored time zone", () => {
    expect(eventRecordDay(event, "PUBLIC")).toBe("2027-01-02");
    expect(eventRecordDay(frozen, "PRIVATE")).toBe("2027-01-02");
    expect(eventRecordPeriods(frozen, "PRIVATE", Date.parse("2027-01-02T23:59:59Z"))).toEqual([
      "future",
    ]);
    expect(eventRecordPeriods(frozen, "PRIVATE", Date.parse("2027-01-03T00:00:00Z"))).toEqual([
      "past",
    ]);
    expect(
      eventRecordPeriods(
        { ...event, timeZone: "Europe/Rome" },
        "PUBLIC",
        Date.parse("2027-01-02T23:30:00Z"),
      ),
    ).toEqual(["past"]);
  });
});
describe("duration snapshots and public overlaps", () => {
  it("uses maximum candidate duration during planning, selected duration on confirmation", () => {
    expect(plannedTableInterval(event, table, "PUBLIC")).toEqual({
      startsAt: "2027-01-02T10:00:00.000Z",
      endsAt: "2027-01-02T11:30:00.000Z",
    });
    expect(plannedTableInterval(event, table, "PUBLIC", id, 1).endsAt).toBe(
      "2027-01-02T10:30:00.000Z",
    );
    expect(plannedTableInterval(event, { ...table, startsAt: undefined }, "PUBLIC").startsAt).toBe(
      "2027-01-02T09:00:00.000Z",
    );
    expect(
      plannedTableInterval(
        { ...event, dates: [...event.dates, { id: other, day: "2027-01-03" }] },
        table,
        "PRIVATE",
        other,
      ),
    ).toEqual({ startsAt: "2027-01-03T09:00:00.000Z" });
    expect(plannedTableInterval(event, table, null)).toEqual({
      startsAt: "2027-01-02T09:00:00.000Z",
    });
    expect(
      plannedTableInterval(
        { ...event, endsAt: "2027-01-03T03:00:00Z" },
        { ...table, startsAt: "2027-01-02T23:30:00Z" },
        "PUBLIC",
      ).endsAt,
    ).toBe("2027-01-03T01:00:00.000Z");
  });
  it("requires real/manual duration, valid bounds and a public event end", () => {
    expect(() =>
      plannedTableInterval(event, { ...table, games: [{ gameId: 1 }] }, "PUBLIC"),
    ).toThrow("TABLE_DURATION_REQUIRED");
    expect(() => plannedTableInterval(event, table, "PUBLIC", id, 99)).toThrow(
      "TABLE_DURATION_REQUIRED",
    );
    expect(() => plannedTableInterval({ ...event, endsAt: undefined }, table, "PUBLIC")).toThrow(
      "PUBLIC_EVENT_END_REQUIRED",
    );
    for (const changed of [
      { ...table, startsAt: "2027-01-02T08:00:00.000Z" },
      { ...table, startsAt: "2027-01-02T17:30:00.000Z" },
    ])
      expect(() => plannedTableInterval(event, changed, "PUBLIC")).toThrow("TABLE_OUTSIDE_EVENT");
    expect(() =>
      plannedTableInterval({ ...event, endsAt: "2027-01-02T08:00:00.000Z" }, table, "PUBLIC"),
    ).toThrow("TABLE_OUTSIDE_EVENT");
    expect(() =>
      plannedTableInterval(
        {
          ...event,
          dates: [{ id, day: "2027-03-28" }],
          startTime: "02:30",
          timeZone: "Europe/Rome",
        },
        table,
        null,
      ),
    ).toThrow();
  });
  it("allows adjacent intervals and fails closed for missing ends", () => {
    const first = { startsAt: "2027-01-02T10:00:00Z", endsAt: "2027-01-02T11:00:00Z" };
    expect(
      recordIntervalsOverlap(first, { startsAt: first.endsAt, endsAt: "2027-01-02T12:00:00Z" }),
    ).toBe(false);
    expect(recordIntervalsOverlap(first, first)).toBe(true);
    expect(recordIntervalsOverlap({ startsAt: first.startsAt }, first)).toBe(true);
    expect(recordIntervalsOverlap(first, { startsAt: first.startsAt })).toBe(true);
    expect(
      recordIntervalsOverlap(
        { startsAt: "2027-01-02T12:00:00Z", endsAt: "2027-01-02T13:00:00Z" },
        first,
      ),
    ).toBe(false);
  });
  it("includes pending/waiting reservations and NON-playing demonstrator duties, not same-table dual roles", () => {
    const second: TableRecord = { ...table, id: other, startsAt: "2027-01-02T11:00:00.000Z" };
    expect(hasPublicTableConflict(event, [table], [registration], table, registration.userId)).toBe(
      false,
    );
    for (const status of ["PENDING", "ACCEPTED"] as const)
      expect(
        hasPublicTableConflict(
          event,
          [table, second],
          [{ ...registration, tableId: other, status }],
          table,
          registration.userId,
        ),
      ).toBe(true);
    for (const status of ["CANCELLED", "DECLINED"] as const)
      expect(
        hasPublicTableConflict(
          event,
          [table, second],
          [{ ...registration, tableId: other, status }],
          table,
          registration.userId,
        ),
      ).toBe(false);
    expect(
      hasPublicTableConflict(
        event,
        [table, { ...second, demonstratorUserId: registration.userId }],
        [],
        table,
        registration.userId,
      ),
    ).toBe(true);
    expect(
      hasPublicTableConflict(
        event,
        [
          table,
          {
            ...second,
            startsAt: "2027-01-02T11:30:00.000Z",
            demonstratorUserId: registration.userId,
          },
        ],
        [],
        table,
        registration.userId,
      ),
    ).toBe(false);
    expect(
      hasPublicTableConflict(
        event,
        [table, second],
        [{ ...registration, tableId: other, userId: "user_other" }],
        table,
        registration.userId,
      ),
    ).toBe(false);
  });
});
it("refuses a ban ONLY for that target's protected CONFIRMED public participation", () => {
  const roster = {
    ...table,
    confirmed: {
      gameId: 1,
      playerIds: ["user_target", "user_other"],
      startsAt: "2027-01-02T10:00:00Z",
    },
  };
  const cutoff = Date.parse(event.bookingClosesAt as string);
  expect(banHasProtectedParticipation("PUBLIC", [frozen], [roster], "user_target", cutoff)).toBe(
    true,
  );
  expect(
    banHasProtectedParticipation("PUBLIC", [frozen], [roster], "user_target", cutoff - 1),
  ).toBe(false);
  expect(banHasProtectedParticipation("PUBLIC", [frozen], [roster], "user_outsider", cutoff)).toBe(
    false,
  );
  expect(banHasProtectedParticipation("PRIVATE", [frozen], [roster], "user_target", cutoff)).toBe(
    false,
  );
  expect(banHasProtectedParticipation("PUBLIC", [event], [roster], "user_target", cutoff)).toBe(
    false,
  );
  expect(
    banHasProtectedParticipation(
      "PUBLIC",
      [{ ...frozen, status: "TERMINATED" }],
      [roster],
      "user_target",
      cutoff,
    ),
  ).toBe(false);
  expect(banHasProtectedParticipation("PUBLIC", [frozen], [table], "user_target", cutoff)).toBe(
    false,
  );
  expect(
    banHasProtectedParticipation(
      "PUBLIC",
      [frozen],
      [{ ...roster, demonstratorUserId: "user_demo" }],
      "user_demo",
      cutoff,
    ),
  ).toBe(true);
  expect(
    banHasProtectedParticipation(
      "PUBLIC",
      [frozen],
      [{ ...roster, eventId: other }],
      "user_target",
      cutoff,
    ),
  ).toBe(false);
});
