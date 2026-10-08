import { randomUUID } from "node:crypto";
import type {
  CommunityNotificationKind,
  Event,
  EventBooking,
  EventBookingAction,
  EventBookingResponse,
  EventPeriod,
  EventResponse,
  EventTable,
  EventTableInput,
  EventTableResponse,
  Match,
  Organization,
  SaveEventInput,
  UpdateEventInput,
} from "@board-game-organizer/schemas";
import {
  canModifyEvent,
  confirmedEventPlayers,
  eventBookingReservesSeat,
  eventScheduleChanged,
  eventTableChanged,
  hasConflictingEventBooking,
} from "@board-game-organizer/shared";
import { CommunityError } from "../community.error";
import type { BoardGamesRepository } from "../games/boardGames.repository";
import { verifyCommunityLocation } from "../locations/community-location";
import type { NotificationsRepository } from "../notifications/notifications.repository";
import type { OrganizationAssetsRepository } from "../organizations/organization-assets.repository";
import type {
  CommunityPage,
  OrganizationsRepository,
} from "../organizations/organizations.repository";
import type { UsersRepository } from "../users/users.repository";
import { deadlineServiceConfigured } from "./event-deadlines";
import type { EventsRepository } from "./events.repository";

const iso = (value: string) => new Date(value).toISOString();
export class EventsService {
  constructor(
    private events: EventsRepository,
    private organizations: OrganizationsRepository,
    private assets: OrganizationAssetsRepository,
    private users: UsersRepository,
    private games: BoardGamesRepository,
    private notifications: NotificationsRepository,
  ) {}

  private async organization(id: string, lock = false) {
    const value = lock ? await this.organizations.lock(id) : await this.organizations.find(id);
    if (!value) throw new CommunityError(404, "ORGANIZATION_NOT_FOUND");
    return value;
  }
  private async member(organization: Organization, userId: string) {
    if (organization.adminUserId === userId) return;
    if ((await this.organizations.findMembership(organization.id, userId))?.status !== "ACCEPTED")
      throw new CommunityError(403, "ORGANIZATION_MEMBER_REQUIRED");
  }
  private async access(event: Event, userId: string) {
    const organization = await this.organization(event.organizationId);
    if (event.status === "CANCELLED" || (event.status === "DRAFT" && event.adminUserId !== userId))
      throw new CommunityError(404, "EVENT_NOT_FOUND");
    if ((await this.organizations.findMembership(organization.id, userId))?.status === "EXCLUDED")
      throw new CommunityError(403, "ORGANIZATION_EXCLUDED");
    return organization;
  }
  private async locked(userId: string, id: string, admin = false) {
    const initial = await this.events.find(id);
    if (!initial) throw new CommunityError(404, "EVENT_NOT_FOUND");
    const organization = await this.organization(initial.organizationId, true);
    const event = await this.events.lock(id);
    if (!event) throw new CommunityError(404, "EVENT_NOT_FOUND");
    if (admin && event.adminUserId !== userId)
      throw new CommunityError(403, "ORGANIZATION_ADMIN_REQUIRED");
    if (!canModifyEvent(event, Date.now())) throw new CommunityError(409, "EVENT_CLOSED");
    return { event, organization };
  }
  private async notify(
    kind: CommunityNotificationKind,
    event: Event,
    actor: string,
    recipients: string[],
    table?: EventTable,
  ) {
    await this.notifications.notifyMany(
      [...new Set(recipients)].map((recipientUserId) => ({
        kind,
        actorUserId: actor,
        recipientUserId,
        resourceName: table ? `${event.name} · ${table.name}` : event.name,
        resourceHref: `/events/${event.id}`,
      })),
    );
  }
  private async response(event: Event, userId: string): Promise<EventResponse> {
    const organization = await this.access(event, userId);
    const membership = await this.organizations.findMembership(organization.id, userId);
    const asset = organization.approved
      ? await this.assets.find(organization.approved.logoAssetId)
      : null;
    return {
      ...event,
      organizationName: organization.approved?.name ?? organization.proposal?.name ?? "",
      logo: `data:image/webp;base64,${asset?.thumbnailBase64 ?? ""}`,
      tableCount: await this.events.countTables(event.id),
      role:
        event.adminUserId === userId
          ? "admin"
          : membership?.status === "ACCEPTED"
            ? "member"
            : "visitor",
      canModify: event.adminUserId === userId && canModifyEvent(event, Date.now()),
      canPublish: Boolean(organization.approved) && deadlineServiceConfigured(),
    };
  }
  async detail(userId: string, id: string) {
    let event = await this.events.find(id);
    if (!event) throw new CommunityError(404, "EVENT_NOT_FOUND");
    await this.access(event, userId);
    if (
      event.status === "PUBLISHED" &&
      !event.closedAt &&
      Date.now() >= Date.parse(event.bookingClosesAt)
    ) {
      await this.close(id);
      event = await this.events.find(id);
      if (!event) throw new CommunityError(404, "EVENT_NOT_FOUND");
    }
    return this.response(event, userId);
  }
  async list(
    userId: string,
    page: CommunityPage,
    organizationId?: string,
    periods?: readonly EventPeriod[],
  ) {
    if (organizationId) {
      const organization = await this.organization(organizationId);
      if (!organization.approved && organization.adminUserId !== userId)
        throw new CommunityError(404, "ORGANIZATION_NOT_FOUND");
      if ((await this.organizations.findMembership(organizationId, userId))?.status === "EXCLUDED")
        throw new CommunityError(403, "ORGANIZATION_EXCLUDED");
    }
    const rows = await this.events.list(userId, page, organizationId, periods);
    const items: EventResponse[] = [];
    for (const row of rows.slice(0, page.limit)) items.push(await this.detail(userId, row.id));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  private publishable(organization: Organization, input: SaveEventInput) {
    if (input.status === "PUBLISHED") {
      if (!organization.approved) throw new CommunityError(409, "ORGANIZATION_NOT_APPROVED");
      if (!deadlineServiceConfigured())
        throw new CommunityError(503, "DEADLINE_SERVICE_UNAVAILABLE");
    }
    if (Date.parse(input.bookingClosesAt) <= Date.now())
      throw new CommunityError(409, "BOOKING_DEADLINE_PASSED");
    if (Date.parse(input.startsAt) <= Date.now())
      throw new CommunityError(400, "EVENT_MUST_BE_FUTURE");
  }
  private async validateTables(organization: Organization, input: EventTableInput[]) {
    const games = await this.games.findByIds([...new Set(input.map((table) => table.gameId))]);
    for (const table of input) {
      if (!games.some((game) => game.id === table.gameId && game.isExpansion !== true))
        throw new CommunityError(400, "GAME_NOT_FOUND");
      if (table.demonstratorUserId) await this.member(organization, table.demonstratorUserId);
    }
  }
  private table(input: EventTableInput, eventId: string, previous?: EventTable): EventTable {
    return {
      id: previous?.id ?? randomUUID(),
      eventId,
      name: input.name,
      startsAt: iso(input.startsAt),
      endsAt: iso(input.endsAt),
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      gameId: input.gameId,
      openSkill: input.openSkill,
      ...(input.demonstratorUserId ? { demonstratorUserId: input.demonstratorUserId } : {}),
      ...(previous?.matchId ? { matchId: previous.matchId } : {}),
      status: "PLANNING",
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  private async syncMatch(event: Event, table: EventTable) {
    const id = table.matchId ?? randomUUID();
    const previous = table.matchId ? await this.events.findMatch(id) : null;
    if (previous?.status === "TERMINATED") throw new CommunityError(409, "TABLE_RESULTS_IMMUTABLE");
    const match: Match = {
      id,
      clerkId: event.adminUserId,
      name: `${table.name} · ${event.name}`.slice(0, 120),
      dates: [table.startsAt],
      locations: [event.location],
      minPlayers: table.minPlayers,
      maxPlayers: table.maxPlayers,
      gameIds: [table.gameId],
      isPublic: false,
      choices: {},
      status: table.status === "CREATED" ? "CREATED" : "PLANNING",
      selectedDate: table.startsAt,
      selectedGameId: table.gameId,
      selectedLocationId: event.location.id,
      eventTable: {
        organizationId: event.organizationId,
        eventId: event.id,
        tableId: table.id,
        eventName: event.name,
        tableName: table.name,
        ...(table.demonstratorUserId ? { demonstratorUserId: table.demonstratorUserId } : {}),
        openSkill: table.openSkill,
        bookingClosesAt: event.bookingClosesAt,
        endsAt: table.endsAt,
      },
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.events.saveMatch(match);
    await this.events.saveTable({ ...table, matchId: id });
    return { ...table, matchId: id };
  }
  async create(userId: string, organizationId: string, input: SaveEventInput) {
    const organization = await this.organization(organizationId, true);
    if (organization.adminUserId !== userId)
      throw new CommunityError(403, "ORGANIZATION_ADMIN_REQUIRED");
    this.publishable(organization, input);
    if (input.tables.some((table) => table.id)) throw new CommunityError(400, "INVALID_TABLE_ID");
    await this.validateTables(organization, input.tables);
    const event: Event = {
      id: randomUUID(),
      organizationId,
      adminUserId: userId,
      name: input.name,
      timeZone: input.timeZone,
      startsAt: iso(input.startsAt),
      endsAt: iso(input.endsAt),
      bookingClosesAt: iso(input.bookingClosesAt),
      location: await verifyCommunityLocation(input.location),
      status: input.status,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.events.save(event);
    for (const value of input.tables) {
      const table = this.table(value, event.id);
      await this.events.saveTable(table);
      if (event.status === "PUBLISHED") {
        await this.syncMatch(event, table);
        if (table.demonstratorUserId)
          await this.notify("event_demonstrator", event, userId, [table.demonstratorUserId], table);
      }
    }
    if (event.status === "PUBLISHED") {
      await this.events.schedule(event);
      await this.notifyPublished(event, userId);
    }
    return this.response(event, userId);
  }
  private async notifyPublished(
    event: Event,
    actor: string,
    kind: "event_published" | "event_updated" | "event_cancelled" = "event_published",
  ) {
    // Batched source pagination: publication must reach every confirmed member.
    let cursor: string | undefined;
    do {
      const page = await this.organizations.listMemberships(event.organizationId, ["ACCEPTED"], {
        limit: 50,
        cursor,
      });
      const batch = page.slice(0, 50);
      await this.notify(
        kind,
        event,
        actor,
        batch.map((row) => row.userId),
      );
      const last = batch.at(-1);
      cursor = page.length > 50 && last ? `${last.createdAt}|${last.id}` : undefined;
    } while (cursor);
  }
  async update(userId: string, id: string, input: UpdateEventInput) {
    const { event, organization } = await this.locked(userId, id, true);
    if (event.version !== input.version) throw new CommunityError(409, "EVENT_CHANGED");
    if (event.status === "PUBLISHED" && input.status !== "PUBLISHED")
      throw new CommunityError(409, "PUBLISHED_EVENT_CANNOT_BECOME_DRAFT");
    this.publishable(organization, input);
    const existing = await this.events.allTables(id);
    for (const target of input.removedTableIds)
      if (!existing.some((table) => table.id === target))
        throw new CommunityError(400, "INVALID_TABLE_ID");
    for (const target of input.tables)
      if (target.id && !existing.some((table) => table.id === target.id))
        throw new CommunityError(400, "INVALID_TABLE_ID");
    const next: Event = {
      ...event,
      name: input.name,
      startsAt: iso(input.startsAt),
      endsAt: iso(input.endsAt),
      timeZone: input.timeZone,
      bookingClosesAt: iso(input.bookingClosesAt),
      location: await verifyCommunityLocation(input.location, [event.location]),
      status: input.status,
      version: event.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const globalReset = eventScheduleChanged(event, input);
    const combined = existing
      .filter((table) => !input.removedTableIds.includes(table.id))
      .map((table) => {
        const update = input.tables.find((value) => value.id === table.id);
        return update ? this.table(update, id, table) : table;
      });
    for (const table of input.tables.filter((value) => !value.id))
      combined.push(this.table(table, id));
    if (next.status === "PUBLISHED" && combined.length === 0)
      throw new CommunityError(400, "EVENT_REQUIRES_TABLE");
    for (const table of combined)
      if (
        Date.parse(table.startsAt) < Date.parse(next.startsAt) ||
        Date.parse(table.endsAt) > Date.parse(next.endsAt)
      )
        throw new CommunityError(409, "TABLE_OUTSIDE_EVENT");
    await this.validateTables(organization, combined);
    for (const table of existing.filter((value) => input.removedTableIds.includes(value.id)))
      await this.cancelTable(event, table, userId);
    for (const table of combined) {
      const old = existing.find((value) => value.id === table.id);
      if (old && (globalReset || eventTableChanged(old, table)))
        await this.resetTable(event, old, userId);
      await this.events.saveTable(table);
      if (next.status === "PUBLISHED") await this.syncMatch(next, table);
      if (next.status === "PUBLISHED" && old?.demonstratorUserId !== table.demonstratorUserId) {
        await this.notify(
          "event_demonstrator",
          next,
          userId,
          [old?.demonstratorUserId, table.demonstratorUserId].filter((value): value is string =>
            Boolean(value),
          ),
          table,
        );
      }
    }
    await this.events.save(next);
    if (next.status === "PUBLISHED") {
      await this.events.schedule(next);
      if (event.status === "DRAFT") await this.notifyPublished(next, userId);
      else await this.notifyPublished(next, userId, "event_updated");
    }
    const response = await this.response(next, userId);
    if (!canModifyEvent(event, Date.now())) throw new CommunityError(409, "EVENT_CLOSED");
    return response;
  }
  private async resetTable(event: Event, table: EventTable, actor: string) {
    const bookings = await this.events.tableBookings(table.id);
    await this.events.cancelBookings(table.id);
    if (table.matchId) await this.events.resetMatchPlayers(table.matchId);
    await this.notify(
      "event_booking_removed",
      event,
      actor,
      bookings.filter(eventBookingReservesSeat).map((row) => row.userId),
      table,
    );
  }
  private async cancelTable(event: Event, table: EventTable, actor: string) {
    await this.resetTable(event, table, actor);
    await this.events.saveTable({
      ...table,
      status: "CANCELLED",
      updatedAt: new Date().toISOString(),
    });
    if (table.matchId) await this.events.cancelMatch(table.matchId);
    if (table.demonstratorUserId)
      await this.notify("event_demonstrator", event, actor, [table.demonstratorUserId], table);
  }
  async cancel(userId: string, id: string) {
    const { event } = await this.locked(userId, id, true);
    for (const table of await this.events.allTables(id))
      await this.cancelTable(event, table, userId);
    await this.events.save({
      ...event,
      status: "CANCELLED",
      version: event.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await this.notify("event_cancelled", event, userId, [userId]);
    if (event.status === "PUBLISHED") await this.notifyPublished(event, userId, "event_cancelled");
    if (!canModifyEvent(event, Date.now())) throw new CommunityError(409, "EVENT_CLOSED");
    return { success: true };
  }
  async tableResponse(
    event: Event,
    table: EventTable,
    userId: string,
  ): Promise<EventTableResponse> {
    const bookings = await this.events.tableBookings(table.id);
    const game = (await this.games.findByIds([table.gameId]))[0];
    const organization = await this.organization(event.organizationId);
    const membership =
      event.adminUserId === userId ||
      (await this.organizations.findMembership(organization.id, userId))?.status === "ACCEPTED";
    const demonstrator = table.demonstratorUserId
      ? await this.users.findById(table.demonstratorUserId)
      : null;
    const mine =
      bookings.find((row) => row.userId === userId && eventBookingReservesSeat(row)) ?? null;
    const reservedCount = bookings.filter(eventBookingReservesSeat).length;
    return {
      ...table,
      matchId: table.status === "CANCELLED" ? undefined : table.matchId,
      gameName: game?.name ?? String(table.gameId),
      image: game?.image ?? null,
      confirmedCount: confirmedEventPlayers(bookings).length,
      reservedCount,
      myBooking: mine,
      canBook:
        membership &&
        event.status === "PUBLISHED" &&
        canModifyEvent(event, Date.now()) &&
        !mine &&
        reservedCount < table.maxPlayers,
      demonstrator:
        demonstrator && membership
          ? {
              userId: demonstrator.clerkId,
              username: demonstrator.username ?? null,
              avatarUrl: demonstrator.avatarUrl ?? null,
            }
          : null,
    };
  }
  async tableDetail(userId: string, id: string, tableId: string) {
    const event = await this.detail(userId, id);
    const table = await this.events.findTable(tableId);
    if (!table || table.eventId !== id || table.status === "CANCELLED")
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    return this.tableResponse(event, table, userId);
  }
  async tables(userId: string, id: string, page: CommunityPage) {
    const event = await this.detail(userId, id);
    const rows = await this.events.listTables(id, page);
    const items: EventTableResponse[] = [];
    for (const row of rows.slice(0, page.limit))
      items.push(await this.tableResponse(event, row, userId));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  async book(userId: string, id: string, tableId: string, invitee?: string) {
    const { event, organization } = await this.locked(userId, id, Boolean(invitee));
    if (event.status !== "PUBLISHED") throw new CommunityError(409, "EVENT_NOT_PUBLISHED");
    const target = invitee ?? userId;
    await this.member(organization, target);
    const table = await this.events.findTable(tableId);
    if (!table || table.eventId !== id || table.status !== "PLANNING")
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    const current = await this.events.bookingForUser(tableId, target);
    if (current && eventBookingReservesSeat(current))
      throw new CommunityError(409, "BOOKING_ALREADY_ACTIVE");
    await this.checkBooking(event, table, target);
    const booking: EventBooking = {
      id: current?.id ?? randomUUID(),
      eventId: id,
      tableId,
      userId: target,
      kind: invitee ? "INVITATION" : "REQUEST",
      status: "PENDING",
      createdAt: current?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.events.saveBooking(booking);
    await this.notify(
      invitee ? "event_updated" : "event_booking_requested",
      event,
      userId,
      [invitee ?? event.adminUserId],
      table,
    );
    if (!canModifyEvent(event, Date.now())) throw new CommunityError(409, "EVENT_CLOSED");
    return booking;
  }
  private async checkBooking(
    event: Event,
    table: EventTable,
    target: string,
    current?: EventBooking,
  ) {
    const all = await this.events.tableBookings(table.id);
    if (
      all.filter((row) => eventBookingReservesSeat(row) && row.id !== current?.id).length >=
      table.maxPlayers
    )
      throw new CommunityError(409, "TABLE_FULL");
    const other = await this.events.userBookings(event.id, target);
    if (
      hasConflictingEventBooking(
        table,
        target,
        other,
        await this.events.tablesByIds(other.map((row) => row.tableId)),
      )
    )
      throw new CommunityError(409, "TABLE_TIME_CONFLICT");
  }
  async bookingAction(userId: string, bookingId: string, action: EventBookingAction["action"]) {
    const initial = await this.events.findBooking(bookingId);
    if (!initial) throw new CommunityError(404, "BOOKING_NOT_FOUND");
    const { event, organization } = await this.locked(userId, initial.eventId);
    const booking = await this.events.findBooking(bookingId);
    if (!booking || !eventBookingReservesSeat(booking))
      throw new CommunityError(409, "BOOKING_CHANGED");
    const own = booking.userId === userId;
    const admin = event.adminUserId === userId;
    let status: EventBooking["status"];
    if (action === "accept" || action === "decline") {
      if (!own || booking.kind !== "INVITATION")
        throw new CommunityError(403, "INVITATION_RECIPIENT_REQUIRED");
      if (booking.status !== "PENDING") throw new CommunityError(409, "BOOKING_CHANGED");
      status = action === "accept" ? "CONFIRMED" : "DECLINED";
    } else if (action === "approve" || action === "reject") {
      if (!admin || booking.kind !== "REQUEST")
        throw new CommunityError(403, "ORGANIZATION_ADMIN_REQUIRED");
      if (booking.status !== "PENDING") throw new CommunityError(409, "BOOKING_CHANGED");
      status = action === "approve" ? "CONFIRMED" : "DECLINED";
    } else {
      if (!(action === "cancel" && own) && !(action === "remove" && admin))
        throw new CommunityError(403, "BOOKING_ACTION_FORBIDDEN");
      status = "CANCELLED";
    }
    const table = await this.events.findTable(booking.tableId);
    if (!table || table.status !== "PLANNING") throw new CommunityError(409, "TABLE_CLOSED");
    if (status === "CONFIRMED") {
      await this.member(organization, booking.userId);
      await this.checkBooking(event, table, booking.userId, booking);
    }
    const next = { ...booking, status, updatedAt: new Date().toISOString() };
    await this.events.saveBooking(next);
    if (table.matchId) {
      if (status === "CONFIRMED")
        await this.events.syncMatchPlayer({
          id: next.id,
          matchId: table.matchId,
          inviterUserId: event.adminUserId,
          inviteeUserId: next.userId,
          kind: "INVITATION",
          status: "ACCEPTED",
          createdAt: next.createdAt,
          updatedAt: next.updatedAt,
        });
      else await this.events.resetMatchPlayers(table.matchId, booking.userId);
    }
    await this.notify(
      status === "CONFIRMED" ? "event_booking_confirmed" : "event_booking_removed",
      event,
      userId,
      [own ? event.adminUserId : booking.userId],
      table,
    );
    if (!canModifyEvent(event, Date.now())) throw new CommunityError(409, "EVENT_CLOSED");
    return next;
  }
  async bookings(userId: string, id: string, tableId: string, page: CommunityPage) {
    const event = await this.detail(userId, id);
    const organization = await this.organization(event.organizationId);
    await this.member(organization, userId);
    const table = await this.events.findTable(tableId);
    if (!table || table.eventId !== id || table.status === "CANCELLED")
      throw new CommunityError(404, "TABLE_NOT_FOUND");
    const rows = await this.events.listBookings(
      tableId,
      page,
      event.adminUserId === userId ? undefined : userId,
    );
    const visible = rows.slice(0, page.limit);
    const profiles = await this.users.findByIds(visible.map((row) => row.userId));
    const items: EventBookingResponse[] = visible.map((row) => {
      const profile = profiles.find((value) => value.clerkId === row.userId);
      return { ...row, username: profile?.username ?? null, avatarUrl: profile?.avatarUrl ?? null };
    });
    const last = rows[Math.min(rows.length, page.limit) - 1];
    return {
      items,
      nextCursor: rows.length > page.limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }
  async close(id: string, version?: number) {
    const initial = await this.events.find(id);
    if (!initial) return { closed: false };
    await this.organization(initial.organizationId, true);
    const event = await this.events.lock(id);
    if (
      !event ||
      event.status !== "PUBLISHED" ||
      event.closedAt ||
      (version !== undefined && event.version !== version) ||
      Date.now() < Date.parse(event.bookingClosesAt)
    )
      return { closed: false };
    for (const table of await this.events.allTables(id)) {
      const bookings = await this.events.tableBookings(table.id);
      const confirmed = confirmedEventPlayers(bookings);
      if (confirmed.length < table.minPlayers) {
        await this.notify(
          "event_table_cancelled",
          event,
          event.adminUserId,
          bookings.filter(eventBookingReservesSeat).map((row) => row.userId),
          table,
        );
        await this.cancelTable(event, table, event.adminUserId);
      } else {
        const updated = await this.syncMatch(event, {
          ...table,
          status: "CREATED",
          updatedAt: new Date().toISOString(),
        });
        await this.events.cancelPending(table.id);
        // Roster is frozen at cutoff: later departures/exclusions do not alter these confirmed ids.
        for (const booking of bookings.filter((row) => row.status === "CONFIRMED"))
          await this.events.syncMatchPlayer({
            id: booking.id,
            matchId: updated.matchId,
            inviterUserId: event.adminUserId,
            inviteeUserId: booking.userId,
            kind: "INVITATION",
            status: "ACCEPTED",
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt,
          });
        await this.notify("event_table_created", event, event.adminUserId, confirmed, updated);
      }
    }
    await this.events.save({
      ...event,
      closedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { closed: true };
  }
  async membershipDeparted(organizationId: string, userId: string) {
    for (const initial of await this.events.liveOrganizationEvents(organizationId)) {
      const event = await this.events.lock(initial.id);
      if (!event || !canModifyEvent(event, Date.now())) continue;
      for (const table of await this.events.allTables(event.id)) {
        if (table.demonstratorUserId === userId) {
          await this.resetTable(event, table, event.adminUserId);
          const { demonstratorUserId: _removed, ...remaining } = table;
          await this.syncMatch(event, { ...remaining, updatedAt: new Date().toISOString() });
          await this.notify("event_demonstrator", event, event.adminUserId, [userId], table);
        } else {
          const booking = await this.events.bookingForUser(table.id, userId);
          if (booking && eventBookingReservesSeat(booking)) {
            await this.events.cancelBookings(table.id, userId);
            if (table.matchId) await this.events.resetMatchPlayers(table.matchId, userId);
            await this.notify("event_booking_removed", event, event.adminUserId, [userId], table);
          }
        }
      }
    }
  }
}
