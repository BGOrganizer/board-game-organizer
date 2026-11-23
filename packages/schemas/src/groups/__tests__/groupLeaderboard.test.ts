import { expect, it } from "vitest";
import { groupLeaderboardResponseSchema, leaderboardQuerySchema } from "../dto/groupLeaderboard";

const player = {
  userId: "user",
  name: "Name",
  username: "handle",
  avatarUrl: null,
  gamesPlayed: 2,
  gamesWon: 1,
  nd: 0,
  rating: 510,
  provisional: true,
  left: false,
};
it.each(["ADMIN", "MODERATOR", "MEMBER", null, undefined] as const)(
  "accepts authoritative roles and missing legacy-cache role: %s",
  (groupRole) => {
    expect(
      groupLeaderboardResponseSchema.parse({
        games: [],
        players: [{ ...player, groupRole }],
        nextCursor: null,
      }).players[0].groupRole,
    ).toBe(groupRole);
  },
);
it.each(["OWNER", "INVITED", "BANNED", "moderator", 1])(
  "rejects undeclared ranking membership roles: %s",
  (groupRole) => {
    expect(() =>
      groupLeaderboardResponseSchema.parse({
        games: [],
        players: [{ ...player, groupRole }],
        nextCursor: null,
      }),
    ).toThrow();
  },
);

it.each([1, null, undefined])("accepts rating position %s and old cached rows", (position) => {
  expect(
    groupLeaderboardResponseSchema.parse({
      games: [],
      players: [{ ...player, position }],
      nextCursor: null,
    }).players[0].position,
  ).toBe(position);
});

it.each([0, -1, 1.5])("rejects unavailable ranking positions represented by %s", (position) => {
  expect(
    groupLeaderboardResponseSchema.safeParse({
      games: [],
      players: [{ ...player, position }],
      nextCursor: null,
    }).success,
  ).toBe(false);
});

it.each(["rating", "gamesPlayed", "gamesWon", "nd"])("validates the %s sort", (sort) => {
  expect(leaderboardQuerySchema.parse({ sort, direction: "asc" })).toEqual({
    cursor: 0,
    limit: 25,
    sort,
    direction: "asc",
  });
});
