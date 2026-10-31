import type { EventResponse, EventTableInput } from "@board-game-organizer/schemas";
import { describe, expect, it } from "vitest";
import {
  eventDateLimit,
  eventDraftTableCount,
  eventInformationForm,
  eventOnDay,
  eventPlayerRange,
  eventSaveFieldErrors,
  eventTableForm,
} from "../eventWizardForm";

const location = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Club house",
  address: "Via Roma 1, Italy",
  latitude: 45,
  longitude: 12,
};
const info = {
  name: "Weekend games",
  start: "2030-01-01T18:00",
  end: "2030-01-01T22:00",
  zone: "UTC",
  bookingHours: "24",
  location,
};
const table: EventTableInput = {
  name: "Azul",
  startsAt: "2030-01-01T18:01:12.123Z",
  endsAt: "2030-01-01T21:59:34.456Z",
  minPlayers: 2,
  maxPlayers: 4,
  gameId: 1,
  openSkill: false,
};
const form = {
  input: table,
  start: "2030-01-01T18:01",
  end: "2030-01-01T21:59",
  zone: "UTC",
  eventStart: "2030-01-01T18:00:00Z",
  eventEnd: "2030-01-01T22:00:00Z",
};
describe("event wizard validation and ranges", () => {
  it("accepts one-day events and preserves stored instants on edits", () => {
    const result = eventInformationForm(info, undefined, 0);
    expect(result.errors).toEqual({});
    expect(result.data?.endsAt).toBe("2030-01-01T22:00:00.000Z");
    const previous = {
      startsAt: "2030-01-01T18:00:12.123Z",
      endsAt: "2030-01-01T22:00:34.456Z",
    } as EventResponse;
    expect(eventInformationForm(info, previous, 0).data).toMatchObject(previous);
  });
  it("reports all invalid fields, empty/invalid/DST-missing times, invalid zone and duration", () => {
    const errors = eventInformationForm(
      { ...info, name: "", start: "", end: "bad", bookingHours: "0", location: undefined },
      undefined,
      0,
    ).errors;
    expect(Object.keys(errors).sort()).toEqual([
      "bookingHours",
      "endsAt",
      "location",
      "name",
      "startsAt",
    ]);
    expect(
      eventInformationForm({ ...info, zone: "bad" }, undefined, 0).errors.timeZone,
    ).toBeTruthy();
    expect(
      eventInformationForm(
        { ...info, start: "2030-03-31T02:30", zone: "Europe/Rome" },
        undefined,
        0,
      ).errors.startsAt,
    ).toBeTruthy();
    expect(
      eventInformationForm({ ...info, end: info.start }, undefined, 0).errors.endsAt,
    ).toBeTruthy();
    const past = eventInformationForm(info, undefined, Date.parse("2030-01-02T00:00:00Z"));
    expect(past.data).toBeNull();
    expect(past.errors.startsAt).toBeTruthy();
    expect(past.errors.bookingHours).toBeTruthy();
    expect(
      eventInformationForm(info, undefined, Date.parse("2029-12-31T20:00:00Z")).errors.bookingHours,
    ).toBeTruthy();
  });
  it("validates table fields and strict event boundaries, retaining exact unchanged seconds", () => {
    expect(eventTableForm(form)).toEqual({ data: table, errors: {} });
    expect(eventTableForm({ ...form, start: "bad", end: "bad" }).errors).toEqual({
      startsAt: "Choose a valid date and time; this local time may not exist.",
      endsAt: "Choose a valid date and time; this local time may not exist.",
    });
    const invalid = eventTableForm({
      ...form,
      input: {
        ...table,
        name: "",
        gameId: 0,
        minPlayers: 1,
        maxPlayers: 1,
        demonstratorUserId: "",
      },
      start: "2030-01-01T18:00",
      end: "2030-01-01T22:00",
    });
    expect(invalid.data).toBeNull();
    expect(Object.keys(invalid.errors).sort()).toEqual([
      "demonstratorUserId",
      "endsAt",
      "gameId",
      "maxPlayers",
      "minPlayers",
      "name",
      "startsAt",
    ]);
    expect(eventTableForm({ ...form, start: "2030-01-01T22:00" }).errors.startsAt).toBeTruthy();
    expect(eventTableForm({ ...form, end: "2030-01-01T18:01" }).errors.endsAt).toBeTruthy();
    expect(
      eventTableForm({ ...form, input: { ...table, maxPlayers: 1 } }).errors.maxPlayers,
    ).toBeTruthy();
    expect(eventTableForm({ ...form, input: { ...table, id: "bad" } }).errors.id).toBe(
      "Check this field.",
    );
  });
  it("updates strict minute bounds, including second precision and DST", () => {
    expect(eventDateLimit("2030-01-01T18:00", "UTC", "after")).toBe("2030-01-01T18:01");
    expect(eventDateLimit("2030-01-01T22:00", "UTC", "before")).toBe("2030-01-01T21:59");
    expect(eventDateLimit("2030-01-01T22:00", "UTC", "before", "2030-01-01T22:00:34.123Z")).toBe(
      "2030-01-01T22:00",
    );
    expect(eventDateLimit("2030-01-02T14:00", "UTC", "after")).toBe("2030-01-02T14:01");
    expect(eventDateLimit("2030-03-31T01:59", "Europe/Rome", "after")).toBe("2030-03-31T03:00");
    expect(eventDateLimit("", "UTC", "before")).toBeUndefined();
  });
  it("matches the +/- player range policy without invalid minimum/maximum states", () => {
    expect(eventPlayerRange(2, 4, "minPlayers", -1)).toEqual({ minPlayers: 2, maxPlayers: 4 });
    expect(eventPlayerRange(4, 4, "minPlayers", 1)).toEqual({ minPlayers: 5, maxPlayers: 5 });
    expect(eventPlayerRange(3, 4, "minPlayers", -1)).toEqual({ minPlayers: 2, maxPlayers: 4 });
    expect(eventPlayerRange(2, 4, "maxPlayers", 1)).toEqual({ minPlayers: 2, maxPlayers: 5 });
    expect(eventPlayerRange(4, 4, "maxPlayers", -1)).toEqual({ minPlayers: 4, maxPlayers: 4 });
    expect(eventPlayerRange(2, 4, "maxPlayers", -1)).toEqual({ minPlayers: 2, maxPlayers: 3 });
  });
  it("routes server input failures back to fields without treating permission/network errors as validation", () => {
    for (const [code, field] of [
      ["BOOKING_DEADLINE_PASSED", "bookingHours"],
      ["EVENT_MUST_BE_FUTURE", "startsAt"],
      ["TABLE_OUTSIDE_EVENT", "tables"],
      ["EVENT_REQUIRES_TABLE", "tables"],
      ["EVENT_TABLE_LIMIT", "tables"],
      ["GAME_NOT_FOUND", "tables"],
      ["ORGANIZATION_MEMBER_REQUIRED", "tables"],
    ])
      expect(eventSaveFieldErrors(new Error(code))[field]).toBeTruthy();
    expect(eventSaveFieldErrors(new Error("EVENT_CHANGED"))).toEqual({});
    expect(eventSaveFieldErrors(new Error("toString"))).toEqual({});
    expect(eventSaveFieldErrors("NETWORK_ERROR")).toEqual({});
  });
  it("moves selected times to one day without inventing missing times or losing seconds", () => {
    expect(eventOnDay("2030-01-01T18:01:12.123", "2030-02-02")).toBe("2030-02-02T18:01:12.123");
    expect(eventOnDay("", "2030-02-02")).toBe("");
    expect(eventOnDay("2030-01-01T18:01", "")).toBe("");
    expect(
      eventInformationForm({ ...info, end: "2030-01-02T22:00" }, undefined, 0).errors.endsAt,
    ).toBeTruthy();
  });
  it("counts retained/unloaded tables, new tables, edits and unique explicit removals", () => {
    const fresh = { key: "new", input: table, gameName: "Azul" };
    const edited = { ...fresh, input: { ...table, id: "old" } };
    expect(eventDraftTableCount(20, [], [])).toBe(20);
    expect(eventDraftTableCount(20, [edited], [])).toBe(20);
    expect(eventDraftTableCount(20, [fresh, edited], ["removed", "removed"])).toBe(20);
    expect(eventDraftTableCount(0, [fresh], [])).toBe(1);
  });
});
