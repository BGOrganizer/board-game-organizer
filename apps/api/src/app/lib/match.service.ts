import type {
  CreateMatchInput,
  Match,
  MatchDetailResponse,
  MatchInvitation,
  MatchResponse,
  SetMatchChoiceInput,
  UpdateMatchInput,
} from "@board-game-organizer/schemas";
import { MongoServerError } from "mongodb";
import { gameThumbnail } from "@/app/lib/bgg";
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

  private visibleInvitations(
    match: Match,
    userId: string,
    invitations: MatchInvitation[],
  ): MatchInvitation[] {
    if (match.clerkId === userId) return invitations;
    return invitations.filter(
      (invitation) => invitation.status === "ACCEPTED" || invitation.inviteeUserId === userId,
    );
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
      receivedInvitations
        .filter((invitation) => invitation.status !== "DECLINED")
        .map((invitation) => invitation.matchId),
    );
    const invitations = await this.invitations.listByMatchIds(matches.map((match) => match.id));
    return matches.map((match) => {
      const matchInvitations = invitations.filter((invitation) => invitation.matchId === match.id);
      return this.toResponse(match, this.visibleInvitations(match, userId, matchInvitations));
    });
  }

  async detail(userId: string, matchId: string): Promise<MatchDetailResponse> {
    const match = await this.requireMatch(matchId);
    const invitations = await this.invitations.listByMatch(matchId);
    if (
      match.clerkId !== userId &&
      !invitations.some((invitation) => invitation.inviteeUserId === userId)
    ) {
      throw new MatchError(404, "Match not found");
    }

    const visibleInvitations = this.visibleInvitations(match, userId, invitations);
    const playerInvitations =
      match.clerkId === userId
        ? visibleInvitations
        : visibleInvitations.filter((invitation) => invitation.status === "ACCEPTED");

    // Keep session-bound reads sequential: MongoDB sessions cannot run operations concurrently.
    const users = await this.users.findByIds([
      match.clerkId,
      ...playerInvitations.map((invitation) => invitation.inviteeUserId),
    ]);
    const games = await this.games.findByIds(match.gameIds);
    const usersById = new Map(users.map((user) => [user.clerkId, user]));
    const gamesById = new Map(games.map((game) => [game.id, game]));

    const administrator = usersById.get(match.clerkId);

    return {
      match: this.toResponse(match, visibleInvitations),
      choices: {
        dates: match.choices?.[userId]?.dates ?? {},
        games: match.choices?.[userId]?.games ?? {},
      },
      administrator: {
        id: match.clerkId,
        name: administrator?.name ?? match.clerkId,
        email: administrator?.email ?? null,
        avatarUrl: administrator?.avatarUrl ?? null,
      },
      invitedPlayers: playerInvitations.map((invitation) => {
        const user = usersById.get(invitation.inviteeUserId);
        return {
          id: invitation.inviteeUserId,
          name: user?.name ?? invitation.inviteeUserId,
          email: user?.email ?? null,
          avatarUrl: user?.avatarUrl ?? null,
          invitation,
        };
      }),
      games: match.gameIds.flatMap((id) => {
        const game = gamesById.get(id);
        return game
          ? [
              {
                id: game.id,
                name: game.name,
                yearPublished: game.yearPublished ?? null,
                thumbnail:
                  gameThumbnail(game.thumbnail ?? null) ?? gameThumbnail(game.image ?? null),
              },
            ]
          : [];
      }),
    };
  }

  async setChoice(userId: string, matchId: string, input: SetMatchChoiceInput) {
    const match = await this.requireMatch(matchId);
    if (match.clerkId !== userId) {
      const invitations = await this.invitations.listByMatch(matchId);
      if (
        !invitations.some(
          (invitation) => invitation.inviteeUserId === userId && invitation.status === "ACCEPTED",
        )
      ) {
        throw new MatchError(403, "Only accepted participants can choose");
      }
    }
    if (
      input.kind === "dates"
        ? !match.dates.includes(input.itemId)
        : !match.gameIds.includes(input.itemId)
    )
      throw new MatchError(409, "Match option no longer exists");
    if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new MatchError(403, "Invalid user id");
    const updated = await this.matches.setChoice(matchId, userId, input);
    if (updated.matchedCount === 0) throw new MatchError(409, "Match option no longer exists");
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
    await this.matches.clearChoices(match.id, userId);
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
    await this.matches.clearChoices(match.id, invitation.inviteeUserId);
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

    if (input.invitedUserIds || input.maxPlayers !== undefined) {
      await this.matches.serializeInvitationChange(match.id);
    }
    let invitations = await this.invitations.listByMatch(match.id);
    const finalInviteeIds =
      input.invitedUserIds ?? invitations.map((invitation) => invitation.inviteeUserId);
    if (finalInviteeIds.length > maxPlayers - 1) {
      throw new MatchError(
        input.invitedUserIds ? 400 : 409,
        input.invitedUserIds
          ? "Invitations exceed available player positions"
          : "maxPlayers cannot be lower than occupied player positions",
      );
    }
    if (input.invitedUserIds) {
      for (const inviteeUserId of input.invitedUserIds) {
        await this.validateInvitee(userId, inviteeUserId);
      }
    }

    const { invitedUserIds: _invitedUserIds, ...updates } = input;
    const updated = await this.matches.updatePlanning(match.id, userId, updates);
    if (!updated) throw new MatchError(409, "Match changed concurrently");
    if (match.choices && (input.dates || input.gameIds)) {
      await this.matches.clearRemovedOptionChoices(
        match,
        match.dates.filter((date) => input.dates && !input.dates.includes(date)),
        match.gameIds.filter((id) => input.gameIds && !input.gameIds.includes(id)),
      );
    }

    const addedInviteeIds = new Set<string>();
    if (input.invitedUserIds) {
      const selectedIds = new Set(input.invitedUserIds);
      const retainedIds = new Set(
        invitations
          .filter(
            (invitation) =>
              selectedIds.has(invitation.inviteeUserId) && invitation.status !== "DECLINED",
          )
          .map((invitation) => invitation.inviteeUserId),
      );
      for (const invitation of invitations) {
        if (!retainedIds.has(invitation.inviteeUserId)) {
          await this.invitations.deleteByIdForMatch(invitation.id, match.id);
          await this.matches.clearChoices(match.id, invitation.inviteeUserId);
        }
      }
      const newInviteeIds = input.invitedUserIds.filter((id) => !retainedIds.has(id));
      for (const id of newInviteeIds) addedInviteeIds.add(id);
      await this.invitations.createMany(match.id, userId, newInviteeIds);
      invitations = await this.invitations.listByMatch(match.id);
      await this.notifications?.notifyMany(
        newInviteeIds.map((recipientUserId) => ({
          kind: "match_invitation" as const,
          recipientUserId,
          actorUserId: userId,
          matchName: updated.name,
        })),
      );
    }

    await this.notifications?.notifyMany(
      invitations
        .filter(
          (invitation) =>
            invitation.status !== "DECLINED" && !addedInviteeIds.has(invitation.inviteeUserId),
        )
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
