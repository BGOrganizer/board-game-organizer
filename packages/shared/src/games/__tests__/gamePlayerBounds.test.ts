import { expect, it } from "vitest";
import { gamePlayerBounds } from "../gamePlayerBounds";

it("uses the 2–6 envelope, never the 3–4 intersection or only the largest game", () => {
  expect(
    gamePlayerBounds([
      { minPlayers: 2, maxPlayers: 4 },
      { minPlayers: 3, maxPlayers: 6 },
    ]),
  ).toEqual({ minPlayers: 2, maxPlayers: 6 });
  expect(
    gamePlayerBounds([
      { minPlayers: 3, maxPlayers: 6 },
      { minPlayers: 2, maxPlayers: 4 },
    ]),
  ).toEqual({ minPlayers: 2, maxPlayers: 6 });
  expect(gamePlayerBounds([{ minPlayers: 1, maxPlayers: 1 }])).toEqual({
    minPlayers: 1,
    maxPlayers: 1,
  });
});

it.each([
  {},
  { minPlayers: null, maxPlayers: null },
  { minPlayers: 2 },
  { maxPlayers: 6 },
  { minPlayers: 2.5, maxPlayers: 6 },
  { minPlayers: 2, maxPlayers: 6.5 },
  { minPlayers: 0, maxPlayers: 6 },
  { minPlayers: -1, maxPlayers: 6 },
  { minPlayers: 4, maxPlayers: 2 },
  { minPlayers: Infinity, maxPlayers: Infinity },
  { minPlayers: 2, maxPlayers: Number.MAX_SAFE_INTEGER + 1 },
])("ignores an unavailable or invalid pair without discarding known games: %j", (unknown) => {
  expect(gamePlayerBounds([unknown])).toBeNull();
  expect(gamePlayerBounds([unknown, { minPlayers: 2, maxPlayers: 4 }])).toEqual({
    minPlayers: 2,
    maxPlayers: 4,
  });
});

it("does not invent limits when every selected game lacks metadata", () => {
  expect(gamePlayerBounds([])).toBeNull();
});
