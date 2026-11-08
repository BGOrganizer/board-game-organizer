import { createHash, randomUUID } from "node:crypto";
import type {
  ChangeEventStateInput,
  ChangeEventVoteInput,
  CommunityNotificationKind,
  CreatePlannedEventInput,
  DecideTableRegistrationInput,
  DeletedPlannedEventResponse,
  DeletePlannedRecordInput,
  EditPlannedEventInput,
  EventParticipantResponse,
  EventParticipantsResponse,
  EventProposal,
  EventProposalPayload,
  EventProposalResponse,
  EventProposalsResponse,
  EventRecord,
  FinalizeEventInput,
  FinalizeSavedEventInput,
  GroupRecord,
  JoinTableInput,
  NotificationItem,
  PlannedEventResponse,
  PlannedTableInput,
  PlannedTableResponse,
  ReviewEventProposalInput,
  ReviewEventProposalResponse,
  SaveTableResultInput,
  SubmitEventProposalInput,
  TableInviteeResponse,
  TableLeaderboardResponse,
  TableRecord,
  TableRegistration,
  TableResultsInput,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { MAX_EVENT_OPTIONS, notificationItemId } from "@board-game-organizer/schemas";
import {
  banHasProtectedParticipation,
  calculateEventAgreement,
  type EventAgreement,
  eventAvailabilityVoteIsAllowed,
  eventDateWall,
  eventJoinAvailabilityIsComplete,
  eventLocalDateTime,
  eventLocalToIso,
  eventNotificationItems,
  eventOptionsRequireVote,
  eventOptionVotesAreComplete,
  eventProposalEdit,
  eventRecordCapabilities,
  eventRecordSchedulePreview,
  eventRecordVisibility,
  eventVoteCounts,
  eventVotingChoices,
  gamePlayerBounds,
  groupBanIsActive,
  hasOtherAcceptedTable,
  hasPublicTableConflict,
  isGroupModerator,
  isPersonalTableParticipant,
  normalizeMatchScore,
  personalTableSection,
  plannedTableInterval,
  projectReservedPlaces,
  publicBookingIsClosed,
  rankMatchResults,
  removedNotificationItems,
  tableRegistrationPosition,
} from "@board-game-organizer/shared";
import { CommunityError } from "../community.error";
import type { RelationshipRepository } from "../contacts/relationship.repository";
import type { BoardGamesRepository } from "../games/boardGames.repository";
import type { GroupRecordsRepository } from "../groups/group-records.repository";
import { verifyCommunityLocation } from "../locations/community-location";
import { locationTimeZone } from "../locations/location-time-zone";
import type { NotificationsRepository } from "../notifications/notifications.repository";
import type { RatingsRepository } from "../ratings/ratings.repository";
import { publicUserName } from "../users/public-user-name";
import type { UsersRepository } from "../users/users.repository";
import type { EventRecordPage, EventRecordsRepository } from "./event-records.repository";
import { sharedEventResults, sharedTableResults } from "./event-results-projection";

export class EventRecordsService {
  constructor(
    private events: EventRecordsRepository,
    private groups: GroupRecordsRepository,
    private games: BoardGamesRepository,
    private users: UsersRepository,
    private relationships: RelationshipRepository,
    private notifications: NotificationsRepository,
    private ratings: RatingsRepository,
  ) {}
  private async group(id: string, lock = false) {
    const group = lock ? await this.groups.lock(id) : await this.groups.find(id);
    if (!group?.approved) throw new CommunityError(404, "GROUP_NOT_FOUND");
    return group;
  }
  private async member(group: GroupRecord, userId: string) {
    if (groupBanIsActive(await this.groups.ban(group.id, userId), Date.now()))
      throw new CommunityError(403, "GROUP_BANNED");
    if (
      group.adminUserId !== userId &&
      (await this.groups.membership(group.id, userId))?.status !== "ACCEPTED"
    )
      throw new CommunityError(403, "GROUP_MEMBER_REQUIRED");
  }
  private async manager(event: EventRecord, group: GroupRecord | null, userId: string) {
    if (!group) return event.adminUserId === userId;
    if (groupBanIsActive(await this.groups.ban(group.id, userId), Date.now())) return false;
    return (
      group.adminUserId === userId ||
      isGroupModerator(await this.groups.membership(group.id, userId))
    );
  }
  private async resultFriend(event: EventRecord, userId: string) {
    if (
      !event.groupId ||
      event.status !== "TERMINATED" ||
      !event.confirmed ||
      !event.shareResultsWithFriends
    )
      return false;
    if (await this.relationships.isBlocked(userId, event.adminUserId)) return false;
    const tables = await this.events.allTables(event.id);
    const players = new Set(
      tables.filter((table) => table.results).flatMap((table) => table.confirmed?.playerIds ?? []),
    );
    for (const player of players) {
      if (player === userId) return true;
      if (
        !(await this.relationships.isBlocked(userId, player)) &&
        (await this.relationships.isFriend(userId, player))
      )
        return true;
    }
    return false;
  }
  private async context(
    userId: string,
    id: string,
    lock = false,
    admin = false,
    publicRead = false,
    publicEnrollment = false,
  ) {
    const initial = await this.events.find(id);
    if (!initial || !["PLANNING", "CONFIRMED", "TERMINATED"].includes(initial.status))
      throw new CommunityError(404, "EVENT_NOT_FOUND");
    const group = initial.groupId ? await this.group(initial.groupId, lock) : null;
    const event = lock ? await this.events.lock(id) : initial;
    if (!event) throw new CommunityError(404, "EVENT_NOT_FOUND");
    const own = await this.events.userRegistrations(id, userId);
    let readOnly = false,
      sharedResultsOnly = false,
      outsideGroup = false;
    if (group) {
      if (groupBanIsActive(await this.groups.ban(group.id, userId), Date.now()))
        throw new CommunityError(403, "GROUP_BANNED");
      const member =
        group.adminUserId === userId ||
        (await this.groups.membership(group.id, userId))?.status === "ACCEPTED";
      if (!member) {
        outsideGroup = true;
        if (await this.relationships.isBlocked(userId, event.adminUserId))
          throw new CommunityError(404, "EVENT_NOT_FOUND");
        const participant = own.some((row) => row.status === "ACCEPTED");
        if (
          eventRecordVisibility(event, group.type) === "PUBLIC" &&
          (publicRead || publicEnrollment || participant)
        )
          readOnly = !participant;
        else if (publicRead && (await this.resultFriend(event, userId))) {
          readOnly = true;
          sharedResultsOnly = true;
        } else throw new CommunityError(403, "GROUP_MEMBER_REQUIRED");
      }
    }
    if (admin && !(await this.manager(event, group, userId)))
      throw new CommunityError(403, "EVENT_ADMIN_REQUIRED");
    if (!group && event.adminUserId !== userId && !own.length)
      throw new CommunityError(404, "EVENT_NOT_FOUND");
    return { event, group, own, readOnly, sharedResultsOnly, outsideGroup };
  }
  /** Feed reads share the exact detail authorization, without expensive detail projections. */
  async activityResource(userId: string, eventId: string, tableId?: string, feed = false) {
    const { event, group, sharedResultsOnly } = await this.context(
      userId,
      eventId,
      false,
      false,
      true,
    );
    const privateFeed =
      feed && eventRecordVisibility(event, group?.type ?? null) === "PRIVATE" && Boolean(group);
    if (privateFeed && !(await this.resultFriend(event, userId)))
      throw new CommunityError(404, "EVENT_NOT_FOUND");
    if (!tableId)
      return {
        name: event.name,
        href: `/events/${eventId}`,
        ...(privateFeed || sharedResultsOnly
          ? { sharedResultsOnly: true }
          : event.groupId
            ? { groupId: event.groupId }
            : {}),
      };
    const table = await this.events.table(tableId);
    if (
      !table ||
      table.eventId !== eventId ||
      ((privateFeed || sharedResultsOnly) && (!table.confirmed || !table.results))
    )
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    return {
      name: table.name,
      eventContext: event.name,
      href: `/events/${eventId}/tables/${tableId}`,
      ...(privateFeed || sharedResultsOnly
        ? { sharedResultsOnly: true }
        : event.groupId
          ? { groupId: event.groupId }
          : {}),
    };
  }
  private open(event: EventRecord, group: GroupRecord | null) {
    if (event.status !== "PLANNING") throw new CommunityError(409, "EVENT_NOT_PLANNING");
    if (publicBookingIsClosed(event, group?.type ?? null, Date.now()))
      throw new CommunityError(409, "EVENT_BOOKING_CLOSED");
  }
  private async notify(
    kind: CommunityNotificationKind,
    event: EventRecord,
    actor: string,
    recipients: string[],
    tableId?: string,
    attentionItems?: NotificationItem[],
  ) {
    await this.notifications.notifyMany(
      [...new Set(recipients)].map((recipientUserId) => ({
        kind,
        actorUserId: actor,
        recipientUserId,
        resourceName: event.name,
        resourceHref: tableId ? `/events/${event.id}/tables/${tableId}` : `/events/${event.id}`,
        ...(attentionItems?.length
          ? { attentionItems }
          : kind === "table_invitation" && tableId
            ? {
                attentionItems: [
                  {
                    id: notificationItemId(tableId, "invitation", undefined, "table"),
                    revision: event.version,
                    eventId: event.id,
                    ...(event.groupId ? { groupId: event.groupId } : {}),
                    tableIds: [tableId],
                  },
                ],
              }
            : {}),
      })),
    );
  }
  private async agreement(
    event: EventRecord,
    group: GroupRecord | null,
    tables?: TableRecord[],
    knownRegistrations?: TableRegistration[],
  ) {
    const selectedTables = tables ?? (await this.events.allTables(event.id));
    const registrations = knownRegistrations ?? (await this.events.allRegistrations(event.id));
    const voters = await this.events.allVotes(event.id);
    const catalog = await this.games.findByIds([
      ...new Set(selectedTables.flatMap((table) => table.games.map((game) => game.gameId))),
    ]);
    const playerBounds = Object.fromEntries(
      catalog.flatMap((game) => {
        const bounds = gamePlayerBounds([game]);
        return bounds ? [[game.id, bounds]] : [];
      }),
    );
    return calculateEventAgreement({
      dateIds: event.dates.map((row) => row.id),
      locationIds: event.locations.map((row) => row.id),
      fixedDateAndLocation: group?.type === "PUBLIC",
      tables: selectedTables.map((table) => ({
        id: table.id,
        minPlayers: table.minPlayers,
        maxPlayers: table.maxPlayers,
        gameIds: table.games.map((game) => game.gameId),
        gamePlayerBounds: playerBounds,
        fixedGame: group?.type === "PUBLIC" && table.games.length === 1,
      })),
      registrations: registrations.map((row) => ({
        id: row.id,
        tableId: row.tableId,
        userId: row.userId,
        status: row.status === "ACCEPTED" ? "ACCEPTED" : "PENDING",
        priorityAt: row.priorityAt,
        sequence: row.sequence,
      })),
      dateVotes: Object.fromEntries(voters.map((row) => [row.userId, row.dateVotes])),
      locationVotes: Object.fromEntries(voters.map((row) => [row.userId, row.locationVotes])),
      gameVotes: Object.fromEntries(
        selectedTables.map((table) => [
          table.id,
          Object.fromEntries(
            registrations
              .filter((row) => row.tableId === table.id)
              .map((row) => [row.userId, row.gameVotes]),
          ),
        ]),
      ),
    });
  }
  private async saveSituation(event: EventRecord, group: GroupRecord | null, actor: string) {
    const plan = await this.agreement(event, group);
    if (plan.situationKey !== event.lastNotifiedSituation) {
      event.lastNotifiedSituation = plan.situationKey;
      await this.events.save(event);
      await this.notify(
        plan.agreed ? "event_agreement_ready" : "event_agreement_blocked",
        event,
        actor,
        group ? await this.groups.managerIds(group) : [event.adminUserId],
      );
    }
    return plan;
  }
  private preview(plan: EventAgreement): NonNullable<PlannedEventResponse["agreement"]> {
    return {
      agreed: plan.agreed,
      ...(plan.agreed ? { dateId: plan.dateId, locationId: plan.locationId } : {}),
      tables: plan.agreed
        ? plan.includedTables.map((row) => ({
            tableId: row.tableId,
            gameId: row.gameId,
            participantIds: row.participantIds,
          }))
        : [],
      reasons: plan.tables
        .filter((row) => row.reason)
        .map((row) => ({ tableId: row.tableId, code: row.reason as string })),
    };
  }
  private async response(
    event: EventRecord,
    group: GroupRecord | null,
    userId: string,
    own: TableRegistration[],
    detail = false,
    readOnly = false,
  ): Promise<PlannedEventResponse> {
    const tables = await this.events.allTables(event.id);
    const counts = await this.events.counts(event, tables);
    const hasAccepted = own.some((row) => row.status === "ACCEPTED");
    const registrations =
      detail || (hasAccepted && event.status === "PLANNING")
        ? await this.events.allRegistrations(event.id)
        : [];
    const plan =
      event.status === "PLANNING" && (detail || hasAccepted)
        ? await this.agreement(event, group, tables, registrations)
        : undefined;
    const positioned = own.map((row) => {
      const table = tables.find((table) => table.id === row.tableId);
      if (!table || row.status !== "ACCEPTED") return row;
      const selected = plan?.agreed
        ? plan.includedTables.find((entry) => entry.tableId === table.id)?.participantIds
        : undefined;
      const seats =
        event.status === "PLANNING"
          ? projectReservedPlaces(
              registrations
                .filter((entry) => entry.tableId === table.id)
                .map((entry) => ({
                  ...entry,
                  status:
                    entry.status === "ACCEPTED" ? ("ACCEPTED" as const) : ("PENDING" as const),
                })),
              table.maxPlayers,
              selected,
            ).seated.map((entry) => entry.id)
          : [];
      return {
        ...row,
        position:
          tableRegistrationPosition(event.status, row, seats, table.confirmed?.playerIds ?? []) ??
          undefined,
      };
    });
    const myVotes = detail ? await this.events.voter(event.id, userId) : null;
    let voteCounts: PlannedEventResponse["voteCounts"];
    if (detail) {
      const voters = await this.events.allVotes(event.id);
      const ids = [
        ...new Set(
          registrations.filter((row) => row.status === "ACCEPTED").map((row) => row.userId),
        ),
      ];
      const byUser = new Map(voters.map((row) => [row.userId, row]));
      voteCounts = {
        dates: eventVoteCounts(
          event.dates.map((row) => row.id),
          ids.map((id) => byUser.get(id)?.dateVotes ?? {}),
        ),
        locations: eventVoteCounts(
          event.locations.map((row) => row.id),
          ids.map((id) => byUser.get(id)?.locationVotes ?? {}),
        ),
      };
    }
    const {
      lastNotifiedSituation: _situation,
      nextPriority: _priority,
      nextTableOrder: _order,
      ...visible
    } = event;
    const myDemonstrator = tables.some(
      (table) =>
        table.demonstratorUserId === userId &&
        (event.status === "PLANNING" || Boolean(table.confirmed)),
    );
    const canManage = !readOnly && (await this.manager(event, group, userId));
    const role: PlannedEventResponse["role"] = canManage
      ? "admin"
      : own.some((row) => row.status === "ACCEPTED")
        ? "participant"
        : myDemonstrator
          ? "demonstrator"
          : own.some((row) => row.status === "PENDING")
            ? "invited"
            : "member";
    return {
      ...visible,
      visibility: eventRecordVisibility(event, group?.type ?? null),
      locations: visible.locations.map((location) => ({
        ...location,
        timeZone: locationTimeZone(location),
      })),
      ...eventRecordCapabilities(
        event,
        group?.type ?? null,
        userId,
        Boolean(group) && !readOnly,
        readOnly ? [] : own,
        Date.now(),
        canManage,
      ),
      canManage,
      managementRole: canManage
        ? (group?.adminUserId ?? event.adminUserId) === userId
          ? "admin"
          : "moderator"
        : null,
      readOnly,
      canProposeDates:
        !canManage &&
        !readOnly &&
        group?.type === "PRIVATE" &&
        event.status === "PLANNING" &&
        Boolean(event.allowParticipantDates) &&
        positioned.some(
          (r) => r.status === "ACCEPTED" && "position" in r && r.position === "SEATED",
        ),
      canProposeLocations:
        !canManage &&
        !readOnly &&
        group?.type === "PRIVATE" &&
        event.status === "PLANNING" &&
        Boolean(event.allowParticipantLocations) &&
        positioned.some(
          (r) => r.status === "ACCEPTED" && "position" in r && r.position === "SEATED",
        ),
      ...(readOnly
        ? {
            canEdit: false,
            canInvite: false,
            canRegister:
              eventRecordVisibility(event, group?.type ?? null) === "PUBLIC" &&
              event.status === "PLANNING" &&
              !publicBookingIsClosed(event, group?.type ?? null, Date.now()),
            canVote: false,
            canConfirm: false,
            canReplan: false,
            canFinalize: false,
          }
        : {}),
      ...counts,
      ...(!readOnly && canManage && event.status === "CONFIRMED"
        ? {
            resultsReady:
              tables.some((table) => table.confirmed) &&
              tables
                .filter((table) => table.confirmed)
                .every((table) => Boolean(table.resultDraft)),
          }
        : {}),
      groupName: group?.approved?.name ?? null,
      groupType: group?.type ?? null,
      role: readOnly ? "viewer" : role,
      myRegistrations: readOnly ? [] : positioned,
      myDemonstrator: !readOnly && myDemonstrator,
      ...(detail && !readOnly
        ? {
            voteCounts,
            myVotes: {
              dateVotes: myVotes?.dateVotes ?? {},
              locationVotes: myVotes?.locationVotes ?? {},
            },
          }
        : {}),
      ...(detail && plan && !readOnly ? { agreement: this.preview(plan) } : {}),
    };
  }
  async detail(userId: string, id: string) {
    const { event, group, own, readOnly, sharedResultsOnly } = await this.context(
      userId,
      id,
      false,
      false,
      true,
    );
    const response = await this.response(event, group, userId, own, true, readOnly);
    return sharedResultsOnly
      ? sharedEventResults(response, await this.events.allTables(id))
      : response;
  }
  async proposalDetail(
    userId: string,
    id: string,
    proposalId: string,
  ): Promise<ReviewEventProposalResponse> {
    const { event, group } = await this.context(userId, id, true);
    if (group?.type !== "PRIVATE") throw new CommunityError(403, "PROPOSALS_PRIVATE_GROUP_ONLY");
    const row = await this.events.proposal(proposalId);
    if (
      !row ||
      row.eventId !== id ||
      (row.userId !== userId && !(await this.manager(event, group, userId)))
    )
      throw new CommunityError(404, "PROPOSAL_NOT_FOUND");
    return this.proposalReceipt(userId, row, await this.manager(event, group, userId));
  }
  private async proposalResponse(row: EventProposal): Promise<EventProposalResponse> {
    const { requestHash: _hash, payloadKey: _key, ...visible } = row;
    const user = await this.users.findById(row.userId);
    const [game] =
      row.payload.kind === "game" ? await this.games.findByIds([row.payload.gameId]) : [];
    return {
      ...visible,
      authorName: user?.username || publicUserName(user),
      ...(game ? { game: { id: game.id, name: game.name, imageUrl: game.image ?? null } } : {}),
    };
  }
  private proposalGroupRevision(rows: EventProposal[]) {
    return createHash("sha256")
      .update(
        JSON.stringify(
          rows
            .filter((p) => p.status === "PENDING")
            .map((p) => [p.id, p.version])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        ),
      )
      .digest("hex");
  }
  private async groupedGameProposal(row: EventProposal, members: EventProposal[]) {
    const profiles = await this.users.findByIds([...new Set(members.map((p) => p.userId))]);
    const names = new Map(profiles.map((p) => [p.clerkId, p.username || publicUserName(p)]));
    return {
      ...(await this.proposalResponse(row)),
      groupRevision: this.proposalGroupRevision(members),
      gameSuggestions: members.map((p) => ({
        id: p.id,
        userId: p.userId,
        authorName: names.get(p.userId) ?? publicUserName(null),
        version: p.version,
        status: p.status,
      })),
    };
  }
  private async proposalReceipt(
    userId: string,
    row: EventProposal,
    manager = true,
    event?: PlannedEventResponse,
  ): Promise<ReviewEventProposalResponse> {
    const batch =
      manager && row.reviewBatchId
        ? await this.events.proposalBatch(row.eventId, row.reviewBatchId)
        : [];
    const proposals: EventProposalResponse[] = [];
    for (const member of batch) proposals.push(await this.proposalResponse(member));
    return {
      proposal: await this.proposalResponse(row),
      ...(proposals.length ? { proposals } : {}),
      event: event ?? (await this.detail(userId, row.eventId)),
    };
  }
  async proposalPickerExclusions(userId: string, id: string, tableId: string) {
    const { event, group } = await this.context(userId, id, true);
    this.open(event, group);
    if (group?.type !== "PRIVATE") throw new CommunityError(403, "PROPOSALS_PRIVATE_GROUP_ONLY");
    if (await this.manager(event, group, userId))
      throw new CommunityError(403, "PROPOSAL_MANAGER_CANNOT_SUBMIT");
    const table = await this.events.table(tableId);
    if (!table || table.eventId !== id) throw new CommunityError(404, "TABLE_NOT_FOUND");
    if (!table.allowParticipantGames) throw new CommunityError(403, "PROPOSALS_DISABLED");
    await this.assertProposalSeat(event, group, userId, tableId);
    return [
      ...new Set([
        ...table.games.map((g) => g.gameId),
        ...(await this.events.ownProposedGames(id, tableId, userId)),
      ]),
    ];
  }
  async collectionPickerScope(userId: string, id: string, tableId: string) {
    const { event, group } = await this.context(userId, id, false, true);
    this.open(event, group);
    const table = await this.events.table(tableId);
    if (!table || table.eventId !== id) throw new CommunityError(404, "TABLE_NOT_FOUND");
    return {
      eventVersion: event.version,
      userIds: (await this.events.acceptedTableUsers(tableId)).sort(),
    };
  }
  private async proposalGame(gameId: number) {
    const [game] = await this.games.findByIds([gameId]);
    if (!game || game.isExpansion) throw new CommunityError(400, "GAME_NOT_FOUND");
    return game;
  }
  private async assertProposalSeat(
    event: EventRecord,
    group: GroupRecord,
    userId: string,
    tableId?: string,
  ) {
    await this.member(group, userId);
    const tables = await this.events.allTables(event.id),
      registrations = await this.events.allRegistrations(event.id);
    if (tableId && !tables.some((table) => table.id === tableId))
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    const plan = await this.agreement(event, group, tables, registrations);
    for (const table of tables) {
      if (tableId && table.id !== tableId) continue;
      const chosen = plan.agreed
        ? plan.includedTables.find((row) => row.tableId === table.id)?.participantIds
        : undefined;
      const seats = projectReservedPlaces(
        registrations
          .filter((row) => row.tableId === table.id)
          .map((row) => ({
            ...row,
            status: row.status === "ACCEPTED" ? ("ACCEPTED" as const) : ("PENDING" as const),
          })),
        table.maxPlayers,
        chosen,
      ).seated;
      if (seats.some((row) => row.userId === userId && row.status === "ACCEPTED")) return;
    }
    throw new CommunityError(403, "PROPOSAL_SEAT_REQUIRED");
  }
  async proposals(
    userId: string,
    id: string,
    page: {
      limit: number;
      cursor?: string;
      mode: "mine" | "review";
      kind: "date" | "location" | "game";
      tableId?: string;
      clientRequestId?: string;
    },
  ): Promise<EventProposalsResponse> {
    const { event, group } = await this.context(userId, id, Boolean(page.clientRequestId));
    if (group?.type !== "PRIVATE") throw new CommunityError(403, "PROPOSALS_PRIVATE_GROUP_ONLY");
    if (page.mode === "review" && !(await this.manager(event, group, userId)))
      throw new CommunityError(403, "EVENT_ADMIN_REQUIRED");
    if (page.tableId) {
      const table = await this.events.table(page.tableId);
      if (!table || table.eventId !== id) throw new CommunityError(404, "TABLE_NOT_FOUND");
    }
    if (page.mode === "review" && page.kind === "game" && page.tableId) {
      const groups = await this.events.gameProposalPage(id, page.tableId, page);
      const items: EventProposalResponse[] = [];
      for (const row of groups.slice(0, page.limit))
        items.push(await this.groupedGameProposal(row.representative, row.members));
      const last = items.at(-1);
      return {
        eventId: id,
        groupId: group.id,
        eventVersion: event.version,
        mode: page.mode,
        items,
        nextCursor: groups.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
      };
    }
    const rows = await this.events.proposals(id, page.mode === "mine" ? userId : null, page);
    const items: EventProposalResponse[] = [];
    for (const row of rows.slice(0, page.limit)) items.push(await this.proposalResponse(row));
    const last = items.at(-1);
    return {
      eventId: id,
      groupId: group.id,
      eventVersion: event.version,
      mode: page.mode,
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  async submitProposal(
    userId: string,
    id: string,
    input: SubmitEventProposalInput,
  ): Promise<EventProposalResponse> {
    const { event, group } = await this.context(userId, id, true);
    this.open(event, group);
    if (group?.type !== "PRIVATE") throw new CommunityError(403, "PROPOSALS_PRIVATE_GROUP_ONLY");
    if (await this.manager(event, group, userId))
      throw new CommunityError(403, "PROPOSAL_MANAGER_CANNOT_SUBMIT");
    const hash = createHash("sha256")
      .update(JSON.stringify({ eventVersion: input.eventVersion, payload: input.payload }))
      .digest("hex");
    const previous = await this.events.proposalRequest(id, userId, input.clientRequestId);
    if (previous) {
      if (previous.requestHash !== hash) throw new CommunityError(409, "PROPOSAL_REQUEST_REUSED");
      return this.proposalResponse(previous);
    }
    if (input.eventVersion !== event.version) throw new CommunityError(409, "EVENT_CHANGED");
    let payload: EventProposalPayload = input.payload;
    const table = payload.kind === "game" ? await this.events.table(payload.tableId) : null;
    if (payload.kind === "game" && (!table || table.eventId !== id))
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    const enabled =
      payload.kind === "date"
        ? event.allowParticipantDates
        : payload.kind === "location"
          ? event.allowParticipantLocations
          : table?.allowParticipantGames;
    if (!enabled) throw new CommunityError(403, "PROPOSALS_DISABLED");
    await this.assertProposalSeat(
      event,
      group,
      userId,
      payload.kind === "game" ? payload.tableId : undefined,
    );
    let label: string;
    if (payload.kind === "location") {
      const location = await verifyCommunityLocation(payload.location, event.locations);
      payload = { kind: "location", location };
      label = location.name;
    } else if (payload.kind === "game") {
      label = (await this.proposalGame(payload.gameId)).name;
    } else {
      label = `${payload.day} ${payload.startTime}`;
    }
    const currentTables = await this.events.allTables(id);
    let edit: ReturnType<typeof eventProposalEdit>;
    try {
      edit = eventProposalEdit(event, currentTables, payload, randomUUID());
    } catch (error) {
      throw new CommunityError(409, error instanceof Error ? error.message : "INVALID_PROPOSAL");
    }
    if (!edit.input) throw new CommunityError(409, "PROPOSAL_OPTION_EXISTS");
    this.validateSchedule(
      { ...event, dates: edit.input.dates, locations: edit.input.locations },
      group,
      false,
    );
    const identity =
      payload.kind === "location"
        ? {
            kind: "location",
            address: payload.location.address,
            latitude: payload.location.latitude,
            longitude: payload.location.longitude,
          }
        : payload;
    const payloadKey = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
    if (
      payload.kind === "game" &&
      (await this.events.ownProposedGames(id, payload.tableId, userId)).includes(payload.gameId)
    )
      throw new CommunityError(409, "PROPOSAL_ALREADY_PENDING");
    if (await this.events.duplicateProposal(id, userId, payloadKey))
      throw new CommunityError(409, "PROPOSAL_ALREADY_PENDING");
    const at = new Date().toISOString();
    const row: EventProposal = {
      id: randomUUID(),
      eventId: id,
      groupId: group.id,
      userId,
      clientRequestId: input.clientRequestId,
      requestHash: hash,
      payloadKey,
      payload,
      label: label.slice(0, 1000),
      status: "PENDING",
      version: 1,
      submittedEventVersion: event.version,
      createdAt: at,
      updatedAt: at,
    };
    await this.events.saveProposal(row);
    await this.notify(
      "event_proposal_created",
      event,
      userId,
      await this.groups.managerIds(group),
      payload.kind === "game" ? payload.tableId : undefined,
    );
    return this.proposalResponse(row);
  }
  async reviewProposal(
    userId: string,
    id: string,
    proposalId: string,
    input: ReviewEventProposalInput,
  ): Promise<ReviewEventProposalResponse> {
    const { event, group } = await this.context(userId, id, true, true);
    this.open(event, group);
    if (group?.type !== "PRIVATE") throw new CommunityError(403, "PROPOSALS_PRIVATE_GROUP_ONLY");
    const row = await this.events.proposal(proposalId);
    if (!row || row.eventId !== id) throw new CommunityError(404, "PROPOSAL_NOT_FOUND");
    const status = input.action === "accept" ? ("ACCEPTED" as const) : ("REJECTED" as const);
    if (row.status === status && row.version === input.version + 1)
      return this.proposalReceipt(userId, row);
    if (row.status !== "PENDING" || row.version !== input.version)
      throw new CommunityError(409, "PROPOSAL_CHANGED");
    if (event.version !== input.eventVersion) throw new CommunityError(409, "EVENT_CHANGED");
    const members =
      row.payload.kind === "game"
        ? await this.events.gameProposals(id, row.payload.tableId, row.payload.gameId)
        : [row];
    const pending = members.filter((p) => p.status === "PENDING");
    if (
      row.payload.kind === "game" &&
      ((pending.length > 1 && !input.groupRevision) ||
        (input.groupRevision && input.groupRevision !== this.proposalGroupRevision(members)))
    )
      throw new CommunityError(409, "PROPOSAL_CHANGED");
    let saved: PlannedEventResponse | undefined, optionId: string | undefined;
    if (input.action === "accept") {
      for (const proposal of pending)
        await this.assertProposalSeat(
          event,
          group,
          proposal.userId,
          proposal.payload.kind === "game" ? proposal.payload.tableId : undefined,
        );
      if (row.payload.kind === "game") await this.proposalGame(row.payload.gameId);
      const tables = await this.events.allTables(id);
      let edit: ReturnType<typeof eventProposalEdit>;
      try {
        edit = eventProposalEdit(event, tables, row.payload, randomUUID());
      } catch (error) {
        throw new CommunityError(409, error instanceof Error ? error.message : "INVALID_PROPOSAL");
      }
      optionId = edit.optionId;
      if (edit.input) saved = await this.update(userId, id, edit.input);
    }
    const reviewBatchId = row.payload.kind === "game" ? randomUUID() : undefined;
    const at = new Date().toISOString();
    let selected: EventProposal = row;
    for (const proposal of pending) {
      const next: EventProposal = {
        ...proposal,
        status,
        version: proposal.version + 1,
        reviewedBy: userId,
        updatedAt: at,
        ...(reviewBatchId ? { reviewBatchId } : {}),
        ...(optionId ? { canonicalOptionId: optionId } : {}),
      };
      await this.events.saveProposal(next);
      if (next.id === row.id) selected = next;
    }
    await this.notify(
      status === "ACCEPTED" ? "event_proposal_accepted" : "event_proposal_rejected",
      { ...event, ...saved },
      userId,
      [...new Set(pending.map((p) => p.userId))],
      row.payload.kind === "game" ? row.payload.tableId : undefined,
    );
    return this.proposalReceipt(userId, selected, true, saved);
  }
  async participants(
    userId: string,
    id: string,
    page: Pick<EventRecordPage, "limit" | "cursor">,
  ): Promise<EventParticipantsResponse> {
    // Public detail access is NOT privileged roster access.
    const { event, group } = await this.context(userId, id);
    const rows = await this.events.participants(event, page);
    const selected = rows.slice(0, page.limit);
    const profiles = await this.users.findByIds(selected.map((row) => row.userId));
    const tables = await this.events.allTables(id);
    const seated = new Set<string>();
    const frozen = new Set(
      tables.flatMap((table) =>
        event.status === "PLANNING" ? [] : (table.confirmed?.playerIds ?? []),
      ),
    );
    if (event.status === "PLANNING") {
      const registrations = await this.events.allRegistrations(id);
      const plan = await this.agreement(event, group, tables, registrations);
      for (const table of tables) {
        const chosen = plan.agreed
          ? plan.includedTables.find((row) => row.tableId === table.id)?.participantIds
          : undefined;
        for (const row of projectReservedPlaces(
          registrations
            .filter((row) => row.tableId === table.id)
            .map((row) => ({
              ...row,
              status: row.status === "ACCEPTED" ? ("ACCEPTED" as const) : ("PENDING" as const),
            })),
          table.maxPlayers,
          chosen,
        ).seated)
          if (row.status === "ACCEPTED") seated.add(row.userId);
      }
    }
    const manager = await this.manager(event, group, userId);
    const removable =
      manager &&
      event.status === "PLANNING" &&
      !publicBookingIsClosed(event, group?.type ?? null, Date.now());
    const items: EventParticipantResponse[] = [];
    for (const row of selected) {
      const profile = profiles.find((value) => value.clerkId === row.userId);
      let canBanGroup = false;
      if (manager && group && row.userId !== userId && row.userId !== group.adminUserId) {
        const membership = await this.groups.membership(group.id, row.userId);
        const ban = await this.groups.ban(group.id, row.userId);
        canBanGroup =
          !groupBanIsActive(ban, Date.now()) &&
          (group.adminUserId === userId || !isGroupModerator(membership));
      }
      items.push({
        id: row.userId,
        userId: row.userId,
        name: publicUserName(profile),
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        position: frozen.has(row.userId) ? "FROZEN" : seated.has(row.userId) ? "SEATED" : "WAITING",
        canRemove: removable,
        canBanGroup,
      });
    }
    return {
      items,
      eventVersion: event.version,
      groupId: event.groupId,
      status: event.status,
      nextCursor: rows.length > page.limit ? selected[selected.length - 1].userId : null,
    };
  }
  async removeParticipant(
    userId: string,
    id: string,
    target: string,
    input: DeletePlannedRecordInput,
  ) {
    const { event, group } = await this.context(userId, id, true, true);
    this.open(event, group);
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    const tables = await this.events.allTables(id);
    const rows = await this.events.userRegistrations(id, target);
    if (
      !rows.some(
        (row) => row.status === "ACCEPTED" && tables.some((table) => table.id === row.tableId),
      )
    )
      throw new CommunityError(404, "EVENT_PARTICIPANT_NOT_FOUND");
    const next = { ...event, version: event.version + 1, updatedAt: new Date().toISOString() };
    await this.events.cancelUser(id, target, next.updatedAt);
    await this.events.save(next);
    await this.notify("event_booking_removed", next, userId, [target]);
    await this.saveSituation(next, group, userId);
    return this.response(
      next,
      group,
      userId,
      await this.events.userRegistrations(id, userId),
      true,
    );
  }
  async list(userId: string, page: EventRecordPage, groupId?: string) {
    if (groupId) await this.member(await this.group(groupId), userId);
    const rows = await this.events.list(userId, page, groupId);
    const items: PlannedEventResponse[] = [];
    for (const row of rows.slice(0, page.limit)) {
      const group = row.groupId ? await this.group(row.groupId) : null;
      items.push(
        await this.response(
          row,
          group,
          userId,
          await this.events.userRegistrations(row.id, userId),
        ),
      );
    }
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  private tableInterval(...args: Parameters<typeof plannedTableInterval>) {
    try {
      return plannedTableInterval(...args);
    } catch (error) {
      if (
        error instanceof Error &&
        ["TABLE_DURATION_REQUIRED", "PUBLIC_EVENT_END_REQUIRED", "TABLE_OUTSIDE_EVENT"].includes(
          error.message,
        )
      )
        throw new CommunityError(400, error.message);
      throw error;
    }
  }
  private async prepareTables(
    event: EventRecord,
    group: GroupRecord | null,
    input: readonly PlannedTableInput[],
    previous: readonly TableRecord[],
  ) {
    const ids = [...new Set(input.flatMap((table) => table.games.map((game) => game.gameId)))];
    const games = await this.games.findByIds(ids);
    if (games.length !== ids.length) throw new CommunityError(400, "GAME_NOT_FOUND");
    const at = new Date().toISOString();
    const result: TableRecord[] = [];
    for (const table of input) {
      const bounds = gamePlayerBounds(
        games.filter((game) => table.games.some((g) => g.gameId === game.id)),
      );
      if (bounds && (table.minPlayers < bounds.minPlayers || table.maxPlayers > bounds.maxPlayers))
        throw new CommunityError(400, "TABLE_GAME_PLAYER_LIMITS");
      const current = table.id ? previous.find((row) => row.id === table.id) : undefined;
      if (table.id && !current && (await this.events.storedTable(table.id)))
        throw new CommunityError(409, "TABLE_ID_REUSED");
      if (current?.results) throw new CommunityError(409, "TABLE_RESULTS_IMMUTABLE");
      if (table.demonstratorUserId) {
        if (group?.type !== "PUBLIC")
          throw new CommunityError(400, "DEMONSTRATOR_REQUIRES_PUBLIC_GROUP");
        await this.member(group, table.demonstratorUserId);
      }
      const options = table.games.map((choice) => {
        const stored = current?.games.find((row) => row.gameId === choice.gameId);
        if (
          stored &&
          (choice.manualDurationMinutes === undefined ||
            (stored.durationSource === "MANUAL" &&
              choice.manualDurationMinutes === stored.durationMinutes))
        )
          return stored;
        const game = games.find((row) => row.id === choice.gameId);
        const bgg = game?.maxPlayMinutes;
        const duration = bgg ?? choice.manualDurationMinutes;
        if (group?.type === "PUBLIC" && !duration)
          throw new CommunityError(400, "TABLE_DURATION_REQUIRED");
        return {
          gameId: choice.gameId,
          ...(duration
            ? {
                durationMinutes: duration,
                durationSource: bgg ? ("BGG" as const) : ("MANUAL" as const),
              }
            : {}),
        };
      });
      const row: TableRecord = {
        id: current?.id ?? table.id ?? randomUUID(),
        eventId: event.id,
        name: table.name,
        order: current?.order ?? event.nextTableOrder++,
        minPlayers: table.minPlayers,
        maxPlayers: table.maxPlayers,
        games: options,
        rankingEnabled: table.rankingEnabled,
        allowParticipantGames:
          table.allowParticipantGames ?? current?.allowParticipantGames ?? false,
        ...(group?.type === "PUBLIC"
          ? {
              startsAt: table.startsAt
                ? new Date(table.startsAt).toISOString()
                : eventLocalToIso(eventDateWall(event, event.dates[0]), event.timeZone),
            }
          : {}),
        ...(table.demonstratorUserId ? { demonstratorUserId: table.demonstratorUserId } : {}),
        ...(current?.confirmed ? { confirmed: current.confirmed } : {}),
        createdAt: current?.createdAt ?? at,
        updatedAt: at,
      };
      if (group?.type !== "PRIVATE" && row.allowParticipantGames)
        throw new CommunityError(400, "PROPOSALS_PRIVATE_GROUP_ONLY");
      if (group?.type === "PUBLIC") this.tableInterval(event, row, "PUBLIC");
      result.push(row);
    }
    return result;
  }
  private validateSchedule(event: EventRecord, group: GroupRecord | null, creating: boolean) {
    if (event.visibility === "PUBLIC" && group?.type !== "PUBLIC")
      throw new CommunityError(400, "EVENT_VISIBILITY_NOT_ALLOWED");
    if (
      group?.type !== "PRIVATE" &&
      (event.allowParticipantDates || event.allowParticipantLocations)
    )
      throw new CommunityError(400, "PROPOSALS_PRIVATE_GROUP_ONLY");
    if (group?.type !== "PRIVATE" && (event.dates.length !== 1 || event.locations.length !== 1))
      throw new CommunityError(400, "EVENT_FIXED_SCHEDULE_REQUIRED");
    if (
      !event.dates.length ||
      !event.locations.length ||
      event.dates.length > MAX_EVENT_OPTIONS ||
      event.locations.length > MAX_EVENT_OPTIONS ||
      new Set(event.dates.map((date) => date.id)).size !== event.dates.length ||
      new Set(event.dates.map((date) => eventDateWall(event, date))).size !== event.dates.length ||
      new Set(event.locations.map((location) => location.id)).size !== event.locations.length
    )
      throw new CommunityError(400, "INVALID_EVENT_OPTIONS");
    try {
      for (const date of event.dates)
        for (const location of event.locations)
          eventLocalToIso(
            eventDateWall(event, date),
            location.timeZone ?? locationTimeZone(location),
          );
    } catch {
      throw new CommunityError(400, "INVALID_EVENT_TIME");
    }
    if (group?.type !== "PUBLIC") {
      if (event.bookingClosesAt || event.endsAt)
        throw new CommunityError(400, "PUBLIC_EVENT_FIELDS_ONLY");
      return;
    }
    if (
      event.dates.length !== 1 ||
      event.locations.length !== 1 ||
      !event.endsAt ||
      !event.bookingClosesAt
    )
      throw new CommunityError(400, "PUBLIC_EVENT_FIXED_SCHEDULE_REQUIRED");
    const start = eventLocalToIso(eventDateWall(event, event.dates[0]), event.timeZone);
    if (Date.parse(event.endsAt) <= Date.parse(start))
      throw new CommunityError(400, "EVENT_END_AFTER_START_REQUIRED");
    if (eventLocalDateTime(event.endsAt, event.timeZone).slice(0, 10) !== event.dates[0].day)
      throw new CommunityError(400, "EVENT_END_SAME_DAY_REQUIRED");
    if (
      Date.parse(event.bookingClosesAt) >= Date.parse(start) ||
      eventLocalDateTime(event.bookingClosesAt, event.timeZone).slice(0, 10) >= event.dates[0].day
    )
      throw new CommunityError(400, "EVENT_CUTOFF_BEFORE_START_REQUIRED");
    if (creating && Date.parse(event.bookingClosesAt) <= Date.now())
      throw new CommunityError(409, "EVENT_BOOKING_CLOSED");
  }
  private validateOverlaps(
    event: EventRecord,
    group: GroupRecord | null,
    tables: TableRecord[],
    registrations: TableRegistration[],
  ) {
    if (group?.type !== "PUBLIC") return;
    for (const table of tables) this.tableInterval(event, table, "PUBLIC");
    for (const table of tables) {
      const users = new Set([
        ...(table.demonstratorUserId ? [table.demonstratorUserId] : []),
        ...registrations.filter((row) => row.tableId === table.id).map((row) => row.userId),
      ]);
      for (const userId of users)
        if (hasPublicTableConflict(event, tables, registrations, table, userId))
          throw new CommunityError(409, "TABLE_TIME_CONFLICT");
    }
  }
  async create(userId: string, input: CreatePlannedEventInput) {
    const group = input.groupId ? await this.group(input.groupId, true) : null;
    if (group) {
      await this.member(group, userId);
      if (
        group.adminUserId !== userId &&
        !isGroupModerator(await this.groups.membership(group.id, userId))
      )
        throw new CommunityError(403, "GROUP_ADMIN_REQUIRED");
    }
    const at = new Date().toISOString();
    const locations = [];
    for (const location of input.locations)
      locations.push(
        await verifyCommunityLocation(
          location,
          group?.approved?.location ? [group.approved.location] : [],
        ),
      );
    const event: EventRecord = {
      id: randomUUID(),
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
      groupId: input.groupId,
      visibility: input.visibility ?? eventRecordVisibility({}, group?.type ?? null),
      adminUserId: userId,
      name: input.name,
      dates: input.dates,
      locations,
      timeZone: locationTimeZone(locations[0]),
      startTime: input.startTime,
      ...(input.endsAt ? { endsAt: new Date(input.endsAt).toISOString() } : {}),
      ...(input.bookingClosesAt
        ? { bookingClosesAt: new Date(input.bookingClosesAt).toISOString() }
        : {}),
      status: "PLANNING",
      version: 1,
      planningGeneration: 1,
      allowParticipantDates: input.allowParticipantDates ?? false,
      allowParticipantLocations: input.allowParticipantLocations ?? false,
      nextPriority: 0,
      nextTableOrder: 0,
      createdAt: at,
      updatedAt: at,
    };
    this.validateSchedule(event, group, true);
    const tables = await this.prepareTables(event, group, input.tables, []);
    this.validateOverlaps(event, group, tables, []);
    await this.events.create(event);
    for (const table of tables) await this.events.saveTable(table);
    return this.response(event, group, userId, [], true);
  }
  async remove(
    userId: string,
    id: string,
    input: DeletePlannedRecordInput,
  ): Promise<DeletedPlannedEventResponse> {
    const { event, group } = await this.context(userId, id, true, true);
    this.open(event, group);
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    await this.events.remove(id);
    return { id, groupId: event.groupId };
  }
  async removeTable(userId: string, id: string, tableId: string, input: DeletePlannedRecordInput) {
    const { event, group } = await this.context(userId, id, true, true);
    this.open(event, group);
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    const tables = await this.events.allTables(id);
    if (!tables.some((table) => table.id === tableId))
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    if (tables.length <= 1) throw new CommunityError(400, "EVENT_TABLE_LIMIT");
    const registrations = await this.events.allRegistrations(id);
    const next = { ...event, version: event.version + 1, updatedAt: new Date().toISOString() };
    await this.events.removeTable(tableId, next.updatedAt);
    await this.events.save(next);
    await this.notifications.retargetItems(
      removedNotificationItems(
        event,
        next,
        tables,
        tables.filter((row) => row.id !== tableId),
      ),
    );
    await this.notify(
      "event_updated",
      next,
      userId,
      registrations.map((row) => row.userId),
      undefined,
      eventNotificationItems(
        event,
        next,
        tables,
        tables.filter((table) => table.id !== tableId),
      ),
    );
    await this.saveSituation(next, group, userId);
    return this.response(
      next,
      group,
      userId,
      await this.events.userRegistrations(id, userId),
      true,
    );
  }
  async update(userId: string, id: string, input: EditPlannedEventInput) {
    const { event, group } = await this.context(userId, id, true, true);
    this.open(event, group);
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    const currentTables = await this.events.allTables(id),
      registrations = await this.events.allRegistrations(id);
    for (const removed of input.removedTableIds)
      if (!currentTables.some((table) => table.id === removed))
        throw new CommunityError(400, "TABLE_NOT_FOUND");
    const retained = currentTables.filter((table) => !input.removedTableIds.includes(table.id));
    if (input.tables.some((table) => table.id && input.removedTableIds.includes(table.id)))
      throw new CommunityError(400, "TABLE_CHANGED_AND_REMOVED");
    const timeZone = locationTimeZone(input.locations[0]);
    for (const date of input.dates)
      if (
        event.dates.some(
          (row) =>
            row.id === date.id &&
            (eventDateWall(event, row) !== eventDateWall(input, date) ||
              (event.timeZone !== timeZone &&
                !(
                  group?.type === "PRIVATE" &&
                  row.startTime !== undefined &&
                  date.startTime !== undefined
                ))),
        )
      )
        throw new CommunityError(400, "OPTION_ID_REUSED");
    const locations = [];
    for (const location of input.locations) {
      const old = event.locations.find((row) => row.id === location.id);
      if (
        old &&
        (old.address !== location.address ||
          old.latitude !== location.latitude ||
          old.longitude !== location.longitude)
      )
        throw new CommunityError(400, "OPTION_ID_REUSED");
      locations.push(await verifyCommunityLocation(location, event.locations));
    }
    const { tables: _tables, removedTableIds: _removed, version: _version, ...fields } = input;
    const next = {
      ...event,
      ...fields,
      visibility: input.visibility ?? eventRecordVisibility(event, group?.type ?? null),
      locations,
      timeZone,
      ...(input.endsAt ? { endsAt: new Date(input.endsAt).toISOString() } : {}),
      ...(input.bookingClosesAt
        ? { bookingClosesAt: new Date(input.bookingClosesAt).toISOString() }
        : {}),
      version: event.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.validateSchedule(next, group, false);
    const edits = await this.prepareTables(next, group, input.tables, retained);
    const merged = [
      ...retained.filter((table) => !edits.some((row) => row.id === table.id)),
      ...edits,
    ].sort((a, b) => a.order - b.order);
    if (!merged.length || merged.length > 20) throw new CommunityError(400, "EVENT_TABLE_LIMIT");
    const active = registrations.filter((row) => merged.some((table) => table.id === row.tableId));
    if (
      group?.type === "PUBLIC" &&
      eventRecordVisibility(event, group.type) === "PUBLIC" &&
      next.visibility === "PRIVATE"
    ) {
      for (const user of new Set(
        active
          .filter((row) => row.status === "ACCEPTED" || row.status === "PENDING")
          .map((row) => row.userId),
      )) {
        if (
          user !== group.adminUserId &&
          (await this.groups.membership(group.id, user))?.status !== "ACCEPTED"
        )
          throw new CommunityError(409, "EVENT_VISIBILITY_HAS_NONMEMBERS");
      }
    }
    if (group?.type === "PUBLIC" && active.length) {
      const changed =
        eventDateWall(event, event.dates[0]) !== eventDateWall(next, next.dates[0]) ||
        event.locations[0].id !== next.locations[0].id ||
        event.endsAt !== next.endsAt ||
        event.timeZone !== next.timeZone;
      if (changed) throw new CommunityError(409, "PUBLIC_SCHEDULE_HAS_REGISTRATIONS");
      for (const table of edits) {
        const old = currentTables.find((row) => row.id === table.id);
        if (!old || !active.some((row) => row.tableId === table.id)) continue;
        const a = this.tableInterval(event, old, "PUBLIC"),
          b = this.tableInterval(next, table, "PUBLIC");
        if (
          a.startsAt !== b.startsAt ||
          a.endsAt !== b.endsAt ||
          ((old.games.length === 1 || table.games.length === 1) &&
            old.games[0].gameId !== table.games[0].gameId)
        )
          throw new CommunityError(409, "PUBLIC_SCHEDULE_HAS_REGISTRATIONS");
      }
    }
    this.validateOverlaps(next, group, merged, active);
    for (const tableId of input.removedTableIds)
      await this.events.removeTable(tableId, next.updatedAt);
    for (const table of edits) {
      await this.events.saveTable(table);
      await this.events.retainGameVotes(
        table.id,
        table.games.map((game) => game.gameId),
      );
    }
    await this.events.retainChoiceVotes(
      id,
      next.dates.map((row) => row.id),
      next.locations.map((row) => row.id),
    );
    await this.events.save(next);
    await this.notifications.retargetItems(
      removedNotificationItems(event, next, currentTables, merged),
    );
    await this.notify(
      "event_updated",
      next,
      userId,
      registrations.map((row) => row.userId),
      undefined,
      eventNotificationItems(event, next, currentTables, merged),
    );
    await this.saveSituation(next, group, userId);
    return this.response(
      next,
      group,
      userId,
      await this.events.userRegistrations(id, userId),
      true,
    );
  }
  private async tableResponse(
    event: EventRecord,
    group: GroupRecord | null,
    table: TableRecord,
    userId: string,
    proposal?: EventAgreement | null,
    includeProfiles = false,
    readOnly = false,
    redactEmails = false,
  ): Promise<PlannedTableResponse> {
    const registrations = (await this.events.allRegistrations(event.id)).filter(
      (row) => row.tableId === table.id,
    );
    const my = registrations.find((row) => row.userId === userId) ?? null;
    const plan =
      proposal === undefined && event.status === "PLANNING"
        ? await this.agreement(event, group)
        : proposal;
    const selected = plan?.agreed
      ? plan.includedTables.find((row) => row.tableId === table.id)?.participantIds
      : undefined;
    const base = projectReservedPlaces(
      registrations.map((row) => ({
        ...row,
        status: row.status === "ACCEPTED" ? ("ACCEPTED" as const) : ("PENDING" as const),
      })),
      table.maxPlayers,
      selected,
    );
    const games = await this.games.findByIds(table.games.map((game) => game.gameId));
    const open =
      !readOnly &&
      event.status === "PLANNING" &&
      !publicBookingIsClosed(event, group?.type ?? null, Date.now());
    const ratingChanges =
      table.results && table.rankingEnabled && table.confirmed
        ? await this.ratings.forTable(table.id, table.confirmed.gameId)
        : [];
    const winnerIds =
      table.results?.entries
        .filter((row) => row.rank === 1 && row.score !== null)
        .map((row) => row.userId) ?? [];
    const profileIds =
      includeProfiles && table.results ? (table.confirmed?.playerIds ?? []) : winnerIds;
    const identityIds = [
      ...new Set([
        ...profileIds,
        ...(includeProfiles && my ? [userId] : []),
        ...(table.demonstratorUserId ? [table.demonstratorUserId] : []),
      ]),
    ];
    const winnerProfiles = identityIds.length ? await this.users.findByIds(identityIds) : [];
    const demonstrator = winnerProfiles.find((row) => row.clerkId === table.demonstratorUserId);
    const myProfile =
      includeProfiles && my ? winnerProfiles.find((row) => row.clerkId === userId) : undefined;
    const resultProfiles =
      includeProfiles && table.results
        ? profileIds.map((userId) => {
            const profile = winnerProfiles.find((row) => row.clerkId === userId);
            return {
              userId,
              name: publicUserName(profile, userId),
              username: profile?.username ?? null,
              email: readOnly || redactEmails ? null : (profile?.email ?? null),
              avatarUrl: profile?.avatarUrl ?? null,
            };
          })
        : undefined;
    const groupRatingChanges =
      table.results && table.rankingEnabled && table.confirmed && event.groupId
        ? await this.ratings.forTable(table.id, table.confirmed.gameId, event.groupId)
        : [];
    const winners = winnerIds.map((userId) => {
      const profile = winnerProfiles.find((row) => row.clerkId === userId);
      return {
        userId,
        name: publicUserName(profile, userId),
        avatarUrl: profile?.avatarUrl ?? null,
      };
    });
    const myPosition = tableRegistrationPosition(
      event.status,
      my,
      base.seated.map((row) => row.id),
      table.confirmed?.playerIds ?? [],
    );
    const canManage = !readOnly && (await this.manager(event, group, userId));
    const { resultDraft, ...visibleTable } = table;
    return {
      ...visibleTable,
      canManage,
      managementRole: canManage
        ? (group?.adminUserId ?? event.adminUserId) === userId
          ? "admin"
          : "moderator"
        : null,
      readOnly,
      ...(!readOnly && canManage && event.status === "CONFIRMED" && table.confirmed && resultDraft
        ? { resultDraft }
        : {}),
      winners,
      resultProfiles,
      groupRatingChanges,
      ratingChanges,
      myPosition: readOnly ? null : myPosition,
      eventName: event.name,
      eventVersion: event.version,
      eventSchedule: eventRecordSchedulePreview(event),
      groupName: group?.approved?.name ?? null,
      acceptedCount: registrations.filter((row) => row.status === "ACCEPTED").length,
      pendingRegistrationCount: registrations.filter((row) => row.status === "PENDING").length,
      demonstratorName: demonstrator ? publicUserName(demonstrator) : null,
      demonstratorAvatarUrl: demonstrator?.avatarUrl ?? null,
      bookingClosesAt: event.bookingClosesAt,
      groupId: event.groupId,
      groupType: group?.type ?? null,
      eventStatus: event.status,
      adminUserId: event.adminUserId,
      myRegistration: readOnly
        ? null
        : my && myProfile
          ? {
              ...my,
              name: myProfile.name ?? null,
              username: myProfile.username ?? null,
              avatarUrl: myProfile.avatarUrl ?? null,
              email: myProfile.email ?? null,
            }
          : my,
      seatedCount:
        event.status !== "PLANNING"
          ? (table.confirmed?.playerIds.length ?? 0)
          : base.seated.filter((row) => row.status === "ACCEPTED").length,
      pendingCount:
        event.status === "PLANNING"
          ? base.seated.filter((row) => row.status === "PENDING").length
          : 0,
      waitingCount:
        event.status === "PLANNING"
          ? base.waiting.length
          : registrations.filter((row) => !table.confirmed?.playerIds.includes(row.userId)).length,
      canRegister:
        (open ||
          (readOnly &&
            eventRecordVisibility(event, group?.type ?? null) === "PUBLIC" &&
            event.status === "PLANNING" &&
            !publicBookingIsClosed(event, group?.type ?? null, Date.now()))) &&
        !my &&
        (Boolean(group) || event.adminUserId === userId),
      canRespond: open && my?.status === "PENDING" && my.kind === "INVITATION",
      canLeave: open && my?.status === "ACCEPTED",
      canInvite: open && canManage,
      canProposeGames:
        !canManage &&
        open &&
        group?.type === "PRIVATE" &&
        Boolean(table.allowParticipantGames) &&
        my?.status === "ACCEPTED" &&
        myPosition === "SEATED",
      ...(includeProfiles && !readOnly
        ? {
            gameVoteCounts: eventVoteCounts(
              table.games.map((game) => String(game.gameId)),
              registrations.filter((row) => row.status === "ACCEPTED").map((row) => row.gameVotes),
            ),
          }
        : {}),
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
    };
  }
  async invitationCandidates(
    userId: string,
    eventId: string,
    tableId: string,
    page: EventRecordPage,
  ) {
    const { event, group } = await this.context(userId, eventId, false, true);
    this.open(event, group);
    const table = await this.events.table(tableId);
    if (!table || table.eventId !== eventId) throw new CommunityError(404, "TABLE_NOT_FOUND");
    const rows = await this.events.invitationCandidates(group, userId, tableId, page);
    // Same session: read sequentially and reuse the write guard's policy without hiding candidates.
    const tables = group?.type === "PUBLIC" ? await this.events.allTables(event.id) : [];
    const registrations =
      group?.type === "PUBLIC" ? await this.events.allRegistrations(event.id) : [];
    return {
      items: rows.slice(0, page.limit).map(
        (row): TableInviteeResponse => ({
          invitationBlockReason:
            group?.type === "PUBLIC" &&
            hasPublicTableConflict(event, tables, registrations, table, row.clerkId)
              ? "TABLE_TIME_CONFLICT"
              : null,
          id: row.clerkId,
          name: row.name || row.username || row.clerkId,
          username: row.username ?? null,
          email: group ? null : (row.email ?? null),
          avatarUrl: row.avatarUrl ?? null,
        }),
      ),
      nextCursor: rows.length > page.limit ? rows[page.limit - 1].clerkId : null,
      eventVersion: event.version,
    };
  }
  async tableDetail(userId: string, eventId: string, tableId: string) {
    const { event, group, readOnly, sharedResultsOnly, outsideGroup } = await this.context(
      userId,
      eventId,
      false,
      false,
      true,
    );
    const table = await this.events.table(tableId);
    if (
      !table ||
      table.eventId !== eventId ||
      (sharedResultsOnly && (!table.confirmed || !table.results))
    )
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    const response = await this.tableResponse(
      event,
      group,
      table,
      userId,
      undefined,
      true,
      readOnly,
      outsideGroup,
    );
    return sharedResultsOnly ? sharedTableResults(response) : response;
  }
  async tableLeaderboard(
    userId: string,
    eventId: string,
    tableId: string,
    page: Pick<EventRecordPage, "limit" | "cursor">,
  ): Promise<TableLeaderboardResponse> {
    const { event, sharedResultsOnly } = await this.context(userId, eventId, false, false, true);
    if (sharedResultsOnly) throw new CommunityError(403, "EVENT_RESULTS_ONLY");
    const table = await this.events.table(tableId);
    if (!table || table.eventId !== eventId) throw new CommunityError(404, "TABLE_NOT_FOUND");
    if (event.status === "PLANNING" || !table.confirmed)
      throw new CommunityError(409, "TABLE_NOT_CONFIRMED");
    const { gameId, playerIds } = table.confirmed;
    // Same transaction session: snapshot, genuine Table statistics and profiles run sequentially.
    const ratings = await this.ratings.currentForPlayers(playerIds, gameId, event.groupId);
    const ordered = ratings.sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
    const offset = Number(page.cursor ?? 0),
      selected = ordered.slice(offset, offset + page.limit);
    const stats = await this.ratings.tableStats(
      selected.map((row) => row.userId),
      gameId,
      event.groupId,
    );
    const profiles = await this.users.findByIds(selected.map((row) => row.userId));
    return {
      gameId,
      scope: event.groupId ? "GROUP" : "GLOBAL",
      items: selected.map((row) => {
        const profile = profiles.find((value) => value.clerkId === row.userId),
          counters = stats.get(row.userId);
        return {
          ...row,
          name: publicUserName(profile, row.userId),
          username: profile?.username ?? null,
          avatarUrl: profile?.avatarUrl ?? null,
          gamesPlayed: counters?.gamesPlayed ?? 0,
          gamesWon: counters?.gamesWon ?? 0,
          nd: counters?.nd ?? 0,
        };
      }),
      nextCursor: offset + page.limit < ordered.length ? String(offset + page.limit) : null,
    };
  }
  async tables(userId: string, eventId: string, page: EventRecordPage) {
    const { event, group, readOnly, sharedResultsOnly } = await this.context(
      userId,
      eventId,
      false,
      false,
      true,
    );
    const rows = (await this.events.allTables(eventId)).filter(
      (table) =>
        (!sharedResultsOnly || (table.confirmed && table.results)) &&
        (!page.query || table.name.toLocaleLowerCase().includes(page.query.toLocaleLowerCase())),
    );
    const after = page.cursor ? rows.filter((row) => row.order > Number(page.cursor)) : rows;
    const items: PlannedTableResponse[] = [];
    const proposal = event.status === "PLANNING" ? await this.agreement(event, group) : null;
    for (const row of after.slice(0, page.limit)) {
      const response = await this.tableResponse(
        event,
        group,
        row,
        userId,
        proposal,
        false,
        readOnly,
      );
      items.push(sharedResultsOnly ? sharedTableResults(response) : response);
    }
    return {
      items,
      nextCursor: after.length > page.limit ? String(items[items.length - 1].order) : null,
    };
  }
  async personalTables(userId: string, page: EventRecordPage) {
    const items: PlannedTableResponse[] = [];
    let cursor = page.cursor;
    // Agreement can move accepted players between seats and queue. Reuse the canonical projection
    // in bounded source chunks, before emitting a page; never filter an already paginated UI page.
    // ponytail: sparse sections can scan extra chunks; materialize agreement positions only if measured necessary.
    while (true) {
      const rows = await this.events.personalTables(userId, { ...page, cursor });
      for (const row of rows.slice(0, page.limit)) {
        const table = await this.tableDetail(userId, row.eventId, row.id);
        if (
          page.section
            ? personalTableSection(table, userId) !== page.section
            : !isPersonalTableParticipant(table, userId)
        )
          continue;
        items.push(table);
        if (items.length > page.limit) {
          const last = items[page.limit - 1];
          return { items: items.slice(0, page.limit), nextCursor: `${last.createdAt}|${last.id}` };
        }
      }
      if (rows.length <= page.limit) return { items, nextCursor: null };
      const last = rows[page.limit - 1];
      cursor = `${last.createdAt}|${last.id}`;
    }
  }
  private async registrationTarget(
    event: EventRecord,
    group: GroupRecord | null,
    table: TableRecord,
    target: string,
    kind: "INVITATION" | "SELF",
  ) {
    if (!(await this.users.findById(target))) throw new CommunityError(404, "USER_NOT_FOUND");
    if (group) {
      if (kind === "SELF" && eventRecordVisibility(event, group.type) === "PUBLIC") {
        if (groupBanIsActive(await this.groups.ban(group.id, target), Date.now()))
          throw new CommunityError(403, "GROUP_BANNED");
      } else await this.member(group, target);
    } else if (
      target !== event.adminUserId &&
      (kind === "SELF" ||
        !(await this.relationships.isFriend(event.adminUserId, target)) ||
        (await this.relationships.isBlocked(event.adminUserId, target)))
    )
      throw new CommunityError(403, "CONFIRMED_FRIEND_REQUIRED");
    const current = await this.events.userRegistration(table.id, target);
    if (current?.status === "ACCEPTED" || current?.status === "PENDING")
      throw new CommunityError(409, "REGISTRATION_ALREADY_ACTIVE");
    if (
      group?.type === "PUBLIC" &&
      hasPublicTableConflict(
        event,
        await this.events.allTables(event.id),
        await this.events.allRegistrations(event.id),
        table,
        target,
      )
    )
      throw new CommunityError(409, "TABLE_TIME_CONFLICT");
    return current;
  }
  /** Voluntary enrollment commits this Table's game choices with any initial PRIVATE preferences. */
  async join(userId: string, eventId: string, tableId: string, input?: JoinTableInput) {
    const { group, own } = await this.context(userId, eventId, true, false, false, true);
    const availability = input?.availability;
    if (group?.type === "PRIVATE" && !availability && !hasOtherAcceptedTable(own, tableId))
      throw new CommunityError(400, "EVENT_AVAILABILITY_REQUIRED");
    if (group?.type !== "PRIVATE" && availability)
      throw new CommunityError(400, "EVENT_AVAILABILITY_NOT_REQUIRED");
    if (!input) throw new CommunityError(400, "TABLE_GAME_AVAILABILITY_REQUIRED");
    return this.register(userId, eventId, tableId, undefined, input);
  }
  private validateParticipation(
    event: EventRecord,
    group: GroupRecord | null,
    table: TableRecord,
    input: JoinTableInput,
  ) {
    if (input.version !== event.version) throw new CommunityError(409, "EVENT_CHANGED");
    if (
      !eventOptionVotesAreComplete(
        table.games.map((game) => ({ id: String(game.gameId) })),
        input.gameVotes ?? {},
      )
    )
      throw new CommunityError(400, "INVALID_JOIN_GAME_VOTES");
    const availability = input.availability;
    if (availability) {
      if (group?.type !== "PRIVATE") throw new CommunityError(400, "INVALID_JOIN_AVAILABILITY");
      if (availability.version !== event.version) throw new CommunityError(409, "EVENT_CHANGED");
      if (!eventJoinAvailabilityIsComplete(event, availability))
        throw new CommunityError(400, "INVALID_JOIN_AVAILABILITY");
    }
  }
  async register(
    userId: string,
    eventId: string,
    tableId: string,
    target?: string,
    input?: JoinTableInput,
  ) {
    const { event, group } = await this.context(
      userId,
      eventId,
      true,
      target !== undefined,
      false,
      target === undefined,
    );
    this.open(event, group);
    const table = await this.events.table(tableId);
    if (!table || table.eventId !== eventId) throw new CommunityError(404, "TABLE_NOT_FOUND");
    if (target === userId) throw new CommunityError(400, "USE_SELF_REGISTRATION");
    const user = target ?? userId,
      kind = target === undefined ? ("SELF" as const) : ("INVITATION" as const);
    const previous = await this.registrationTarget(event, group, table, user, kind);
    const availability = input?.availability;
    if (input) {
      if (target) throw new CommunityError(400, "INVALID_JOIN_AVAILABILITY");
      this.validateParticipation(event, group, table, input);
    }
    const at = new Date().toISOString();
    const row: TableRegistration = {
      id: randomUUID(),
      eventId,
      tableId,
      userId: user,
      kind,
      status: kind === "SELF" ? "ACCEPTED" : "PENDING",
      priorityAt: at,
      sequence: event.nextPriority++,
      version: (previous?.version ?? 0) + 1,
      gameVotes: input
        ? eventVotingChoices(
            table.games.map((game) => ({ id: String(game.gameId) })),
            input.gameVotes,
          )
        : {},
      createdAt: at,
      updatedAt: at,
    };
    await this.events.saveRegistration(row);
    if (availability)
      await this.events.saveVoter({
        eventId,
        userId,
        dateVotes: eventVotingChoices(event.dates, availability.dateVotes),
        locationVotes: eventVotingChoices(event.locations, availability.locationVotes),
        updatedAt: at,
      });
    event.version++;
    event.updatedAt = at;
    await this.events.save(event);
    await this.notify(
      kind === "INVITATION" ? "table_invitation" : "event_booking_confirmed",
      event,
      userId,
      kind === "INVITATION"
        ? [user]
        : group
          ? await this.groups.managerIds(group)
          : [event.adminUserId],
      tableId,
    );
    await this.saveSituation(event, group, userId);
    return { ...row, eventVersion: event.version };
  }
  async registrationAction(
    userId: string,
    registrationId: string,
    input: DecideTableRegistrationInput,
  ) {
    const initial = await this.events.registration(registrationId);
    if (!initial) throw new CommunityError(404, "REGISTRATION_NOT_FOUND");
    const { event, group } = await this.context(userId, initial.eventId, true);
    this.open(event, group);
    const row = await this.events.registration(registrationId);
    if (
      !row ||
      row.version !== input.version ||
      (row.status !== "PENDING" && row.status !== "ACCEPTED")
    )
      throw new CommunityError(409, "REGISTRATION_CHANGED");
    const own = row.userId === userId,
      admin = await this.manager(event, group, userId);
    let acceptedGameVotes = row.gameVotes;
    let status: TableRegistration["status"];
    if (input.action === "accept" || input.action === "decline") {
      if (!own || row.kind !== "INVITATION" || row.status !== "PENDING")
        throw new CommunityError(403, "INVITATION_RECIPIENT_REQUIRED");
      if (input.action === "accept") {
        if (group) await this.member(group, userId);
        else if (await this.relationships.isBlocked(event.adminUserId, userId))
          throw new CommunityError(403, "BLOCKED_PARTICIPANT");
        const table = await this.events.table(row.tableId);
        if (!table || table.eventId !== event.id) throw new CommunityError(404, "TABLE_NOT_FOUND");
        const participation = input.participation;
        if (!participation) throw new CommunityError(400, "TABLE_GAME_AVAILABILITY_REQUIRED");
        if (group?.type === "PRIVATE" && !participation.availability)
          throw new CommunityError(400, "EVENT_AVAILABILITY_REQUIRED");
        this.validateParticipation(event, group, table, participation);
        acceptedGameVotes = eventVotingChoices(
          table.games.map((game) => ({ id: String(game.gameId) })),
          participation.gameVotes,
        );
        if (
          group?.type === "PUBLIC" &&
          hasPublicTableConflict(
            event,
            await this.events.allTables(event.id),
            await this.events.allRegistrations(event.id),
            table,
            userId,
          )
        )
          throw new CommunityError(409, "TABLE_TIME_CONFLICT");
      }
      status = input.action === "accept" ? "ACCEPTED" : "DECLINED";
    } else {
      if (
        (input.action === "cancel" && (!own || row.status !== "ACCEPTED")) ||
        (input.action === "remove" && !admin)
      )
        throw new CommunityError(403, "REGISTRATION_ACTION_FORBIDDEN");
      status = "CANCELLED";
    }
    const next = {
      ...row,
      status,
      version: row.version + 1,
      updatedAt: new Date().toISOString(),
      ...(input.action === "accept" ? { gameVotes: acceptedGameVotes } : {}),
    };
    await this.events.saveRegistration(next);
    if (own && (input.action === "accept" || input.action === "decline"))
      await this.notifications.acknowledgeItems(
        userId,
        [notificationItemId(row.tableId, "invitation", undefined, "table")],
        input.attentionThrough ?? new Date().toISOString(),
      );
    if (input.action === "accept" && input.participation.availability)
      await this.events.saveVoter({
        eventId: event.id,
        userId,
        dateVotes: eventVotingChoices(event.dates, input.participation.availability.dateVotes),
        locationVotes: eventVotingChoices(
          event.locations,
          input.participation.availability.locationVotes,
        ),
        updatedAt: next.updatedAt,
      });
    event.version++;
    event.updatedAt = next.updatedAt;
    await this.events.save(event);
    await this.notify(
      status === "ACCEPTED" ? "event_booking_confirmed" : "event_booking_removed",
      event,
      userId,
      own ? (group ? await this.groups.managerIds(group) : [event.adminUserId]) : [row.userId],
      row.tableId,
    );
    await this.saveSituation(event, group, userId);
    return { ...next, eventVersion: event.version };
  }
  async vote(userId: string, id: string, input: ChangeEventVoteInput) {
    const { event, group, own } = await this.context(userId, id, true);
    this.open(event, group);
    if (!own.some((row) => row.status === "ACCEPTED"))
      throw new CommunityError(403, "ACCEPTED_REGISTRATION_REQUIRED");
    const at = new Date().toISOString();
    if ((input.vote as string) === "UNKNOWN") throw new CommunityError(400, "INVALID_VOTE");
    if (input.kind === "game") {
      const table = await this.events.table(input.tableId),
        registration = own.find(
          (row) => row.tableId === input.tableId && row.status === "ACCEPTED",
        );
      if (!table || table.eventId !== id || !registration)
        throw new CommunityError(403, "ACCEPTED_REGISTRATION_REQUIRED");
      if (!table.games.some((row) => row.gameId === input.gameId))
        throw new CommunityError(400, "INVALID_VOTE_OPTION");
      if (!eventOptionsRequireVote(table.games)) throw new CommunityError(409, "FIXED_OPTION");
      if (
        !eventAvailabilityVoteIsAllowed(
          table.games.map((game) => ({ id: String(game.gameId) })),
          registration.gameVotes,
          String(input.gameId),
          input.vote,
        )
      )
        throw new CommunityError(409, "GAME_POSITIVE_AVAILABILITY_REQUIRED");
      await this.events.saveRegistration({
        ...registration,
        gameVotes: { ...registration.gameVotes, [input.gameId]: input.vote },
        version: registration.version + 1,
        updatedAt: at,
      });
    } else {
      if (group?.type === "PUBLIC") throw new CommunityError(409, "FIXED_OPTION");
      const options = input.kind === "date" ? event.dates : event.locations;
      if (!options.some((row) => row.id === input.optionId))
        throw new CommunityError(400, "INVALID_VOTE_OPTION");
      if (!eventOptionsRequireVote(options)) throw new CommunityError(409, "FIXED_OPTION");
      const current = (await this.events.voter(id, userId)) ?? {
        eventId: id,
        userId,
        dateVotes: {},
        locationVotes: {},
        updatedAt: at,
      };
      const key = input.kind === "date" ? "dateVotes" : "locationVotes";
      if (!eventAvailabilityVoteIsAllowed(options, current[key], input.optionId, input.vote))
        throw new CommunityError(409, "EVENT_POSITIVE_AVAILABILITY_REQUIRED");
      await this.events.saveVoter({
        ...current,
        [key]: { ...current[key], [input.optionId]: input.vote },
        updatedAt: at,
      });
    }
    event.version++;
    event.updatedAt = at;
    await this.events.save(event);
    if (input.attentionThrough)
      await this.notifications.acknowledgeItems(
        userId,
        [
          notificationItemId(
            input.kind === "game" ? input.tableId : id,
            input.kind,
            input.kind === "game" ? input.gameId : input.optionId,
          ),
        ],
        input.attentionThrough,
      );
    await this.saveSituation(event, group, userId);
    return this.response(
      event,
      group,
      userId,
      await this.events.userRegistrations(id, userId),
      true,
    );
  }
  async transition(userId: string, id: string, input: ChangeEventStateInput) {
    const { event, group, own } = await this.context(userId, id, true, true);
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    if (input.action === "replan") {
      if (event.status !== "CONFIRMED") throw new CommunityError(409, "EVENT_NOT_CONFIRMED");
      const next: EventRecord = {
        ...event,
        status: "PLANNING",
        version: event.version + 1,
        planningGeneration: event.planningGeneration + 1,
        updatedAt: new Date().toISOString(),
      };
      delete next.lastNotifiedSituation;
      await this.events.save(next);
      await this.notify(
        "event_replanning",
        next,
        userId,
        (await this.events.allRegistrations(id))
          .filter((row) => row.status === "ACCEPTED")
          .map((row) => row.userId),
      );
      await this.saveSituation(next, group, userId);
      return this.response(next, group, userId, own, true);
    }
    if (event.status !== "PLANNING") throw new CommunityError(409, "EVENT_NOT_PLANNING");
    const tables = await this.events.allTables(id),
      plan = await this.agreement(event, group, tables);
    if (!plan.agreed) throw new CommunityError(409, "EVENT_NO_AGREEMENT");
    if (
      group &&
      eventRecordVisibility(event, group.type) === "PRIVATE" &&
      !publicBookingIsClosed(event, group.type, Date.now())
    )
      for (const participant of plan.participantIds) await this.member(group, participant);
    if (!group)
      for (const participant of plan.participantIds)
        if (participant !== userId && (await this.relationships.isBlocked(userId, participant)))
          throw new CommunityError(409, "BLOCKED_PARTICIPANT");
    const at = new Date().toISOString();
    const location = event.locations.find((row) => row.id === plan.locationId);
    if (!location) throw new CommunityError(409, "INVALID_EVENT_TIME");
    // Legacy plans keep their stored clock until explicitly edited; never reinterpret old snapshots.
    const scheduled = { ...event, timeZone: location.timeZone ?? event.timeZone };
    for (const stored of tables) {
      const { resultDraft: _draft, ...table } = stored;
      const included = plan.includedTables.find((row) => row.tableId === table.id);
      if (included)
        await this.events.saveTable({
          ...table,
          confirmed: {
            gameId: included.gameId,
            playerIds: included.participantIds,
            ...this.tableInterval(
              scheduled,
              table,
              group?.type ?? null,
              plan.dateId,
              included.gameId,
            ),
          },
          updatedAt: at,
        });
      else {
        const { confirmed: _previous, ...excluded } = table;
        await this.events.saveTable({ ...excluded, updatedAt: at });
      }
    }
    const next: EventRecord = {
      ...event,
      status: "CONFIRMED",
      timeZone: scheduled.timeZone,
      confirmed: { dateId: plan.dateId, locationId: plan.locationId, at },
      version: event.version + 1,
      updatedAt: at,
    };
    await this.events.save(next);
    await this.notify("event_confirmed", next, userId, plan.participantIds);
    return this.response(next, group, userId, own, true);
  }
  async seats(
    userId: string,
    eventId: string,
    tableId: string,
    page: EventRecordPage,
    pending = false,
  ) {
    const { event, group, readOnly, sharedResultsOnly, outsideGroup } = await this.context(
      userId,
      eventId,
      false,
      false,
      true,
    );
    if (sharedResultsOnly) throw new CommunityError(403, "EVENT_RESULTS_ONLY");
    const table = await this.events.table(tableId);
    if (!table || table.eventId !== eventId) throw new CommunityError(404, "TABLE_NOT_FOUND");
    if (pending && (readOnly || !(await this.manager(event, group, userId))))
      throw new CommunityError(403, "EVENT_ADMIN_REQUIRED");
    const rows = await this.events.registrationsPage(
      tableId,
      pending ? "PENDING" : "ACCEPTED",
      page,
    );
    const profiles = await this.users.findByIds(rows.slice(0, page.limit).map((row) => row.userId));
    const all = (await this.events.allRegistrations(eventId)).filter(
      (row) => row.tableId === tableId,
    );
    const plan = event.status === "PLANNING" ? await this.agreement(event, group) : null;
    const selected = plan?.agreed
      ? plan.includedTables.find((row) => row.tableId === tableId)?.participantIds
      : undefined;
    const base = projectReservedPlaces(
      all.map((row) => ({
        ...row,
        status: row.status === "ACCEPTED" ? ("ACCEPTED" as const) : ("PENDING" as const),
      })),
      table.maxPlayers,
      selected,
    );
    const seated = new Set(
      event.status === "PLANNING"
        ? base.seated.map((row) => row.userId)
        : (table.confirmed?.playerIds ?? []),
    );
    const items: TableSeatResponse[] = rows.slice(0, page.limit).map((row) => {
      const profile = profiles.find((value) => value.clerkId === row.userId);
      return {
        ...row,
        name: profile ? publicUserName(profile) : null,
        email: readOnly || outsideGroup ? null : (profile?.email ?? null),
        gameVotes: readOnly ? {} : row.gameVotes,
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        position:
          event.status !== "PLANNING" && table.confirmed?.playerIds.includes(row.userId)
            ? "FROZEN"
            : seated.has(row.userId)
              ? "SEATED"
              : "WAITING",
      };
    });
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > page.limit && last ? `${last.priorityAt}|${last.sequence}|${last.id}` : null,
    };
  }
  async assertBanAllowed(groupId: string, target: string) {
    const group = await this.groups.find(groupId);
    if (group?.type !== "PUBLIC") return;
    const events = await this.events.groupEvents(groupId),
      tables: TableRecord[] = [];
    for (const event of events) tables.push(...(await this.events.allTables(event.id)));
    if (banHasProtectedParticipation(group.type, events, tables, target, Date.now()))
      throw new CommunityError(409, "BAN_FROZEN_PARTICIPATION");
  }
  async membershipDeparted(groupId: string, target: string, reason: "BAN" | "LEFT") {
    if (reason === "BAN") await this.assertBanAllowed(groupId, target);
    const group = await this.groups.find(groupId);
    if (!group) throw new CommunityError(404, "GROUP_NOT_FOUND");
    for (const initial of await this.events.groupEvents(groupId)) {
      const event = await this.events.lock(initial.id);
      if (!event || event.status === "TERMINATED") continue;
      if (
        reason === "LEFT" &&
        (event.status === "CONFIRMED" || publicBookingIsClosed(event, group.type, Date.now()))
      )
        continue;
      const tables = await this.events.allTables(event.id),
        rows = await this.events.userRegistrations(event.id, target);
      const independentPublicParticipation =
        reason === "LEFT" && eventRecordVisibility(event, group.type) === "PUBLIC";
      const removed = independentPublicParticipation
        ? rows.filter((row) => row.status === "PENDING")
        : rows;
      if (!removed.length && !tables.some((table) => table.demonstratorUserId === target)) continue;
      const at = new Date().toISOString();
      if (independentPublicParticipation) {
        for (const row of removed)
          await this.events.saveRegistration({
            ...row,
            status: "CANCELLED",
            version: row.version + 1,
            updatedAt: at,
          });
      } else await this.events.cancelUser(event.id, target, at);
      for (const table of tables)
        if (table.demonstratorUserId === target) {
          const { demonstratorUserId: _demo, ...rest } = table;
          await this.events.saveTable({ ...rest, updatedAt: at });
        }
      const next: EventRecord = {
        ...event,
        status: "PLANNING",
        version: event.version + 1,
        planningGeneration: event.planningGeneration + Number(event.status === "CONFIRMED"),
        updatedAt: at,
      };
      if (event.status === "CONFIRMED") delete next.lastNotifiedSituation;
      await this.events.save(next);
      await this.notify(
        independentPublicParticipation && rows.some((row) => row.status === "ACCEPTED")
          ? "event_updated"
          : "event_booking_removed",
        next,
        group.adminUserId,
        [target],
      );
      await this.saveSituation(next, group, group.adminUserId);
    }
  }
  private validateResult(table: TableRecord, result: Omit<TableResultsInput, "tableId">) {
    const roster = new Set(table.confirmed?.playerIds ?? []);
    if (
      !roster.size ||
      result.entries.length !== roster.size ||
      new Set(result.entries.map((entry) => entry.userId)).size !== roster.size ||
      result.entries.some(
        (entry) =>
          !roster.has(entry.userId) ||
          (entry.score !== null && normalizeMatchScore(entry.score) !== entry.score),
      )
    )
      throw new CommunityError(400, "RESULTS_REQUIRE_EVERY_PLAYER_ONCE");
    const ties = new Map<string, string[]>();
    for (const entry of result.entries)
      if (entry.score !== null)
        ties.set(entry.score, [...(ties.get(entry.score) ?? []), entry.userId]);
    const seen = new Set<string>();
    for (const tie of result.tieBreaks) {
      const people = ties.get(tie.score);
      if (
        !people ||
        people.length < 2 ||
        seen.has(tie.score) ||
        tie.orderedUserIds.length !== people.length ||
        new Set(tie.orderedUserIds).size !== people.length ||
        tie.orderedUserIds.some((user) => !people.includes(user))
      )
        throw new CommunityError(400, "INVALID_TIE_BREAK");
      seen.add(tie.score);
    }
  }
  async saveResult(userId: string, id: string, tableId: string, input: SaveTableResultInput) {
    const { event, group, own } = await this.context(userId, id, true, true);
    if (event.status !== "CONFIRMED") throw new CommunityError(409, "EVENT_NOT_CONFIRMED");
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    const table = await this.events.table(tableId);
    if (!table || table.eventId !== id) throw new CommunityError(404, "TABLE_NOT_FOUND");
    if (!table.confirmed) throw new CommunityError(409, "TABLE_NOT_CONFIRMED");
    if (table.results) throw new CommunityError(409, "TABLE_RESULTS_IMMUTABLE");
    const { version: _version, ...resultDraft } = input;
    this.validateResult(table, resultDraft);
    const at = new Date().toISOString();
    const saved = { ...table, resultDraft, updatedAt: at };
    await this.events.saveTable(saved);
    const next = { ...event, version: event.version + 1, updatedAt: at };
    await this.events.save(next);
    return {
      event: await this.response(next, group, userId, own, true),
      table: await this.tableResponse(next, group, saved, userId, undefined, true),
    };
  }
  async finalize(userId: string, id: string, input: FinalizeEventInput | FinalizeSavedEventInput) {
    const { event, group } = await this.context(userId, id, true, true);
    if (event.status !== "CONFIRMED") throw new CommunityError(409, "EVENT_NOT_CONFIRMED");
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    if (
      input.shareResultsWithFriends &&
      (!group || eventRecordVisibility(event, group.type) === "PUBLIC")
    )
      throw new CommunityError(400, "EVENT_RESULTS_SHARING_NOT_AVAILABLE");
    const tables = (await this.events.allTables(id)).filter((table) => table.confirmed);
    const savedResults =
      "results" in input
        ? input.results
        : tables.map((table) => {
            if (!table.resultDraft)
              throw new CommunityError(409, "EVERY_INCLUDED_TABLE_RESULT_REQUIRED");
            return { tableId: table.id, ...table.resultDraft };
          });
    if (
      !tables.length ||
      savedResults.length !== tables.length ||
      new Set(savedResults.map((row) => row.tableId)).size !== tables.length ||
      savedResults.some((row) => !tables.some((table) => table.id === row.tableId))
    )
      throw new CommunityError(400, "EVERY_INCLUDED_TABLE_RESULT_REQUIRED");
    const at = new Date().toISOString();
    // Stable physical-outcome order also defines sequential ratings when one person plays several tables.
    tables.sort(
      (a, b) =>
        (a.confirmed?.startsAt ?? "").localeCompare(b.confirmed?.startsAt ?? "") ||
        a.order - b.order,
    );
    for (const table of tables) {
      const result = savedResults.find((row) => row.tableId === table.id);
      if (!result || !table.confirmed || table.results)
        throw new CommunityError(409, "TABLE_RESULTS_IMMUTABLE");
      this.validateResult(table, result);
      const results = {
        lowerWins: result.lowerWins,
        entries: rankMatchResults(result),
        tieBreaks: result.tieBreaks,
        finalizedAt: at,
      };
      const { resultDraft: _draft, ...finished } = table;
      await this.events.saveTable({ ...finished, results, updatedAt: at });
      if (table.rankingEnabled && results.entries.some((entry) => entry.score !== null))
        await this.ratings.applyTableResult(event, table, results);
    }
    const next: EventRecord = {
      ...event,
      status: "TERMINATED",
      shareResultsWithFriends: input.shareResultsWithFriends ?? false,
      version: event.version + 1,
      updatedAt: at,
    };
    await this.events.cancelPending(id, at);
    await this.events.save(next);
    await this.notify("event_terminated", next, userId, [
      ...new Set(tables.flatMap((table) => table.confirmed?.playerIds ?? [])),
    ]);
    return this.response(
      next,
      group,
      userId,
      await this.events.userRegistrations(id, userId),
      true,
    );
  }
}
