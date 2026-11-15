import type {
  ClaimInviteParams,
  InviteIdentity,
  InviteReviewResponse,
  TableInviteClaimReceipt,
} from "@board-game-organizer/schemas";
import {
  eventRecordVisibility,
  groupBanIsActive,
  hasOtherAcceptedTable,
  isGroupModerator,
} from "@board-game-organizer/shared";
import type { ClientSession, Db } from "mongodb";
import { CommunityError } from "../community.error";
import { RelationshipRepository } from "../contacts/relationship.repository";
import { EventRecordsRepository } from "../events/event-records.repository";
import type { EventRecordsService } from "../events/event-records.service";
import { BoardGamesRepository } from "../games/boardGames.repository";
import { GroupRecordsRepository } from "../groups/group-records.repository";
import type { GroupRecordsService } from "../groups/group-records.service";
import type { NotificationsRepository } from "../notifications/notifications.repository";
import { publicUserName } from "../users/public-user-name";
import { UsersRepository } from "../users/users.repository";
import { InvitesRepository } from "./invites.repository";

/** A token authorizes only its restricted review; ordinary private readers still require membership. */
export class TableInvitesService {
  private groups: GroupRecordsRepository;
  private events: EventRecordsRepository;
  private users: UsersRepository;
  private relationships: RelationshipRepository;
  private games: BoardGamesRepository;
  private invites: InvitesRepository;

  constructor(
    db: Db,
    session: ClientSession | undefined,
    private groupActions: GroupRecordsService,
    private eventActions: EventRecordsService,
    private notifications: NotificationsRepository,
  ) {
    this.groups = new GroupRecordsRepository(db, session);
    this.events = new EventRecordsRepository(db, session);
    this.users = new UsersRepository(db, session);
    this.relationships = new RelationshipRepository(db, session);
    this.games = new BoardGamesRepository(db, session);
    this.invites = new InvitesRepository(db, session);
  }

  private async identity(userId: string): Promise<InviteIdentity> {
    const user = await this.users.findById(userId);
    if (!user) throw new CommunityError(404, "USER_NOT_FOUND");
    return {
      id: userId,
      name: publicUserName(user),
      username: user.username ?? null,
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  private async required(token: string, userId: string) {
    const invite = await this.invites.findByToken(token);
    if (!invite) throw new CommunityError(404, "INVITE_NOT_FOUND");
    if (invite.inviterUserId === userId) throw new CommunityError(400, "OWN_INVITE");
    if (invite.status !== "pending") throw new CommunityError(409, "INVITE_ALREADY_CLAIMED");
    if (invite.expiresAt.getTime() <= Date.now()) throw new CommunityError(410, "INVITE_EXPIRED");
    if (await this.relationships.isBlocked(userId, invite.inviterUserId))
      throw new CommunityError(403, "BLOCKED_PARTICIPANT");
    return invite;
  }

  private async context(inviterUserId: string, tableId: string, target?: string, lock = true) {
    const table = await this.events.table(tableId);
    if (!table) throw new CommunityError(404, "TABLE_NOT_FOUND");
    const initial = await this.events.find(table.eventId);
    if (!initial?.groupId) throw new CommunityError(403, "TABLE_LINK_UNAVAILABLE");
    // Same Group -> Event lock order as the existing membership and registration writers.
    const group = lock
      ? await this.groups.lock(initial.groupId)
      : await this.groups.find(initial.groupId);
    const event = lock ? await this.events.lock(initial.id) : await this.events.find(initial.id);
    if (
      !group?.approved ||
      group.type !== "PRIVATE" ||
      !event ||
      event.groupId !== group.id ||
      eventRecordVisibility(event, group.type) !== "PRIVATE"
    )
      throw new CommunityError(403, "TABLE_LINK_UNAVAILABLE");
    if (event.status !== "PLANNING") throw new CommunityError(409, "EVENT_NOT_PLANNING");
    if (groupBanIsActive(await this.groups.ban(group.id, inviterUserId), Date.now()))
      throw new CommunityError(403, "GROUP_BANNED");
    if (
      group.adminUserId !== inviterUserId &&
      !isGroupModerator(await this.groups.membership(group.id, inviterUserId))
    )
      throw new CommunityError(403, "GROUP_ADMIN_REQUIRED");
    if (target) {
      if (groupBanIsActive(await this.groups.ban(group.id, target), Date.now()))
        throw new CommunityError(403, "GROUP_BANNED");
      if (await this.relationships.isBlocked(target, inviterUserId))
        throw new CommunityError(403, "BLOCKED_PARTICIPANT");
      if (await this.relationships.isBlocked(target, event.adminUserId))
        throw new CommunityError(403, "BLOCKED_PARTICIPANT");
    }
    const currentTable = await this.events.table(tableId);
    if (!currentTable || currentTable.eventId !== event.id)
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    return { group, event, table: currentTable, groupName: group.approved.name };
  }

  async create(userId: string, tableId: string) {
    await this.context(userId, tableId);
    return this.invites.create(userId, undefined, tableId);
  }

  async review(userId: string, token: string): Promise<InviteReviewResponse> {
    const invite = await this.required(token, userId);
    const inviter = await this.identity(invite.inviterUserId);
    const base = { expiresAt: invite.expiresAt.toISOString(), inviter };
    if (!invite.tableId) return { kind: "FRIEND", ...base };
    const { group, event, table, groupName } = await this.context(
      invite.inviterUserId,
      invite.tableId,
      userId,
      false,
    );
    const own = await this.events.userRegistrations(event.id, userId);
    const registration = await this.events.userRegistration(table.id, userId);
    const votes = await this.events.voter(event.id, userId);
    const games = await this.games.findByIds(table.games.map((row) => row.gameId));
    const requiresAvailability =
      registration?.status !== "ACCEPTED" &&
      (registration?.status === "PENDING" || !hasOtherAcceptedTable(own, table.id));
    return {
      kind: "TABLE",
      ...base,
      group: { id: group.id, name: groupName },
      event: {
        id: event.id,
        name: event.name,
        version: event.version,
        timeZone: event.timeZone,
        startTime: event.startTime,
        dates: event.dates,
        locations: event.locations,
        planningMode: event.planningMode,
        playerPreference: event.playerPreference,
        allowBestReduction: event.allowBestReduction,
      },
      table: {
        id: table.id,
        name: table.name,
        games: table.games,
        minPlayers: table.minPlayers,
        maxPlayers: table.maxPlayers,
        rankingEnabled: table.rankingEnabled,
        gamesDetail: games.map((game) => ({
          id: game.id,
          name: game.name,
          imageUrl: game.image ?? null,
          year: game.yearPublished ?? null,
          bayesAverage: game.bayesAverage ?? null,
          average: game.average ?? null,
          rank: game.rank ?? null,
          minPlayers: game.minPlayers ?? null,
          maxPlayers: game.maxPlayers ?? null,
          minPlayMinutes: game.minPlayMinutes ?? null,
          maxPlayMinutes: game.maxPlayMinutes ?? null,
        })),
      },
      requiresAvailability,
      ownAvailability: votes
        ? { dateVotes: votes.dateVotes, locationVotes: votes.locationVotes }
        : null,
      ownRegistration: registration
        ? {
            id: registration.id,
            status: registration.status,
            version: registration.version,
            kind: registration.kind,
            gameVotes: registration.gameVotes,
          }
        : null,
    };
  }

  async claim(
    userId: string,
    input: ClaimInviteParams,
  ): Promise<{ success: true; inviter: null; table: TableInviteClaimReceipt }> {
    if (input.consent !== true) throw new CommunityError(400, "INVITE_CONSENT_REQUIRED");
    const existing = await this.invites.findByToken(input.token);
    if (
      existing?.tableId &&
      existing.status === "claimed" &&
      existing.claimedByUserId === userId &&
      existing.tableReceipt
    )
      return { success: true, inviter: null, table: existing.tableReceipt };
    const invite = await this.required(input.token, userId);
    if (!invite.tableId) throw new CommunityError(400, "TABLE_INVITE_REQUIRED");
    const { group, event, table } = await this.context(
      invite.inviterUserId,
      invite.tableId,
      userId,
    );
    await this.identity(invite.inviterUserId);
    const previous = await this.events.userRegistration(table.id, userId);
    if (input.participation && input.participation.version !== event.version)
      throw new CommunityError(409, "EVENT_CHANGED");
    if (previous?.status !== "ACCEPTED" && !input.participation)
      throw new CommunityError(400, "TABLE_GAME_AVAILABILITY_REQUIRED");
    const wasFriend = await this.relationships.isFriend(userId, invite.inviterUserId);
    await this.relationships.becomeFriends(userId, invite.inviterUserId);
    const membership = await this.groups.membership(group.id, userId);
    if (group.adminUserId !== userId && membership?.status !== "ACCEPTED") {
      if (membership?.status === "PENDING") {
        await this.groupActions.membershipAction(
          membership.kind === "REQUEST" ? invite.inviterUserId : userId,
          group.id,
          userId,
          {
            action: membership.kind === "REQUEST" ? "approve" : "accept",
            version: membership.version,
          },
        );
      } else {
        const pending = await this.groupActions.invite(invite.inviterUserId, group.id, userId);
        await this.groupActions.membershipAction(userId, group.id, userId, {
          action: "accept",
          version: pending.version,
        });
      }
    }
    if (previous?.status === "PENDING") {
      await this.eventActions.registrationAction(userId, previous.id, {
        action: "accept",
        version: previous.version,
        participation: input.participation!,
      });
    } else if (previous?.status !== "ACCEPTED") {
      await this.eventActions.join(userId, event.id, table.id, input.participation);
    }
    const current = await this.eventActions.tableDetail(userId, event.id, table.id);
    if (current.myPosition !== "SEATED" && current.myPosition !== "WAITING")
      throw new CommunityError(409, "REGISTRATION_CHANGED");
    const receipt: TableInviteClaimReceipt = {
      groupId: group.id,
      eventId: event.id,
      tableId: table.id,
      position: current.myPosition,
    };
    if (!(await this.invites.claim(input.token, userId, receipt)))
      throw new CommunityError(409, "INVITE_ALREADY_CLAIMED");
    if (!wasFriend)
      await this.notifications.notify({
        kind: "friend_request_accepted",
        recipientUserId: invite.inviterUserId,
        actorUserId: userId,
      });
    return { success: true, inviter: null, table: receipt };
  }
}
