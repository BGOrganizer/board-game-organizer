import {
  type Event,
  type EventBooking,
  type EventTable,
  eventModel,
  type Match,
  type MatchInvitation,
  type Organization,
  type OrganizationMembership,
  organizationModel,
} from "@board-game-organizer/schemas";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventsService } from "../events.service";

// Retained legacy source coverage only: this does not enable retired routes or deadline writers.
const now = new Date("2026-11-18T12:00:00.000Z");
const at = now.toISOString();
const admin = "user_admin";
const viewer = "user_viewer";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const eventId = uuid(1);
const organizationId = uuid(2);
const tableId = uuid(3);
const matchId = uuid(4);
const logoId = uuid(5);
const location = {
  id: uuid(6),
  name: "Historical game venue",
  address: "Fixture address",
  latitude: 45,
  longitude: 9,
  timeZone: "Europe/Rome",
};
const organization: Organization = organizationModel.parse({
  id: organizationId,
  adminUserId: admin,
  status: "CREATED",
  approved: { name: "Historical organization", logoAssetId: logoId, location },
  reservedNames: ["historical organization"],
  version: 1,
  createdAt: at,
  updatedAt: at,
});
const event: Event = eventModel.parse({
  id: eventId,
  organizationId,
  adminUserId: admin,
  name: "Historical event",
  timeZone: "Europe/Rome",
  startsAt: "2026-11-20T09:00:00.000Z",
  endsAt: "2026-11-20T19:00:00.000Z",
  bookingClosesAt: "2026-11-19T12:00:00.000Z",
  location,
  status: "PUBLISHED",
  version: 7,
  createdAt: at,
  updatedAt: at,
});
const table: EventTable = {
  id: tableId,
  eventId,
  name: "Historical table",
  startsAt: "2026-11-20T10:00:00.000Z",
  endsAt: "2026-11-20T12:00:00.000Z",
  minPlayers: 2,
  maxPlayers: 4,
  gameId: 1,
  openSkill: true,
  status: "PLANNING",
  matchId,
  createdAt: at,
  updatedAt: at,
};
function booking(n: number, status: EventBooking["status"] = "CONFIRMED"): EventBooking {
  return {
    id: uuid(10 + n),
    eventId,
    tableId,
    userId: n === 1 ? viewer : `user_player_${n}`,
    kind: "REQUEST",
    status,
    createdAt: at,
    updatedAt: at,
  };
}
function member(status: OrganizationMembership["status"] = "ACCEPTED"): OrganizationMembership {
  return {
    id: uuid(20),
    organizationId,
    userId: viewer,
    kind: "REQUEST",
    status,
    createdAt: at,
    updatedAt: at,
  };
}
function previousMatch(status: Match["status"] = "PLANNING"): Match {
  return {
    id: matchId,
    clerkId: admin,
    name: "Historical match",
    dates: [table.startsAt],
    locations: [location],
    gameIds: [1],
    minPlayers: 2,
    maxPlayers: 4,
    status,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: at,
  };
}
function setup(value: Event = event) {
  const state = { event: value };
  const events = {
    find: vi.fn(async (_id: string): Promise<Event | null> => state.event),
    lock: vi.fn(async (_id: string): Promise<Event | null> => state.event),
    save: vi.fn(async (next: Event) => {
      state.event = next;
      return next;
    }),
    countTables: vi.fn(async (_id: string) => 2),
    countConfirmedParticipants: vi.fn(async (_id: string) => 3),
    list: vi.fn(async (): Promise<Event[]> => []),
    findTable: vi.fn(async (_id: string): Promise<EventTable | null> => table),
    listTables: vi.fn(async (): Promise<EventTable[]> => []),
    allTables: vi.fn(async (_id: string): Promise<EventTable[]> => [table]),
    tableBookings: vi.fn(async (_id: string): Promise<EventBooking[]> => []),
    listBookings: vi.fn(async (): Promise<EventBooking[]> => []),
    bookingForUser: vi.fn(async (_id: string, _user: string): Promise<EventBooking | null> => null),
    liveOrganizationEvents: vi.fn(async (_id: string): Promise<Event[]> => [value]),
    saveTable: vi.fn(async (next: EventTable) => next),
    findMatch: vi.fn(async (_id: string): Promise<Match | null> => previousMatch()),
    saveMatch: vi.fn(async (next: Match) => next),
    cancelBookings: vi.fn(async (_id: string, _user?: string) => {}),
    cancelPending: vi.fn(async (_id: string) => {}),
    resetMatchPlayers: vi.fn(async (_id: string, _user?: string) => {}),
    cancelMatch: vi.fn(async (_id: string) => {}),
    syncMatchPlayer: vi.fn(async (_invitation: MatchInvitation) => {}),
  };
  const organizations = {
    find: vi.fn(async (_id: string): Promise<Organization | null> => organization),
    lock: vi.fn(async (_id: string): Promise<Organization | null> => organization),
    findMembership: vi.fn(
      async (_id: string, _user: string): Promise<OrganizationMembership | null> => member(),
    ),
  };
  const assets = { find: vi.fn(async (_id: string) => ({ thumbnailBase64: "uploaded-logo" })) };
  const users = {
    findById: vi.fn(async (_user: string) => ({
      clerkId: "user_demo",
      name: "Demonstrator",
      username: "demonstrator",
      avatarUrl: "https://images.example.test/demo.png",
    })),
    findByIds: vi.fn(async (_ids: string[]) => [
      { clerkId: viewer, name: "Viewer", username: "viewer", avatarUrl: null },
    ]),
  };
  const games = {
    findByIds: vi.fn(async (_ids: number[]) => [
      {
        id: 1,
        name: "Historical game",
        image: "https://images.example.test/game.png",
        yearPublished: 2020,
        average: 8,
        rank: 10,
      },
    ]),
  };
  const notifications = { notifyMany: vi.fn(async (_input: unknown[]) => []) };
  const service = new EventsService(
    events as unknown as ConstructorParameters<typeof EventsService>[0],
    organizations as unknown as ConstructorParameters<typeof EventsService>[1],
    assets as unknown as ConstructorParameters<typeof EventsService>[2],
    users as unknown as ConstructorParameters<typeof EventsService>[3],
    games as unknown as ConstructorParameters<typeof EventsService>[4],
    notifications as unknown as ConstructorParameters<typeof EventsService>[5],
  );
  return { service, state, events, organizations, assets, users, games, notifications };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

it.each(["admin", "member", "visitor"] as const)(
  "projects retained event details for %s without replacing an uploaded logo",
  async (role) => {
    const f = setup();
    if (role === "visitor") f.organizations.findMembership.mockResolvedValue(null);
    const result = await f.service.detail(role === "admin" ? admin : viewer, eventId);
    expect(result).toMatchObject({
      ...event,
      organizationName: "Historical organization",
      logo: "data:image/webp;base64,uploaded-logo",
      role: role === "visitor" ? "visitor" : role,
      tableCount: 2,
      confirmedParticipantCount: 3,
      organizationApproved: true,
      canPublish: true,
      canModify: role === "admin",
    });
    expect(f.assets.find).toHaveBeenCalledExactlyOnceWith(logoId);
    expect(f.events.save).not.toHaveBeenCalled();
  },
);

it("projects a creator-owned draft proposal without loading an unapproved logo", async () => {
  const f = setup({ ...event, status: "DRAFT" });
  f.organizations.find.mockResolvedValue({
    ...organization,
    approved: undefined,
    proposal: organization.approved,
    status: "PENDING",
  });
  await expect(f.service.detail(admin, eventId)).resolves.toMatchObject({
    organizationName: "Historical organization",
    logo: "data:image/webp;base64,",
    organizationApproved: false,
    canPublish: false,
  });
  expect(f.assets.find).not.toHaveBeenCalled();
});

it.each([
  "missing-event",
  "missing-organization",
  "cancelled",
  "foreign-draft",
  "excluded",
] as const)("denies retained event access before enrichment for %s", async (reason) => {
  const f = setup({
    ...event,
    ...(reason === "cancelled"
      ? { status: "CANCELLED" }
      : reason === "foreign-draft"
        ? { status: "DRAFT" }
        : {}),
  });
  if (reason === "missing-event") f.events.find.mockResolvedValue(null);
  if (reason === "missing-organization") f.organizations.find.mockResolvedValue(null);
  if (reason === "excluded") f.organizations.findMembership.mockResolvedValue(member("EXCLUDED"));
  await expect(f.service.detail(viewer, eventId)).rejects.toMatchObject({
    status: reason === "excluded" ? 403 : 404,
    code:
      reason === "missing-organization"
        ? "ORGANIZATION_NOT_FOUND"
        : reason === "excluded"
          ? "ORGANIZATION_EXCLUDED"
          : "EVENT_NOT_FOUND",
  });
  expect(f.assets.find).not.toHaveBeenCalled();
  expect(f.events.countTables).not.toHaveBeenCalled();
});

it("source-pages historical events/tables and enriches only the visible page", async () => {
  const f = setup();
  const page = { limit: 1, cursor: "older", query: "Historical" };
  f.events.list.mockResolvedValue([
    event,
    { ...event, id: uuid(30), createdAt: "2026-11-17T12:00:00.000Z" },
  ]);
  await expect(f.service.list(viewer, page, organizationId, ["future"])).resolves.toMatchObject({
    items: [{ id: eventId }],
    nextCursor: `${at}|${eventId}`,
  });
  expect(f.events.list).toHaveBeenCalledExactlyOnceWith(viewer, page, organizationId, ["future"]);
  expect(f.events.find).toHaveBeenCalledTimes(1);
  f.events.listTables.mockResolvedValue([
    table,
    { ...table, id: uuid(31), createdAt: "2026-11-17T12:00:00.000Z" },
  ]);
  const result = await f.service.tables(viewer, eventId, page);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ id: tableId, gameName: "Historical game" });
  expect(result.nextCursor).toBe(`${at}|${tableId}`);
  expect(f.events.listTables).toHaveBeenCalledExactlyOnceWith(eventId, page);
  expect(f.games.findByIds).toHaveBeenCalledTimes(1);
  f.events.list.mockResolvedValue([]);
  await expect(f.service.list(viewer, { limit: 2 })).resolves.toEqual({
    items: [],
    nextCursor: null,
  });
});

it("hides unapproved organization lists from outsiders and excludes revoked memberships", async () => {
  const f = setup();
  f.organizations.find.mockResolvedValue({
    ...organization,
    approved: undefined,
    proposal: organization.approved,
  });
  await expect(f.service.list(viewer, { limit: 1 }, organizationId)).rejects.toMatchObject({
    code: "ORGANIZATION_NOT_FOUND",
  });
  await expect(f.service.list(admin, { limit: 1 }, organizationId)).resolves.toEqual({
    items: [],
    nextCursor: null,
  });
  f.organizations.find.mockResolvedValue(organization);
  f.organizations.findMembership.mockResolvedValue(member("EXCLUDED"));
  await expect(f.service.list(viewer, { limit: 1 }, organizationId)).rejects.toMatchObject({
    code: "ORGANIZATION_EXCLUDED",
  });
  expect(f.events.list).toHaveBeenCalledTimes(1);
});

it("returns an authorized historical table detail through the real response projection", async () => {
  const f = setup();
  await expect(f.service.tableDetail(admin, eventId, tableId)).resolves.toMatchObject({
    id: tableId,
    gameName: "Historical game",
    canBook: true,
    reservedCount: 0,
    confirmedCount: 0,
  });
  expect(f.events.findTable).toHaveBeenCalledExactlyOnceWith(tableId);
});

it("counts pending reservations without treating them as confirmed and keeps demonstrator profiles member-only", async () => {
  const f = setup();
  const rows = [booking(1), booking(2, "PENDING"), booking(3, "DECLINED")];
  f.events.tableBookings.mockResolvedValue(rows);
  const target = { ...table, demonstratorUserId: "user_demo" };
  await expect(f.service.tableResponse(event, target, viewer)).resolves.toMatchObject({
    confirmedCount: 1,
    reservedCount: 2,
    myBooking: rows[0],
    canBook: false,
    demonstrator: { userId: "user_demo", username: "demonstrator" },
  });
  f.organizations.findMembership.mockResolvedValue(null);
  await expect(f.service.tableResponse(event, target, "user_outsider")).resolves.toMatchObject({
    myBooking: null,
    canBook: false,
    demonstrator: null,
  });
  f.organizations.findMembership.mockResolvedValue(member());
  await expect(f.service.tableResponse(event, table, "user_available")).resolves.toMatchObject({
    canBook: true,
    demonstrator: null,
  });
  f.games.findByIds.mockResolvedValue([]);
  await expect(
    f.service.tableResponse(event, { ...table, status: "CANCELLED" }, viewer),
  ).resolves.toMatchObject({
    gameName: "1",
    image: null,
    rank: null,
    yearPublished: null,
    average: null,
    matchId: undefined,
  });
});

it.each([null, { ...table, eventId: uuid(90) }, { ...table, status: "CANCELLED" as const }])(
  "denies missing, foreign-event and cancelled historical table details",
  async (target) => {
    const f = setup();
    f.events.findTable.mockResolvedValue(target);
    await expect(f.service.tableDetail(viewer, eventId, tableId)).rejects.toMatchObject({
      status: 404,
      code: "TABLE_NOT_FOUND",
    });
    expect(f.events.tableBookings).not.toHaveBeenCalled();
  },
);

it.each([admin, viewer])(
  "returns only the authorized bounded booking page with optional profile enrichment for %s",
  async (actor) => {
    const f = setup();
    const rows = [
      booking(1),
      { ...booking(2), createdAt: "2026-11-17T12:00:00.000Z" },
      { ...booking(3), createdAt: "2026-11-16T12:00:00.000Z" },
    ];
    f.events.listBookings.mockResolvedValue(rows);
    const page = { limit: 2, cursor: "previous" };
    const result = await f.service.bookings(actor, eventId, tableId, page);
    expect(f.events.listBookings).toHaveBeenCalledExactlyOnceWith(
      tableId,
      page,
      actor === admin ? undefined : viewer,
    );
    expect(f.users.findByIds).toHaveBeenCalledExactlyOnceWith([viewer, "user_player_2"]);
    expect(result.items).toEqual([
      { ...rows[0], name: "Viewer", username: "viewer", avatarUrl: null },
      { ...rows[1], name: null, username: null, avatarUrl: null },
    ]);
    expect(result.nextCursor).toBe(`${rows[1].createdAt}|${rows[1].id}`);
  },
);

it("keeps historical booking views member-only and rejects foreign or cancelled table scopes", async () => {
  const f = setup();
  f.organizations.findMembership.mockResolvedValue(null);
  await expect(f.service.bookings(viewer, eventId, tableId, { limit: 2 })).rejects.toMatchObject({
    code: "ORGANIZATION_MEMBER_REQUIRED",
  });
  f.organizations.findMembership.mockResolvedValue(member());
  for (const target of [
    null,
    { ...table, eventId: uuid(90) },
    { ...table, status: "CANCELLED" as const },
  ]) {
    f.events.findTable.mockResolvedValue(target);
    await expect(f.service.bookings(viewer, eventId, tableId, { limit: 2 })).rejects.toMatchObject({
      code: "TABLE_NOT_FOUND",
    });
  }
  expect(f.events.listBookings).not.toHaveBeenCalled();
});

it.each(["missing", "lost-lock", "draft", "cancelled", "closed", "version", "early"] as const)(
  "makes a historical cutoff delivery a no-op for %s",
  async (reason) => {
    const f = setup({
      ...event,
      bookingClosesAt: reason === "early" ? event.bookingClosesAt : at,
      ...(reason === "draft"
        ? { status: "DRAFT" }
        : reason === "cancelled"
          ? { status: "CANCELLED" }
          : reason === "closed"
            ? { closedAt: at }
            : {}),
    });
    if (reason === "missing") f.events.find.mockResolvedValue(null);
    if (reason === "lost-lock") f.events.lock.mockResolvedValue(null);
    await expect(f.service.close(eventId, reason === "version" ? 6 : 7)).resolves.toEqual({
      closed: false,
    });
    expect(f.events.save).not.toHaveBeenCalled();
    expect(f.events.allTables).not.toHaveBeenCalled();
    expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  },
);

it("freezes only confirmed historical bookings, retains the match identity/date and closes once", async () => {
  const f = setup({ ...event, bookingClosesAt: at });
  const rows = [booking(1), booking(2), booking(3, "PENDING"), booking(4, "DECLINED")];
  f.events.tableBookings.mockResolvedValue(rows);
  await expect(f.service.close(eventId, 7)).resolves.toEqual({ closed: true });
  const savedMatch = f.events.saveMatch.mock.calls[0][0];
  expect(savedMatch).toMatchObject({
    id: matchId,
    clerkId: admin,
    status: "CREATED",
    createdAt: previousMatch().createdAt,
    selectedDate: table.startsAt,
    selectedLocationId: location.id,
    selectedGameId: 1,
    eventTable: { organizationId, eventId, tableId, openSkill: true, bookingClosesAt: at },
  });
  expect(f.events.saveTable).toHaveBeenCalledWith(
    expect.objectContaining({ id: tableId, matchId, status: "CREATED" }),
  );
  expect(f.events.syncMatchPlayer.mock.calls.map(([value]) => value)).toEqual(
    rows.slice(0, 2).map((row) => ({
      id: row.id,
      matchId,
      inviterUserId: admin,
      inviteeUserId: row.userId,
      kind: "INVITATION",
      status: "ACCEPTED",
      createdAt: at,
      updatedAt: at,
    })),
  );
  expect(f.events.cancelPending).toHaveBeenCalledExactlyOnceWith(tableId);
  expect(f.notifications.notifyMany).toHaveBeenCalledWith(
    rows.slice(0, 2).map((row) => ({
      kind: "event_table_created",
      actorUserId: admin,
      recipientUserId: row.userId,
      resourceName: `${event.name} · ${table.name}`,
      resourceHref: `/events/${eventId}`,
    })),
  );
  expect(f.state.event).toMatchObject({ version: 7, closedAt: at });
  expect(f.organizations.lock.mock.invocationCallOrder[0]).toBeLessThan(
    f.events.lock.mock.invocationCallOrder[0],
  );
  expect(f.events.saveMatch.mock.invocationCallOrder[0]).toBeLessThan(
    f.events.saveTable.mock.invocationCallOrder[0],
  );
  expect(f.events.cancelPending.mock.invocationCallOrder[0]).toBeLessThan(
    f.events.syncMatchPlayer.mock.invocationCallOrder[0],
  );
  await expect(f.service.close(eventId, 7)).resolves.toEqual({ closed: false });
  expect(f.events.save).toHaveBeenCalledTimes(1);
});

it("creates a missing legacy match identity only after the confirmed roster qualifies", async () => {
  const f = setup({ ...event, bookingClosesAt: at });
  f.events.allTables.mockResolvedValue([{ ...table, matchId: undefined }]);
  f.events.tableBookings.mockResolvedValue([booking(1), booking(2)]);
  await expect(f.service.close(eventId)).resolves.toEqual({ closed: true });
  const saved = f.events.saveMatch.mock.calls[0][0];
  expect(saved.id).toMatch(/^[a-f\d-]{36}$/);
  expect(saved.id).not.toBe(matchId);
  expect(saved.createdAt).toBe(at);
  expect(f.events.findMatch).not.toHaveBeenCalled();
  expect(f.events.saveTable).toHaveBeenCalledWith(expect.objectContaining({ matchId: saved.id }));
  expect(f.events.syncMatchPlayer.mock.calls.map(([row]) => row.matchId)).toEqual([
    saved.id,
    saved.id,
  ]);
});

it("fails closed when the historical parent organization disappears before its lock", async () => {
  const f = setup({ ...event, bookingClosesAt: at });
  f.organizations.lock.mockResolvedValueOnce(null);
  await expect(f.service.close(eventId)).rejects.toMatchObject({
    status: 404,
    code: "ORGANIZATION_NOT_FOUND",
  });
  expect(f.events.lock).not.toHaveBeenCalled();
  expect(f.events.save).not.toHaveBeenCalled();
});

it("cancels an underfilled historical table and releases reserved bookings before marking the event closed", async () => {
  const f = setup({ ...event, bookingClosesAt: at });
  f.events.allTables.mockResolvedValue([{ ...table, demonstratorUserId: "user_demo" }]);
  const rows = [booking(1), booking(2, "PENDING"), booking(3, "DECLINED")];
  f.events.tableBookings.mockResolvedValue(rows);
  await expect(f.service.close(eventId)).resolves.toEqual({ closed: true });
  expect(f.events.cancelBookings).toHaveBeenCalledExactlyOnceWith(tableId);
  expect(f.events.resetMatchPlayers).toHaveBeenCalledExactlyOnceWith(matchId);
  expect(f.events.cancelMatch).toHaveBeenCalledExactlyOnceWith(matchId);
  expect(f.events.saveTable).toHaveBeenCalledWith(expect.objectContaining({ status: "CANCELLED" }));
  expect(f.events.saveMatch).not.toHaveBeenCalled();
  expect(f.events.syncMatchPlayer).not.toHaveBeenCalled();
  expect(f.notifications.notifyMany.mock.calls.flatMap(([rows]) => rows)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "event_table_cancelled", recipientUserId: viewer }),
      expect.objectContaining({ kind: "event_booking_removed", recipientUserId: "user_player_2" }),
      expect.objectContaining({ kind: "event_demonstrator", recipientUserId: "user_demo" }),
    ]),
  );
  expect(f.events.cancelMatch.mock.invocationCallOrder[0]).toBeLessThan(
    f.events.save.mock.invocationCallOrder[0],
  );
});

it("never rewrites immutable historical match results or marks an uncommitted cutoff successful", async () => {
  const f = setup({ ...event, bookingClosesAt: at });
  f.events.tableBookings.mockResolvedValue([booking(1), booking(2)]);
  f.events.findMatch.mockResolvedValue(previousMatch("TERMINATED"));
  await expect(f.service.close(eventId)).rejects.toMatchObject({
    status: 409,
    code: "TABLE_RESULTS_IMMUTABLE",
  });
  expect(f.events.saveMatch).not.toHaveBeenCalled();
  expect(f.events.save).not.toHaveBeenCalled();
  f.events.findMatch.mockResolvedValue(null);
  const failure = new Error("Match write unavailable");
  f.events.saveMatch.mockRejectedValueOnce(failure);
  await expect(f.service.close(eventId)).rejects.toBe(failure);
  expect(f.events.saveTable).not.toHaveBeenCalled();
  expect(f.events.save).not.toHaveBeenCalled();
});

it("runs the retained due-detail cutoff once and rejects a record disappearing after closure", async () => {
  const f = setup({ ...event, bookingClosesAt: at });
  f.events.allTables.mockResolvedValue([]);
  await expect(f.service.detail(admin, eventId)).resolves.toMatchObject({
    closedAt: at,
    canModify: false,
  });
  expect(f.events.save).toHaveBeenCalledTimes(1);
  const missing = setup({ ...event, bookingClosesAt: at });
  missing.events.allTables.mockResolvedValue([]);
  missing.events.find
    .mockResolvedValueOnce(missing.state.event)
    .mockResolvedValueOnce(missing.state.event)
    .mockResolvedValueOnce(null);
  await expect(missing.service.detail(admin, eventId)).rejects.toMatchObject({
    code: "EVENT_NOT_FOUND",
  });
});

it("releases a departing historical demonstrator's roster and resynchronizes its existing match without retaining the role", async () => {
  const f = setup();
  f.events.allTables.mockResolvedValue([{ ...table, demonstratorUserId: viewer }]);
  f.events.tableBookings.mockResolvedValue([
    booking(1),
    booking(2, "PENDING"),
    booking(3, "DECLINED"),
  ]);
  await f.service.membershipDeparted(organizationId, viewer);
  expect(f.events.liveOrganizationEvents).toHaveBeenCalledExactlyOnceWith(organizationId);
  expect(f.events.cancelBookings).toHaveBeenCalledExactlyOnceWith(tableId);
  expect(f.events.resetMatchPlayers).toHaveBeenCalledExactlyOnceWith(matchId);
  const updated = f.events.saveTable.mock.calls[0][0];
  expect(updated).not.toHaveProperty("demonstratorUserId");
  expect(updated).toMatchObject({ id: tableId, matchId });
  expect(f.events.saveMatch.mock.calls[0][0].eventTable).not.toHaveProperty("demonstratorUserId");
  expect(f.notifications.notifyMany.mock.calls.flatMap(([rows]) => rows)).toContainEqual(
    expect.objectContaining({ kind: "event_demonstrator", recipientUserId: viewer }),
  );
});

it("releases only the departing user's active historical booking, leaving closed and vanished events untouched", async () => {
  const f = setup();
  f.events.liveOrganizationEvents.mockResolvedValue([
    event,
    { ...event, id: uuid(40) },
    { ...event, id: uuid(41) },
  ]);
  f.events.lock
    .mockResolvedValueOnce(event)
    .mockResolvedValueOnce({ ...event, closedAt: at })
    .mockResolvedValueOnce(null);
  f.events.bookingForUser.mockResolvedValue(booking(1, "PENDING"));
  await f.service.membershipDeparted(organizationId, viewer);
  expect(f.events.allTables).toHaveBeenCalledExactlyOnceWith(eventId);
  expect(f.events.cancelBookings).toHaveBeenCalledExactlyOnceWith(tableId, viewer);
  expect(f.events.resetMatchPlayers).toHaveBeenCalledExactlyOnceWith(matchId, viewer);
  expect(f.events.saveTable).not.toHaveBeenCalled();
  expect(f.events.saveMatch).not.toHaveBeenCalled();
  f.events.liveOrganizationEvents.mockResolvedValue([event]);
  f.events.lock.mockResolvedValue(event);
  f.events.bookingForUser.mockResolvedValue(booking(1, "DECLINED"));
  await f.service.membershipDeparted(organizationId, viewer);
  expect(f.events.cancelBookings).toHaveBeenCalledTimes(1);
});
