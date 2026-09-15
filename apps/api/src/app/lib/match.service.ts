import type {
  CreateMatchInput,
  Match,
  MatchInvitation,
  MatchResponse,
  UpdateMatchInput,
} from "@board-game-organizer/schemas";
import { MongoServerError } from "mongodb";
import type { BoardGamesRepository } from "@/app/lib/boardGames.repository";
import type { MatchInvitationsRepository } from "@/app/lib/match-invitations.repository";
import type { MatchesRepository } from "@/app/lib/matches.repository";
import type { NotificationsRepository } from "@/app/lib/notifications.repository";
import type { RelationshipRepository } from "@/app/lib/relationship.repository";
import type { UsersRepository } from "@/app/lib/users.repository";

export class MatchError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class MatchService {
  constructor(
    private matches: MatchesRepository,
    private invitations: MatchInvitationsRepository,
    private users: UsersRepository,
    private relationships: RelationshipRepository,
    private games: BoardGamesRepository,
    private notifications?: NotificationsRepository,
  ) {}

  async requireCurrentUser(userId: string) {
    if (!(await this.users.findById(userId))) {
      throw new MatchError(409, "User profile not synchronized");
    }
  }

  private async requireMatch(matchId: string) {
    const match = await this.matches.findById(matchId);
    if (!match) throw new MatchError(404, "Match not found");
    return match;
  }

  private requirePlanning(match: Match) {
    if (match.status !== "PLANNING") {
      throw new MatchError(409, "Match is no longer in planning");
    }
  }

  private requireAdmin(match: Match, userId: string) {
    if (match.clerkId !== userId) {
      throw new MatchError(403, "Only match admin can manage match");
    }
  }

  private async validateInvitee(adminUserId: string, inviteeUserId: string) {
    if (adminUserId === inviteeUserId) {
      throw new MatchError(400, "Match admin cannot invite themselves");
    }
    if (!(await this.users.findById(inviteeUserId))) {
      throw new MatchError(404, "User not found");
    }
    if (await this.relationships.isBlocked(adminUserId, inviteeUserId)) {
      throw new MatchError(404, "User not found");
    }
    if (!(await this.relationships.isFriend(adminUserId, inviteeUserId))) {
      throw new MatchError(400, "Invited users must be friends of match admin");
    }
  }

  private toResponse(match: Match, invitations: MatchInvitation[]): MatchResponse {
    return {
      id: match.id,
      adminUserId: match.clerkId,
      name: match.name,
      dates: match.dates,
      minPlayers: match.minPlayers,
      maxPlayers: match.maxPlayers,
      invitedUserIds: invitations.map((invitation) => invitation.inviteeUserId),
      gameIds: match.gameIds,
      status: match.status,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      invitations,
    };
  }

  async create(userId: string, input: CreateMatchInput): Promise<MatchResponse> {
    if (input.invitedUserIds.length > input.maxPlayers - 1) {
      throw new MatchError(400, "Invitations exceed available player positions");
    }
    const existingGameIds = await this.games.findExistingIds(input.gameIds);
    if (existingGameIds.length !== input.gameIds.length) {
      throw new MatchError(400, "One or more games do not exist");
    }
    for (const inviteeUserId of input.invitedUserIds) {
      await this.validateInvitee(userId, inviteeUserId);
    }

    const match = await this.matches.create({
      clerkId: userId,
      name: input.name,
      dates: input.dates,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      gameIds: input.gameIds,
    });
    const invitations = await this.invitations.createMany(match.id, userId, input.invitedUserIds);
    await this.notifications?.notifyMany(
      input.invitedUserIds.map((recipientUserId) => ({
        kind: "match_invitation" as const,
        recipientUserId,
        actorUserId: userId,
        matchName: match.name,
      })),
    );
    return this.toResponse(match, invitations);
  }

  async list(userId: string): Promise<MatchResponse[]> {
    const receivedInvitations = await this.invitations.listByInvitee(userId);
    const matches = await this.matches.listAccessible(
      userId,
      receivedInvitations.map((invitation) => invitation.matchId),
    );
    const invitations = await this.invitations.listByMatchIds(matches.map((match) => match.id));
    return matches.map((match) =>
      this.toResponse(
        match,
        invitations.filter((invitation) => invitation.matchId === match.id),
      ),
    );
  }

  async detail(userId: string, matchId: string): Promise<MatchResponse> {
    const match = await this.requireMatch(matchId);
    const invitations = await this.invitations.listByMatch(matchId);
    if (
      match.clerkId !== userId &&
      !invitations.some((invitation) => invitation.inviteeUserId === userId)
    ) {
      throw new MatchError(404, "Match not found");
    }
    return this.toResponse(match, invitations);
  }

  async listInvitations(userId: string, matchId: string) {
    const match = await this.requireMatch(matchId);
    this.requireAdmin(match, userId);
    return this.invitations.listByMatch(matchId);
  }

  async invite(userId: string, matchId: string, inviteeUserId: string) {
    const match = await this.requireMatch(matchId);
    this.requireAdmin(match, userId);
    this.requirePlanning(match);
    await this.validateInvitee(userId, inviteeUserId);
    await this.matches.serializeInvitationChange(match.id);

    if (await this.invitations.findByMatchAndInvitee(matchId, inviteeUserId)) {
      throw new MatchError(409, "User is already invited");
    }
    if ((await this.invitations.countByMatch(matchId)) >= match.maxPlayers - 1) {
      throw new MatchError(409, "Match has no available invitation positions");
    }

    try {
      const invitation = await this.invitations.create(matchId, userId, inviteeUserId);
      await this.notifications?.notify({
        kind: "match_invitation",
        recipientUserId: inviteeUserId,
        actorUserId: userId,
        matchName: match.name,
      });
      return invitation;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new MatchError(409, "User is already invited");
      }
      throw error;
    }
  }

  async respond(userId: string, invitationId: string, decision: "accept" | "decline") {
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation || invitation.inviteeUserId !== userId) {
      throw new MatchError(404, "Invitation not found");
    }
    const match = await this.requireMatch(invitation.matchId);
    this.requirePlanning(match);
    if (invitation.status !== "PENDING") {
      throw new MatchError(409, "Invitation already answered");
    }
    const updated = await this.invitations.respond(
      invitation.id,
      decision === "accept" ? "ACCEPTED" : "DECLINED",
    );
    if (!updated) throw new MatchError(409, "Invitation changed concurrently");
    await this.notifications?.notify({
      kind: decision === "accept" ? "match_invitation_accepted" : "match_invitation_declined",
      recipientUserId: match.clerkId,
      actorUserId: userId,
      matchName: match.name,
    });
    return updated;
  }

  async leave(userId: string, invitationId: string) {
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation || invitation.inviteeUserId !== userId) {
      throw new MatchError(404, "Invitation not found");
    }
    const match = await this.requireMatch(invitation.matchId);
    this.requirePlanning(match);
    if (invitation.status !== "ACCEPTED") {
      throw new MatchError(409, "Only accepted participants can leave");
    }
    const result = await this.invitations.deleteAccepted(invitation.id, userId);
    if (result.deletedCount === 0) throw new MatchError(409, "Invitation changed concurrently");
  }

  async removeInvitation(userId: string, matchId: string, invitationId: string) {
    const match = await this.requireMatch(matchId);
    this.requireAdmin(match, userId);
    this.requirePlanning(match);
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation || invitation.matchId !== matchId) {
      throw new MatchError(404, "Invitation not found");
    }
    await this.matches.serializeInvitationChange(match.id);
    const result = await this.invitations.deleteByIdForMatch(invitationId, matchId);
    if (result.deletedCount === 0) throw new MatchError(409, "Invitation changed concurrently");
  }

  async update(userId: string, matchId: string, input: UpdateMatchInput) {
    const match = await this.requireMatch(matchId);
    this.requireAdmin(match, userId);
    this.requirePlanning(match);

    const minPlayers = input.minPlayers ?? match.minPlayers;
    const maxPlayers = input.maxPlayers ?? match.maxPlayers;
    if (maxPlayers < minPlayers) {
      throw new MatchError(400, "maxPlayers must be greater than or equal to minPlayers");
    }
    if (input.gameIds) {
      const existingGameIds = await this.games.findExistingIds(input.gameIds);
      if (existingGameIds.length !== input.gameIds.length) {
        throw new MatchError(400, "One or more games do not exist");
      }
    }
    if (input.maxPlayers !== undefined) {
      await this.matches.serializeInvitationChange(match.id);
      if ((await this.invitations.countByMatch(match.id)) > maxPlayers - 1) {
        throw new MatchError(409, "maxPlayers cannot be lower than occupied player positions");
      }
    }

    const updated = await this.matches.updatePlanning(match.id, userId, input);
    if (!updated) throw new MatchError(409, "Match changed concurrently");
    const invitations = await this.invitations.listByMatch(match.id);
    await this.notifications?.notifyMany(
      invitations
        .filter((invitation) => invitation.status !== "DECLINED")
        .map((invitation) => ({
          kind: "match_updated" as const,
          recipientUserId: invitation.inviteeUserId,
          actorUserId: userId,
          matchName: updated.name,
        })),
    );
    return this.toResponse(updated, invitations);
  }

  async deleteMatch(userId: string, matchId: string) {
    const match = await this.requireMatch(matchId);
    this.requireAdmin(match, userId);
    await this.matches.serializeInvitationChange(match.id);
    await this.invitations.deleteAllByMatch(match.id);
    const result = await this.matches.deleteById(match.id, userId);
    if (result.deletedCount === 0) throw new MatchError(409, "Match changed concurrently");
  }
}
