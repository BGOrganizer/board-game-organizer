import { expect, it } from "vitest";
import { groupLeaderboardResponseSchema } from "../dto/groupLeaderboard";

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
