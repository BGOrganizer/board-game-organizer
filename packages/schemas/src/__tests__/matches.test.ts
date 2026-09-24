import { describe, expect, it } from "vitest";
import {
  createMatchSchema,
  inviteMatchUserSchema,
  MATCH_INDEXES,
  MATCH_INVITATION_INDEXES,
  matchDetailResponseSchema,
  matchInvitationModel,
  matchInvitationResponseSchema,
  matchModel,
  matchResponseSchema,
  respondMatchInvitationSchema,
  setMatchChoiceSchema,
  updateMatchSchema,
} from "../index";

const valid = {
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z"],
  minPlayers: 2,
  maxPlayers: 4,
  invitedUserIds: ["user_guest"],
  gameIds: [1],
};
const match = {
  id: "69409f64-7414-4e47-815c-36b01c1bff95",
  clerkId: "user_admin",
  name: valid.name,
  dates: valid.dates,
  minPlayers: 2,
  maxPlayers: 4,
  gameIds: [1],
  status: "PLANNING",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};
const invitation = {
  id: "5f2c704d-52c8-496a-b7a6-ec1abacee010",
  matchId: match.id,
  inviterUserId: "user_admin",
  inviteeUserId: "user_guest",
  status: "PENDING",
  createdAt: match.createdAt,
  updatedAt: match.updatedAt,
};

describe("createMatchSchema", () => {
  it("accepts complete input and defaults invitations", () => {
    expect(createMatchSchema.parse(valid)).toEqual(valid);
    expect(createMatchSchema.parse({ ...valid, invitedUserIds: undefined }).invitedUserIds).toEqual(
      [],
    );
  });

  it.each([
    [{ ...valid, name: "four" }],
    [{ ...valid, name: "x".repeat(121) }],
    [{ ...valid, dates: [] }],
    [{ ...valid, dates: ["tomorrow"] }],
    [{ ...valid, minPlayers: 1 }],
    [{ ...valid, minPlayers: 2.5 }],
    [{ ...valid, maxPlayers: 1 }],
    [{ ...valid, maxPlayers: 3, minPlayers: 4 }],
    [{ ...valid, maxPlayers: 2, invitedUserIds: ["user_a", "user_b"] }],
    [{ ...valid, gameIds: [] }],
    [{ ...valid, gameIds: [0] }],
    [{ ...valid, gameIds: [1.5] }],
    [{ ...valid, unknown: true }],
  ])("rejects invalid input %#", (input) => {
    expect(createMatchSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    [{ ...valid, dates: [valid.dates[0], valid.dates[0]] }],
    [{ ...valid, invitedUserIds: ["user_guest", "user_guest"] }],
    [{ ...valid, gameIds: [1, 1] }],
  ])("rejects duplicate values %#", (input) => {
    expect(createMatchSchema.safeParse(input).success).toBe(false);
  });
});

describe("match models and DTOs", () => {
  it("validates choices and rejects forged items", () => {
    expect(
      setMatchChoiceSchema.parse({
        kind: "dates",
        itemId: "2026-09-05T20:00:00.000Z",
        choice: "UNKNOWN",
      }).choice,
    ).toBe("UNKNOWN");
    expect(
      setMatchChoiceSchema.parse({ kind: "games", itemId: 1, choice: "IF_NEEDED" }).choice,
    ).toBe("IF_NEEDED");
    expect(
      setMatchChoiceSchema.safeParse({ kind: "dates", itemId: "2026-09-05", choice: "YES" })
        .success,
    ).toBe(false);
    expect(
      setMatchChoiceSchema.safeParse({ kind: "games", itemId: -1, choice: "YES" }).success,
    ).toBe(false);
    expect(
      setMatchChoiceSchema.safeParse({ kind: "games", itemId: 1, choice: "MAYBE" }).success,
    ).toBe(false);
  });
  it("validates stored match and invitation", () => {
    expect(matchModel.parse(match)).toEqual(match);
    expect(matchInvitationModel.parse(invitation)).toEqual(invitation);
    expect(
      matchInvitationModel.parse({
        ...invitation,
        status: "ACCEPTED",
        respondedAt: match.updatedAt,
      }).respondedAt,
    ).toBe(match.updatedAt);
  });

  it("validates API match responses", () => {
    const response = {
      id: match.id,
      adminUserId: match.clerkId,
      name: match.name,
      dates: match.dates,
      minPlayers: match.minPlayers,
      maxPlayers: match.maxPlayers,
      invitedUserIds: [invitation.inviteeUserId],
      gameIds: match.gameIds,
      status: match.status,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      invitations: [invitation],
    };
    expect(matchResponseSchema.parse(response)).toEqual(response);
    const detail = {
      match: response,
      administrator: {
        id: "user_admin",
        name: "Admin Player",
        email: "admin@example.com",
        avatarUrl: null,
      },
      invitedPlayers: [
        {
          id: "user_guest",
          name: "Guest Player",
          email: "guest@example.com",
          avatarUrl: null,
          invitation,
        },
      ],
      games: [{ id: 1, name: "Azul", yearPublished: 2017, thumbnail: null }],
    };
    expect(matchDetailResponseSchema.parse(detail)).toEqual(detail);
    expect(matchInvitationResponseSchema.parse(invitation)).toEqual(invitation);
  });

  it("exports match indexes", () => {
    expect(MATCH_INDEXES).toHaveLength(2);
    expect(MATCH_INVITATION_INDEXES).toHaveLength(3);
  });

  it("validates invitation commands", () => {
    expect(inviteMatchUserSchema.parse({ inviteeUserId: "user_guest" })).toEqual({
      inviteeUserId: "user_guest",
    });
    expect(inviteMatchUserSchema.safeParse({ inviteeUserId: "" }).success).toBe(false);
    expect(
      inviteMatchUserSchema.safeParse({ inviteeUserId: "user_guest", extra: true }).success,
    ).toBe(false);
    expect(respondMatchInvitationSchema.parse({ decision: "accept" })).toEqual({
      decision: "accept",
    });
    expect(respondMatchInvitationSchema.parse({ decision: "decline" })).toEqual({
      decision: "decline",
    });
    expect(respondMatchInvitationSchema.safeParse({ decision: "later" }).success).toBe(false);
    expect(
      updateMatchSchema.parse({
        name: "Updated match",
        dates: ["2026-11-01T20:00:00.000Z"],
        minPlayers: 2,
        maxPlayers: 5,
        invitedUserIds: ["user_guest"],
        gameIds: [1, 2],
      }),
    ).toEqual({
      name: "Updated match",
      dates: ["2026-11-01T20:00:00.000Z"],
      minPlayers: 2,
      maxPlayers: 5,
      invitedUserIds: ["user_guest"],
      gameIds: [1, 2],
    });
    for (const input of [
      {},
      { name: "four" },
      { dates: [] },
      { dates: ["invalid"] },
      { dates: ["2026-11-01T20:00:00.000Z", "2026-11-01T20:00:00.000Z"] },
      { minPlayers: 1 },
      { minPlayers: 2.5 },
      { maxPlayers: 1 },
      { maxPlayers: 2.5 },
      { minPlayers: 4, maxPlayers: 3 },
      { invitedUserIds: ["user_guest", "user_guest"] },
      { maxPlayers: 2, invitedUserIds: ["user_one", "user_two"] },
      { gameIds: [] },
      { gameIds: [0] },
      { gameIds: [1.5] },
      { gameIds: [1, 1] },
      { unexpected: true },
    ]) {
      expect(updateMatchSchema.safeParse(input).success).toBe(false);
    }
  });
});
