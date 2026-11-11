import { expect, it } from "vitest";
import { bggPickerQuerySchema } from "../dto/bggCollection";
import { bggSearchItemSchema } from "../dto/boardGames";
import { boardGameModel } from "../models/boardGames";

const event = "11111111-1111-4111-8111-111111111111";
const table = "22222222-2222-4222-8222-222222222222";
it("defaults to no collection chips, keeps bounded paging and accepts each paired authorized source context", () => {
  expect(bggPickerQuerySchema.parse({})).toEqual({
    query: "",
    collection: "0",
    participants: "0",
    limit: 25,
  });
  expect(
    bggPickerQuerySchema.parse({
      query: " Game ",
      collection: "1",
      participants: "1",
      participantEventId: event,
      participantTableId: table,
      limit: "50",
    }),
  ).toMatchObject({ query: "Game", limit: 50 });
  expect(
    bggPickerQuerySchema.safeParse({ proposalEventId: event, proposalTableId: table }).success,
  ).toBe(true);
  expect(
    bggPickerQuerySchema.safeParse({
      participantEventId: event,
      participantTableId: table,
      participants: "0",
      search: "1",
      "x-vercel-protection-bypass": "test",
    }).success,
  ).toBe(true);
});
it.each([
  { proposalEventId: event },
  { proposalTableId: table },
  { participantEventId: event },
  { participantTableId: table },
  { participants: "1" },
  {
    proposalEventId: event,
    proposalTableId: table,
    participantEventId: event,
    participantTableId: table,
  },
  { participantEventId: "bad", participantTableId: table },
  { limit: 0 },
  { limit: 51 },
  { query: "a".repeat(121) },
  { cursor: "a".repeat(513) },
  { collection: "true" },
  { participants: "true" },
  { search: "true" },
  { unknown: true },
])("rejects unpaired, ambiguous, unbounded or undeclared source parameters: %j", (input) => {
  expect(bggPickerQuerySchema.safeParse(input).success).toBe(false);
});
it("keeps historical missing player metadata readable and accepts only positive integer BGG limits when present", () => {
  const game = { id: 1, name: "Game" };
  expect(boardGameModel.parse(game)).toMatchObject(game);
  expect(
    boardGameModel.parse({
      ...game,
      minPlayers: 2,
      maxPlayers: 6,
      playerCountsCheckedAt: "checked",
    }),
  ).toMatchObject({ minPlayers: 2, maxPlayers: 6 });
  expect(boardGameModel.safeParse({ ...game, minPlayers: 0 }).success).toBe(false);
  expect(boardGameModel.safeParse({ ...game, maxPlayers: 2.5 }).success).toBe(false);
  expect(
    bggSearchItemSchema.parse({
      ...game,
      year: null,
      imageUrl: null,
      minPlayers: null,
      maxPlayers: null,
    }),
  ).toMatchObject({ minPlayers: null, maxPlayers: null });
});

it.each([1, 3.275, 5])("preserves canonical difficulty through game DTOs: %s", (averageWeight) => {
  const row = { id: 1, name: "Game", year: null, imageUrl: null, averageWeight };
  expect(boardGameModel.parse({ id: row.id, name: row.name, averageWeight }).averageWeight).toBe(
    averageWeight,
  );
  expect(bggSearchItemSchema.parse(row).averageWeight).toBe(averageWeight);
});
it.each([0, -1, 5.01, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid canonical difficulty: %s",
  (averageWeight) => {
    const row = { id: 1, name: "Game", year: null, imageUrl: null, averageWeight };
    expect(boardGameModel.safeParse({ id: row.id, name: row.name, averageWeight }).success).toBe(
      false,
    );
    expect(bggSearchItemSchema.safeParse(row).success).toBe(false);
  },
);
