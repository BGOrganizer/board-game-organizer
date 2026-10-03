import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createGroupSchema,
  groupLeaderboardResponseSchema,
  groupModel,
  playerRatingModel,
  ratingEventModel,
} from "../index";

const base = { name: "Board Gamers", isPublic: false, invitedUserIds: ["user_friend"] };

describe("group and rating boundaries", () => {
  it("validates game covers and withdrawn match counts in group leaderboards", () => {
    const page = {
      games: [{ id: 1, name: "Azul", imageUrl: null }],
      players: [
        {
          userId: "former",
          name: "Grace",
          username: "grace",
          avatarUrl: null,
          gamesPlayed: 1,
          gamesWon: 0,
          nd: 1,
          rating: null,
          provisional: false,
          left: true,
        },
      ],
      nextCursor: null,
    };
    expect(groupLeaderboardResponseSchema.safeParse(page).success).toBe(true);
    expect(
      groupLeaderboardResponseSchema.safeParse({
        ...page,
        players: [{ ...page.players[0], nd: -1 }],
      }).success,
    ).toBe(false);
  });
  it("validates group names, friends selection IDs and public flag", () => {
    expect(createGroupSchema.safeParse({ ...base, invitedUserIds: [] }).success).toBe(true);
    expect(createGroupSchema.safeParse({ ...base, name: "abcd" }).success).toBe(false);
    expect(
      createGroupSchema.safeParse({ ...base, invitedUserIds: ["user_friend", "user_friend"] })
        .success,
    ).toBe(false);
    expect(createGroupSchema.safeParse({ ...base, isPublic: "yes" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ ...base, extra: "no" }).success).toBe(false);
    expect(
      groupModel.safeParse({
        id: randomUUID(),
        adminUserId: "user_admin",
        name: base.name,
        isPublic: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });

  it("requires finite rating state, positive sigma and one scope key", () => {
    const state = {
      userId: "user_admin",
      gameId: 1,
      scope: "GLOBAL",
      groupId: null,
      mu: 25,
      sigma: 25 / 3,
      gamesPlayed: 0,
      conservativeScore: 0,
      updatedAt: new Date().toISOString(),
    };
    expect(playerRatingModel.safeParse(state).success).toBe(true);
    expect(playerRatingModel.safeParse({ ...state, sigma: 0 }).success).toBe(false);
    expect(playerRatingModel.safeParse({ ...state, mu: Number.NaN }).success).toBe(false);
    expect(
      ratingEventModel.safeParse({
        matchId: randomUUID(),
        userId: state.userId,
        gameId: 1,
        scope: "GLOBAL",
        groupId: null,
        algorithm: "openskill-v1",
        rank: 1,
        didNotFinish: false,
        before: { mu: 25, sigma: 25 / 3, gamesPlayed: 0 },
        after: { mu: 28, sigma: 7, gamesPlayed: 1 },
        delta: 3,
        finalizedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
});
