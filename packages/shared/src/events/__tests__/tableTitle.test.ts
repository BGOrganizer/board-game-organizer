import { expect, it } from "vitest";
import { draftTableNumber, newTableDraft } from "../eventRecordForm";
import { tableTitle } from "../tableTitle";

const label = (number?: number) => (number === undefined ? "Tavolo" : `Tavolo #${number}`);
const confirmed = { gameId: 7, startsAt: "2030-06-03T18:00:00Z", playerIds: [] };
const gamesDetail = [
  { id: 9, name: "Another game", imageUrl: null, year: null },
  { id: 7, name: "Hegemony", imageUrl: null, year: 2023 },
];

it("uses the immutable number in planning, including when the event was reopened", () => {
  const legacy = {
    order: 3,
    name: "Ignored",
    confirmed,
    confirmedGameName: "Hegemony",
    gamesDetail,
  };
  expect(tableTitle({ ...legacy, eventStatus: "PLANNING" }, label)).toBe("Tavolo #4");
  expect(tableTitle({ order: 0, eventStatus: "PLANNING" }, label)).toBe("Tavolo #1");
});

it("uses the chosen catalog title on a confirmed or finished table", () => {
  expect(
    tableTitle({ order: 2, eventStatus: "CONFIRMED", confirmedGameName: "Hegemony" }, label),
  ).toBe("Hegemony");
  expect(tableTitle({ order: 2, eventStatus: "TERMINATED", confirmed, gamesDetail }, label)).toBe(
    "Hegemony",
  );
  expect(tableTitle({ order: 2, eventStatus: "CONFIRMED", gamesDetail }, label)).toBe("Tavolo #3");
  expect(
    tableTitle(
      { order: 2, eventStatus: "TERMINATED", confirmed: { ...confirmed, gameId: 99 }, gamesDetail },
      label,
    ),
  ).toBe("Tavolo #3");
  expect(tableTitle({ confirmedGameName: "Hegemony" }, label)).toBe("Hegemony");
  expect(tableTitle({ order: 0, confirmed: true, gamesDetail }, label)).toBe("Tavolo #1");
  expect(tableTitle({}, label)).toBe("Tavolo");
});

it("numbers new unsaved tables using the Event counter without disturbing persisted tables", () => {
  const rows = [
    { id: "old", key: "old", order: 2 },
    newTableDraft("first-new"),
    { id: "cached", key: "cached" },
    newTableDraft("second-new"),
  ];
  expect(draftTableNumber(rows, "old", 5)).toBe(3);
  expect(draftTableNumber(rows, "cached", 5)).toBeUndefined();
  expect(draftTableNumber(rows, "absent", 5)).toBeUndefined();
  expect(draftTableNumber(rows, "first-new", 5)).toBe(6);
  expect(draftTableNumber(rows, "second-new", 5)).toBe(7);
  expect(draftTableNumber(rows, "second-new")).toBe(5);
  expect(draftTableNumber([newTableDraft("only")], "only")).toBe(1);
});
