import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { expect, it } from "vitest";
import { tableCardDates, tableCardGames, tableCardLocations } from "../eventTableCard";

const first = {
  id: "one",
  name: "First venue",
  address: "Via Roma 1",
  latitude: 41,
  longitude: 12,
  timeZone: "Europe/Rome",
};
const second = { ...first, id: "two", name: "Second venue", timeZone: "America/New_York" };
const table = {
  id: "table",
  eventStatus: "PLANNING",
  groupType: "PRIVATE",
  startsAt: "2030-06-03T21:00:00Z",
  gamesDetail: [
    { id: 1, name: "One" },
    { id: 2, name: "Two" },
  ],
  eventSchedule: {
    localStartsAt: "2030-06-03T18:00",
    location: first,
    dateCount: 2,
    locationCount: 2,
    timeZone: "Europe/Rome",
    dates: [
      { id: "one", localStartsAt: "2030-06-03T18:00" },
      { id: "two", localStartsAt: "2030-06-04T20:30" },
    ],
    locations: [first, second],
  },
} as PlannedTableResponse;

it("retains all approved private wall-time options without shifting them into the viewer's zone", () => {
  expect(tableCardDates(table)).toEqual([
    { id: "one", startsAt: "2030-06-03T18:00Z", timeZone: "UTC" },
    { id: "two", startsAt: "2030-06-04T20:30Z", timeZone: "UTC" },
  ]);
  expect(tableCardLocations(table)).toEqual([first, second]);
  expect(tableCardGames(table)).toBe(table.gamesDetail);
});
it("uses the public Table's own start and venue zone, not the earlier Event start", () => {
  expect(tableCardDates({ ...table, groupType: "PUBLIC" })).toEqual([
    { id: table.id, startsAt: table.startsAt, timeZone: "Europe/Rome" },
  ]);
  expect(tableCardDates({ ...table, groupType: "PUBLIC", startsAt: undefined })).toHaveLength(2);
  expect(
    tableCardDates({
      ...table,
      groupType: "PUBLIC",
      eventSchedule: { ...table.eventSchedule!, timeZone: undefined },
    })?.[0].timeZone,
  ).toBe("Europe/Rome");
  expect(
    tableCardDates({ ...table, groupType: "PUBLIC", eventSchedule: undefined }),
  ).toBeUndefined();
});
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "shows only chosen frozen facts for %s, including a later Table start",
  (eventStatus) => {
    const frozen = {
      ...table,
      eventStatus,
      confirmed: { startsAt: "2030-06-04T22:30:00Z", gameId: 2, playerIds: ["owner"] },
      eventSchedule: {
        ...table.eventSchedule!,
        location: second,
        locationCount: 1,
        locations: [second],
      },
    };
    expect(tableCardDates(frozen)).toEqual([
      { id: table.id, startsAt: frozen.confirmed.startsAt, timeZone: "Europe/Rome" },
    ]);
    expect(tableCardLocations(frozen)).toEqual([second]);
    expect(tableCardGames(frozen)).toEqual([table.gamesDetail[1]]);
    expect(tableCardDates({ ...frozen, confirmed: undefined })).toEqual([]);
    expect(tableCardDates({ ...frozen, eventSchedule: undefined })).toBeUndefined();
    expect(tableCardGames({ ...frozen, confirmed: undefined })).toEqual([]);
  },
);
it("never upgrades an old or stale planning preview into a complete list or chosen venue", () => {
  expect(tableCardDates({ ...table, eventSchedule: undefined })).toBeUndefined();
  expect(tableCardLocations({ ...table, eventSchedule: undefined })).toBeUndefined();
  expect(
    tableCardDates({ ...table, eventSchedule: { ...table.eventSchedule!, dates: undefined } }),
  ).toBeUndefined();
  expect(tableCardLocations({ ...table, eventStatus: "CONFIRMED" })).toBeUndefined();
  expect(
    tableCardLocations({ ...table, eventStatus: "CONFIRMED", eventSchedule: undefined }),
  ).toBeUndefined();
  expect(
    tableCardLocations({
      ...table,
      eventStatus: "CONFIRMED",
      eventSchedule: { ...table.eventSchedule!, locationCount: 1, locations: [first, second] },
    }),
  ).toEqual([first]);
  expect(
    tableCardLocations({
      ...table,
      eventStatus: "CONFIRMED",
      eventSchedule: { ...table.eventSchedule!, locationCount: 0, locations: [], location: null },
    }),
  ).toEqual([]);
  expect(
    tableCardLocations({
      ...table,
      eventStatus: "CONFIRMED",
      eventSchedule: {
        ...table.eventSchedule!,
        locationCount: 0,
        locations: [first],
        location: null,
      },
    }),
  ).toEqual([]);
  expect(
    tableCardLocations({
      ...table,
      eventStatus: "CONFIRMED",
      eventSchedule: { ...table.eventSchedule!, locationCount: 1, locations: undefined },
    }),
  ).toEqual([first]);
  expect(
    tableCardLocations({
      ...table,
      eventStatus: "CONFIRMED",
      eventSchedule: {
        ...table.eventSchedule!,
        locationCount: 0,
        locations: undefined,
        location: null,
      },
    }),
  ).toEqual([]);
});
