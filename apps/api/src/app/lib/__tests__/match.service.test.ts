import type { Match, MatchInvitation } from "@board-game-organizer/schemas";
import { MongoServerError } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatchError, MatchService } from "@/app/lib/match.service";

const match: Match = {
  id: "69409f64-7414-4e47-815c-36b01c1bff95",
  clerkId: "user_admin",
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z"],
  minPlayers: 2,
  maxPlayers: 3,
  gameIds: [1],
  status: "PLANNING",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};
const invitation: MatchInvitation = {
  id: "5f2c704d-52c8-496a-b7a6-ec1abacee010",
  matchId: match.id,
  inviterUserId: "user_admin",
  inviteeUserId: "user_guest",
  status: "PENDING",
  createdAt: match.createdAt,
  updatedAt: match.updatedAt,
};
const input = {
  name: match.name,
  dates: match.dates,
  minPlayers: match.minPlayers,
  maxPlayers: match.maxPlayers,
  invitedUserIds: ["user_guest"],
  gameIds: match.gameIds,
};

function setup() {
  const matches = {
    create: vi.fn(async () => match),
    listAccessible: vi.fn(async () => [match]),
    findById: vi.fn(async () => match as Match | null),
    serializeInvitationChange: vi.fn(async () => ({ modifiedCount: 1 })),
    updatePlanning: vi.fn(async () => ({ ...match, maxPlayers: 4 }) as Match | null),
    deleteById: vi.fn(async () => ({ deletedCount: 1 })),
  };
  const invitations = {
    create: vi.fn(async () => invitation),
    createMany: vi.fn(async () => [invitation]),
    findById: vi.fn(async () => invitation as MatchInvitation | null),
    findByMatchAndInvitee: vi.fn(async () => null as MatchInvitation | null),
    listByMatch: vi.fn(async () => [invitation]),
    listByMatchIds: vi.fn(async () => [invitation]),
    listByInvitee: vi.fn(async () => [invitation]),
    countByMatch: vi.fn(async () => 0),
    respond: vi.fn(
      async (): Promise<MatchInvitation | null> => ({ ...invitation, status: "ACCEPTED" }),
    ),
    deleteAccepted: vi.fn(async () => ({ deletedCount: 1 })),
    deleteByIdForMatch: vi.fn(async () => ({ deletedCount: 1 })),
    deleteAllByMatch: vi.fn(async () => ({ deletedCount: 1 })),
  };
  const users = { findById: vi.fn(async () => ({ clerkId: "user" })) };
  const relationships = {
    isBlocked: vi.fn(async () => false),
    isFriend: vi.fn(async () => true),
  };
  const games = { findExistingIds: vi.fn(async () => [1]) };
  const service = new MatchService(
    matches as never,
    invitations as never,
    users as never,
    relationships as never,
    games as never,
  );
  return { service, matches, invitations, users, relationships, games };
}

async function expectMatchError(promise: Promise<unknown>, status: number, message: string) {
  await expect(promise).rejects.toEqual(expect.objectContaining({ status, message }));
}

describe("MatchService", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requires a synchronized current user", async () => {
    const { service, users } = setup();
    await expect(service.requireCurrentUser("user_admin")).resolves.toBeUndefined();
    users.findById.mockResolvedValueOnce(null as never);
    await expectMatchError(
      service.requireCurrentUser("user_missing"),
      409,
      "User profile not synchronized",
    );
  });

  it("creates a match and invitations", async () => {
    const { service, matches, invitations } = setup();
    const result = await service.create("user_admin", input);
    expect(matches.create).toHaveBeenCalledWith({
      clerkId: "user_admin",
      name: input.name,
      dates: input.dates,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      gameIds: input.gameIds,
    });
    expect(invitations.createMany).toHaveBeenCalledWith(match.id, "user_admin", ["user_guest"]);
    expect(result).toEqual({
      id: match.id,
      adminUserId: "user_admin",
      name: match.name,
      dates: match.dates,
      minPlayers: 2,
      maxPlayers: 3,
      invitedUserIds: ["user_guest"],
      gameIds: [1],
      status: "PLANNING",
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      invitations: [invitation],
    });
  });

  it("rejects initial invitations beyond maxPlayers minus admin", async () => {
    const { service, games } = setup();
    await expectMatchError(
      service.create("user_admin", {
        ...input,
        maxPlayers: 2,
        invitedUserIds: ["user_guest", "user_other"],
      }),
      400,
      "Invitations exceed available player positions",
    );
    expect(games.findExistingIds).not.toHaveBeenCalled();
  });

  it("rejects unknown games before writing", async () => {
    const { service, games, matches } = setup();
    games.findExistingIds.mockResolvedValue([]);
    await expectMatchError(
      service.create("user_admin", input),
      400,
      "One or more games do not exist",
    );
    expect(matches.create).not.toHaveBeenCalled();
  });

  it("rejects self, missing, blocked, and non-friend invitees", async () => {
    const self = setup();
    await expectMatchError(
      self.service.create("user_admin", { ...input, invitedUserIds: ["user_admin"] }),
      400,
      "Match admin cannot invite themselves",
    );

    const missing = setup();
    missing.users.findById.mockResolvedValue(null as never);
    await expectMatchError(missing.service.create("user_admin", input), 404, "User not found");

    const blocked = setup();
    blocked.relationships.isBlocked.mockResolvedValue(true);
    await expectMatchError(blocked.service.create("user_admin", input), 404, "User not found");

    const stranger = setup();
    stranger.relationships.isFriend.mockResolvedValue(false);
    await expectMatchError(
      stranger.service.create("user_admin", input),
      400,
      "Invited users must be friends of match admin",
    );
  });

  it("lists accessible matches and groups invitations", async () => {
    const { service, matches, invitations } = setup();
    const second = { ...match, id: "8923a18c-1b90-4ee4-96fb-88a3d9226b37" };
    matches.listAccessible.mockResolvedValue([match, second]);
    invitations.listByMatchIds.mockResolvedValue([invitation]);
    const result = await service.list("user_guest");
    expect(matches.listAccessible).toHaveBeenCalledWith("user_guest", [match.id]);
    expect(invitations.listByMatchIds).toHaveBeenCalledWith([match.id, second.id]);
    expect(result[0].invitations).toEqual([invitation]);
    expect(result[1].invitations).toEqual([]);
  });

  it("returns detail to admin and invitee but hides it from others", async () => {
    await expect(setup().service.detail("user_admin", match.id)).resolves.toMatchObject({
      id: match.id,
    });
    await expect(setup().service.detail("user_guest", match.id)).resolves.toMatchObject({
      id: match.id,
    });
    await expectMatchError(setup().service.detail("user_other", match.id), 404, "Match not found");
  });

  it("returns 404 when match does not exist", async () => {
    const { service, matches } = setup();
    matches.findById.mockResolvedValue(null);
    await expectMatchError(service.detail("user_admin", match.id), 404, "Match not found");
  });

  it("lists invitations only for admin", async () => {
    await expect(setup().service.listInvitations("user_admin", match.id)).resolves.toEqual([
      invitation,
    ]);
    await expectMatchError(
      setup().service.listInvitations("user_guest", match.id),
      403,
      "Only match admin can manage match",
    );
  });

  it("creates a later invitation when one position remains", async () => {
    const { service, matches, invitations } = setup();
    await expect(service.invite("user_admin", match.id, "user_guest")).resolves.toEqual(invitation);
    expect(matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
    expect(invitations.countByMatch).toHaveBeenCalledWith(match.id);
    expect(invitations.create).toHaveBeenCalledWith(match.id, "user_admin", "user_guest");
  });

  it("only admin can invite while planning", async () => {
    await expectMatchError(
      setup().service.invite("user_guest", match.id, "user_other"),
      403,
      "Only match admin can manage match",
    );
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.invite("user_admin", match.id, "user_guest"),
      409,
      "Match is no longer in planning",
    );
  });

  it("rejects every duplicate invitation status", async () => {
    for (const status of ["PENDING", "ACCEPTED", "DECLINED"] as const) {
      const duplicate = setup();
      duplicate.invitations.findByMatchAndInvitee.mockResolvedValue({ ...invitation, status });
      await expectMatchError(
        duplicate.service.invite("user_admin", match.id, "user_guest"),
        409,
        "User is already invited",
      );
    }
  });

  it("requires maxPlayers increase before another invitation", async () => {
    const full = setup();
    full.invitations.countByMatch.mockResolvedValue(match.maxPlayers - 1);
    await expectMatchError(
      full.service.invite("user_admin", match.id, "user_guest"),
      409,
      "Match has no available invitation positions",
    );
    expect(full.invitations.create).not.toHaveBeenCalled();
  });

  it("maps duplicate inserts but rethrows other database errors", async () => {
    const duplicate = setup();
    duplicate.invitations.create.mockRejectedValue(
      new MongoServerError({ message: "duplicate", code: 11000 }),
    );
    await expectMatchError(
      duplicate.service.invite("user_admin", match.id, "user_guest"),
      409,
      "User is already invited",
    );
    const failure = setup();
    failure.invitations.create.mockRejectedValue(new Error("db down"));
    await expect(failure.service.invite("user_admin", match.id, "user_guest")).rejects.toThrow(
      "db down",
    );
  });

  it("hides missing or foreign invitations", async () => {
    const missing = setup();
    missing.invitations.findById.mockResolvedValue(null);
    await expectMatchError(
      missing.service.respond("user_guest", invitation.id, "accept"),
      404,
      "Invitation not found",
    );
    const foreign = setup();
    await expectMatchError(
      foreign.service.respond("user_other", invitation.id, "accept"),
      404,
      "Invitation not found",
    );
  });

  it("accepts and declines pending invitations", async () => {
    const accepted = setup();
    await accepted.service.respond("user_guest", invitation.id, "accept");
    expect(accepted.invitations.respond).toHaveBeenCalledWith(invitation.id, "ACCEPTED");

    const declined = setup();
    await declined.service.respond("user_guest", invitation.id, "decline");
    expect(declined.invitations.respond).toHaveBeenCalledWith(invitation.id, "DECLINED");
  });

  it("rejects responses outside pending planning", async () => {
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.respond("user_guest", invitation.id, "accept"),
      409,
      "Match is no longer in planning",
    );
    const answered = setup();
    answered.invitations.findById.mockResolvedValue({ ...invitation, status: "DECLINED" });
    await expectMatchError(
      answered.service.respond("user_guest", invitation.id, "accept"),
      409,
      "Invitation already answered",
    );
  });

  it("detects a concurrent response", async () => {
    const { service, invitations } = setup();
    invitations.respond.mockResolvedValue(null);
    await expectMatchError(
      service.respond("user_guest", invitation.id, "decline"),
      409,
      "Invitation changed concurrently",
    );
  });

  it("lets accepted invitee leave while planning", async () => {
    const { service, invitations } = setup();
    invitations.findById.mockResolvedValue({ ...invitation, status: "ACCEPTED" });
    await expect(service.leave("user_guest", invitation.id)).resolves.toBeUndefined();
    expect(invitations.deleteAccepted).toHaveBeenCalledWith(invitation.id, "user_guest");
  });

  it("rejects missing, foreign, pending, finalized, and concurrent leave", async () => {
    const missing = setup();
    missing.invitations.findById.mockResolvedValue(null);
    await expectMatchError(
      missing.service.leave("user_guest", invitation.id),
      404,
      "Invitation not found",
    );
    await expectMatchError(
      setup().service.leave("user_other", invitation.id),
      404,
      "Invitation not found",
    );
    await expectMatchError(
      setup().service.leave("user_guest", invitation.id),
      409,
      "Only accepted participants can leave",
    );
    const created = setup();
    created.invitations.findById.mockResolvedValue({ ...invitation, status: "ACCEPTED" });
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.leave("user_guest", invitation.id),
      409,
      "Match is no longer in planning",
    );
    const changed = setup();
    changed.invitations.findById.mockResolvedValue({ ...invitation, status: "ACCEPTED" });
    changed.invitations.deleteAccepted.mockResolvedValue({ deletedCount: 0 });
    await expectMatchError(
      changed.service.leave("user_guest", invitation.id),
      409,
      "Invitation changed concurrently",
    );
  });

  it("admin removes pending, declined, or accepted invitations", async () => {
    for (const status of ["PENDING", "DECLINED", "ACCEPTED"] as const) {
      const current = setup();
      current.invitations.findById.mockResolvedValue({ ...invitation, status });
      await expect(
        current.service.removeInvitation("user_admin", match.id, invitation.id),
      ).resolves.toBeUndefined();
      expect(current.matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
      expect(current.invitations.deleteByIdForMatch).toHaveBeenCalledWith(invitation.id, match.id);
    }
  });

  it("rejects non-admin, finalized, missing, foreign, and concurrent invitation removal", async () => {
    await expectMatchError(
      setup().service.removeInvitation("user_guest", match.id, invitation.id),
      403,
      "Only match admin can manage match",
    );
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.removeInvitation("user_admin", match.id, invitation.id),
      409,
      "Match is no longer in planning",
    );
    const missing = setup();
    missing.invitations.findById.mockResolvedValue(null);
    await expectMatchError(
      missing.service.removeInvitation("user_admin", match.id, invitation.id),
      404,
      "Invitation not found",
    );
    const foreign = setup();
    foreign.invitations.findById.mockResolvedValue({ ...invitation, matchId: "other-match" });
    await expectMatchError(
      foreign.service.removeInvitation("user_admin", match.id, invitation.id),
      404,
      "Invitation not found",
    );
    const changed = setup();
    changed.invitations.deleteByIdForMatch.mockResolvedValue({ deletedCount: 0 });
    await expectMatchError(
      changed.service.removeInvitation("user_admin", match.id, invitation.id),
      409,
      "Invitation changed concurrently",
    );
  });

  it("admin updates every match field while planning", async () => {
    const { service, matches, invitations, games } = setup();
    const changes = {
      name: "Updated match",
      dates: ["2026-11-01T20:00:00.000Z", "2026-11-02T20:00:00.000Z"],
      minPlayers: 3,
      maxPlayers: 4,
      gameIds: [1, 2],
    };
    games.findExistingIds.mockResolvedValue([1, 2]);
    matches.updatePlanning.mockResolvedValue({ ...match, ...changes });
    await expect(service.update("user_admin", match.id, changes)).resolves.toMatchObject({
      id: match.id,
      ...changes,
      invitations: [invitation],
    });
    expect(matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
    expect(invitations.countByMatch).toHaveBeenCalledWith(match.id);
    expect(matches.updatePlanning).toHaveBeenCalledWith(match.id, "user_admin", changes);
    expect(invitations.listByMatch).toHaveBeenCalledWith(match.id);
  });

  it("updates title, dates, minPlayers, or games without checking occupied positions", async () => {
    for (const changes of [
      { name: "Updated match" },
      { dates: ["2026-11-01T20:00:00.000Z"] },
      { minPlayers: 2 },
      { gameIds: [1] },
    ]) {
      const current = setup();
      await current.service.update("user_admin", match.id, changes);
      expect(current.invitations.countByMatch).not.toHaveBeenCalled();
    }
  });

  it("rejects non-admin and finalized match updates", async () => {
    await expectMatchError(
      setup().service.update("user_guest", match.id, { name: "Updated match" }),
      403,
      "Only match admin can manage match",
    );
    const created = setup();
    created.matches.findById.mockResolvedValue({ ...match, status: "CREATED" });
    await expectMatchError(
      created.service.update("user_admin", match.id, { name: "Updated match" }),
      409,
      "Match is no longer in planning",
    );
  });

  it("rejects player ranges invalid against current match values", async () => {
    await expectMatchError(
      setup().service.update("user_admin", match.id, { minPlayers: match.maxPlayers + 1 }),
      400,
      "maxPlayers must be greater than or equal to minPlayers",
    );
    await expectMatchError(
      setup().service.update("user_admin", match.id, { maxPlayers: match.minPlayers - 1 }),
      400,
      "maxPlayers must be greater than or equal to minPlayers",
    );
  });

  it("rejects unknown games and maxPlayers below occupied positions", async () => {
    const unknownGame = setup();
    unknownGame.games.findExistingIds.mockResolvedValue([]);
    await expectMatchError(
      unknownGame.service.update("user_admin", match.id, { gameIds: [2] }),
      400,
      "One or more games do not exist",
    );

    const occupied = setup();
    occupied.invitations.countByMatch.mockResolvedValue(2);
    await expectMatchError(
      occupied.service.update("user_admin", match.id, { maxPlayers: 2 }),
      409,
      "maxPlayers cannot be lower than occupied player positions",
    );
  });

  it("detects a concurrent match update", async () => {
    const changed = setup();
    changed.matches.updatePlanning.mockResolvedValue(null);
    await expectMatchError(
      changed.service.update("user_admin", match.id, { name: "Updated match" }),
      409,
      "Match changed concurrently",
    );
  });

  it("admin deletes match and every invitation", async () => {
    const { service, matches, invitations } = setup();
    await expect(service.deleteMatch("user_admin", match.id)).resolves.toBeUndefined();
    expect(matches.serializeInvitationChange).toHaveBeenCalledWith(match.id);
    expect(invitations.deleteAllByMatch).toHaveBeenCalledWith(match.id);
    expect(matches.deleteById).toHaveBeenCalledWith(match.id, "user_admin");
  });

  it("rejects non-admin and concurrent match deletion", async () => {
    await expectMatchError(
      setup().service.deleteMatch("user_guest", match.id),
      403,
      "Only match admin can manage match",
    );
    const changed = setup();
    changed.matches.deleteById.mockResolvedValue({ deletedCount: 0 });
    await expectMatchError(
      changed.service.deleteMatch("user_admin", match.id),
      409,
      "Match changed concurrently",
    );
  });

  it("MatchError retains status and message", () => {
    expect(new MatchError(418, "tea")).toMatchObject({ status: 418, message: "tea" });
  });
});
