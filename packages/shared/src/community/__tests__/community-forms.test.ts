import type {
  EventResponse,
  EventTableResponse,
  MatchDetailResponse,
  MatchResponse,
  SaveEventInput,
} from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  editableEventTable,
  eventEditResets,
  eventLocalDateTime,
  eventLocalToIso,
} from "../../events/eventForm";
import { matchCardData } from "../../matches/matchCard";
import { canRegisterMatchResults, matchParticipants } from "../../matches/matchParticipants";

const location = {
  id: "address",
  name: "Game club",
  address: "Verified address",
  longitude: 12,
  latitude: 45,
};
const event = {
  id: "event",
  name: "Games evening",
  startsAt: "2030-03-04T18:00:00.000Z",
  endsAt: "2030-03-04T23:00:00.000Z",
  bookingClosesAt: "2030-03-03T18:00:00.000Z",
  timeZone: "Europe/Rome",
  location,
} as EventResponse;
const table = {
  id: "table",
  name: "Table one",
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  gameId: 1,
  minPlayers: 2,
  maxPlayers: 4,
  openSkill: false,
} as EventTableResponse;
const input = { ...event, status: "PUBLISHED", tables: [] } as SaveEventInput;
describe("event form instants and destructive edits", () => {
  it("converts wall time without using the browser time zone and preserves repeated DST instants", () => {
    expect(eventLocalDateTime(event.startsAt, "Europe/Rome")).toBe("2030-03-04T19:00:00");
    expect(eventLocalToIso("2030-03-04T19:00", "Europe/Rome")).toBe(event.startsAt);
    expect(eventLocalToIso("2030-03-04T19:00:30", "Europe/Rome")).toBe("2030-03-04T18:00:30.000Z");
    expect(eventLocalToIso("2030-03-04T18:00", "UTC")).toBe(event.startsAt);
    expect(eventLocalToIso("2030-03-04T19:00", "Europe/Rome", event.startsAt)).toBe(event.startsAt);
    expect(
      eventLocalToIso("2027-11-07T01:30", "America/New_York", "2027-11-07T06:30:12.000Z"),
    ).toBe("2027-11-07T06:30:12.000Z");
    expect(eventLocalToIso("2030-03-04T19:00", "Europe/Rome", "2030-03-04T16:00:00.000Z")).toBe(
      event.startsAt,
    );
  });
  it.each([
    "",
    "2030-02-30T12:00",
    "2030-01-01T25:00",
    "2030-01-01T12:61",
    "not-a-date",
    "2027-03-14T02:30",
  ])("rejects invalid and nonexistent wall time %s", (wall) =>
    expect(() => eventLocalToIso(wall, "America/New_York")).toThrow(),
  );
  it("rejects invalid zones and dates", () => {
    expect(() => eventLocalDateTime("invalid", "UTC")).toThrow();
    expect(() => eventLocalToIso("2030-03-04T19:00", "invalid")).toThrow();
  });
  it("extracts editable fields only, retaining explicit table identity", () => {
    expect(
      editableEventTable({
        ...table,
        status: "CREATED",
        matchId: "match",
        confirmedPlayers: 3,
        demonstratorUserId: "demo",
      }),
    ).toEqual({ ...table, demonstratorUserId: "demo" });
    expect(editableEventTable(table).id).toBe(table.id);
  });
  it("preserves reservations for titles, deadlines, display labels and new tables", () => {
    expect(
      eventEditResets(
        event,
        { ...input, name: "Another name", bookingClosesAt: "2030-03-02T18:00:00.000Z" },
        [table],
        [],
      ),
    ).toBe(false);
    expect(
      eventEditResets(
        event,
        { ...input, location: { ...location, id: "another", name: "Translated label" } },
        [table],
        [],
      ),
    ).toBe(false);
    expect(
      eventEditResets(
        event,
        { ...input, tables: [{ ...editableEventTable(table), id: undefined }] },
        [table],
        [],
      ),
    ).toBe(false);
    expect(
      eventEditResets(event, { ...input, tables: [editableEventTable(table)] }, [table], []),
    ).toBe(false);
  });
  it.each(["startsAt", "endsAt", "timeZone", "location"] as const)(
    "resets schedule change %s",
    (field) => {
      const next =
        field === "location"
          ? { ...location, longitude: 13 }
          : field === "timeZone"
            ? "UTC"
            : "2030-03-05T18:00:00.000Z";
      expect(eventEditResets(event, { ...input, [field]: next }, [table], [])).toBe(true);
    },
  );
  it("resets explicit removals and changed/unloaded table ids, never drops unrelated tables", () => {
    expect(eventEditResets(event, input, [table], [table.id])).toBe(true);
    expect(
      eventEditResets(
        event,
        { ...input, tables: [{ ...editableEventTable(table), name: "Changed table" }] },
        [table],
        [],
      ),
    ).toBe(true);
    expect(
      eventEditResets(
        event,
        { ...input, tables: [{ ...editableEventTable(table), id: "unloaded" }] },
        [table],
        [],
      ),
    ).toBe(true);
  });
});
describe("explicit event participant seats and result authority", () => {
  const data = {
    match: { adminUserId: "admin", status: "CREATED" },
    administrator: { id: "admin" },
    invitedPlayers: [
      { id: "guest", invitation: { status: "ACCEPTED" } },
      { id: "pending", invitation: { status: "PENDING" } },
      { id: "declined", invitation: { status: "DECLINED" } },
    ],
  } as unknown as MatchDetailResponse;
  const metadata = {
    organizationId: "org",
    eventId: "event",
    tableId: "table",
    demonstratorUserId: "demo",
    openSkill: false,
  };
  it("keeps ordinary administrator seat and invitation states", () =>
    expect(matchParticipants(data).map((p) => [p.id, p.isAdministrator, p.status])).toEqual([
      ["admin", true, "ACCEPTED"],
      ["guest", false, "ACCEPTED"],
      ["pending", false, "PENDING"],
      ["declined", false, "DECLINED"],
    ]));
  it("uses only confirmed bookings and never adds an unbooked owner or demonstrator", () => {
    const next = { ...data, match: { ...data.match, eventTable: metadata } };
    expect(matchParticipants(next).map((p) => p.id)).toEqual(["guest"]);
    expect(
      matchParticipants({
        ...next,
        invitedPlayers: [...next.invitedPlayers, { ...data.invitedPlayers[0], id: "admin" }],
      }).map((p) => p.id),
    ).toEqual(["guest", "admin"]);
  });
  it("allows only owner or assigned demonstrator of CREATED matches", () => {
    expect(canRegisterMatchResults(data.match, "admin")).toBe(true);
    expect(canRegisterMatchResults(data.match, "demo")).toBe(false);
    expect(canRegisterMatchResults(data.match, "guest")).toBe(false);
    expect(canRegisterMatchResults(data.match, null)).toBe(false);
    expect(canRegisterMatchResults(data.match, undefined)).toBe(false);
    expect(canRegisterMatchResults(data.match, "")).toBe(false);
    const match = { ...data.match, eventTable: metadata };
    expect(canRegisterMatchResults(match, "demo")).toBe(true);
    expect(canRegisterMatchResults(match, "guest")).toBe(false);
    expect(canRegisterMatchResults({ ...match, status: "PLANNING" }, "admin")).toBe(false);
    expect(canRegisterMatchResults({ ...match, status: "TERMINATED" }, "demo")).toBe(false);
  });
  it("counts only booked confirmed players on event cards", () => {
    const match = {
      ...data.match,
      eventTable: metadata,
      status: "PLANNING",
      dates: [],
      locations: [],
      gameIds: [1],
      invitations: [
        { status: "ACCEPTED", inviteeUserId: "guest" },
        { status: "PENDING", inviteeUserId: "pending" },
      ],
      minPlayers: 2,
      maxPlayers: 4,
    } as MatchResponse;
    expect(matchCardData(match).players).toBe(1);
    expect(matchCardData({ ...match, invitations: [] }).players).toBe(0);
    expect(matchCardData({ ...match, status: "CREATED" }).players).toBe(1);
  });
});
