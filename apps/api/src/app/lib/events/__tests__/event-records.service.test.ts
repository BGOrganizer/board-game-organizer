import type {
  CreatePlannedEventInput,
  EventRecord,
  EventVoter,
  GroupRecord,
  JoinEventAvailability,
  TableRecord,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventRecordsService } from "../event-records.service";

vi.mock("../../locations/community-location", () => ({
  verifyCommunityLocation: vi.fn(async (value) => value),
}));
const owner = "user_owner",
  guest = "user_guest",
  waiter = "user_waiter";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const location = {
  id,
  name: "Club location",
  address: "Via Roma 1, Roma, Italia",
  latitude: 41.9,
  longitude: 12.5,
};
const body = (): CreatePlannedEventInput => ({
  groupId: null,
  name: "Evening event",
  dates: [{ id, day: "2027-01-03" }],
  locations: [location],
  timeZone: "UTC",
  startTime: "09:00",
  tables: [
    {
      id,
      name: "First table",
      minPlayers: 2,
      maxPlayers: 2,
      games: [{ gameId: 1 }],
      rankingEnabled: true,
    },
  ],
});
const clone = <T>(value: T): T => structuredClone(value);
function setup(type: "PRIVATE" | "PUBLIC" | null = null) {
  const events = new Map<string, EventRecord>(),
    tables = new Map<string, TableRecord>(),
    registrations = new Map<string, TableRegistration>(),
    votes = new Map<string, EventVoter>();
  const active = (eventId: string) =>
    [...registrations.values()].filter(
      (row) => row.eventId === eventId && (row.status === "PENDING" || row.status === "ACCEPTED"),
    );
  const group = type
    ? ({
        id: other,
        type,
        adminUserId: owner,
        approved: { name: "Club group", location },
      } as GroupRecord)
    : null;
  const repo = {
    find: vi.fn(async (key: string) => clone(events.get(key) ?? null)),
    lock: vi.fn(async (key: string) => clone(events.get(key) ?? null)),
    create: vi.fn(async (row: EventRecord) => {
      events.set(row.id, clone(row));
    }),
    save: vi.fn(async (row: EventRecord) => {
      events.set(row.id, clone(row));
    }),
    table: vi.fn(async (key: string) =>
      clone(tables.get(key)?.removedAt ? null : (tables.get(key) ?? null)),
    ),
    storedTable: vi.fn(async (key: string) => clone(tables.get(key) ?? null)),
    saveTable: vi.fn(async (row: TableRecord) => {
      tables.set(row.id, clone(row));
    }),
    allTables: vi.fn(async (eventId: string) =>
      clone(
        [...tables.values()]
          .filter((row) => row.eventId === eventId && !row.removedAt)
          .sort((a, b) => a.order - b.order),
      ),
    ),
    allRegistrations: vi.fn(async (eventId: string) => clone(active(eventId))),
    userRegistrations: vi.fn(async (eventId: string, userId: string) =>
      clone(active(eventId).filter((row) => row.userId === userId)),
    ),
    userRegistration: vi.fn(async (tableId: string, userId: string) =>
      clone(
        [...registrations.values()].find(
          (row) => row.tableId === tableId && row.userId === userId,
        ) ?? null,
      ),
    ),
    registration: vi.fn(async (key: string) => clone(registrations.get(key) ?? null)),
    saveRegistration: vi.fn(async (row: TableRegistration) => {
      for (const old of registrations.values())
        if (old.tableId === row.tableId && old.userId === row.userId) registrations.delete(old.id);
      registrations.set(row.id, clone(row));
    }),
    retainChoiceVotes: vi.fn(async () => undefined),
    retainGameVotes: vi.fn(async () => undefined),
    voter: vi.fn(async (eventId: string, userId: string) =>
      clone(votes.get(`${eventId}|${userId}`) ?? null),
    ),
    allVotes: vi.fn(async (eventId: string) =>
      clone([...votes.values()].filter((row) => row.eventId === eventId)),
    ),
    saveVoter: vi.fn(async (row: EventVoter) => {
      votes.set(`${row.eventId}|${row.userId}`, clone(row));
    }),
    counts: vi.fn(async (event: EventRecord, rows: TableRecord[]) => ({
      tableCount: rows.length,
      participantCount: new Set(
        event.status === "PLANNING"
          ? active(event.id)
              .filter((row) => row.status === "ACCEPTED")
              .map((row) => row.userId)
          : rows.flatMap((table) => table.confirmed?.playerIds ?? []),
      ).size,
    })),
    cancelUser: vi.fn(async (eventId: string, userId: string, at: string) => {
      for (const row of active(eventId))
        if (row.userId === userId)
          registrations.set(row.id, {
            ...row,
            status: "CANCELLED",
            version: row.version + 1,
            updatedAt: at,
          });
    }),
    cancelPending: vi.fn(async (eventId: string) => {
      for (const row of active(eventId))
        if (row.status === "PENDING")
          registrations.set(row.id, { ...row, status: "CANCELLED", version: row.version + 1 });
    }),
    removeTable: vi.fn(async (tableId: string, at: string) => {
      const row = tables.get(tableId);
      if (row) tables.set(tableId, { ...row, removedAt: at });
      for (const entry of registrations.values())
        if (entry.tableId === tableId)
          registrations.set(entry.id, { ...entry, status: "CANCELLED" });
    }),
    registrationsPage: vi.fn(async (tableId: string, status: string) =>
      clone(
        [...registrations.values()].filter(
          (row) => row.tableId === tableId && row.status === status,
        ),
      ),
    ),
    groupEvents: vi.fn(async (groupId: string) =>
      clone(
        [...events.values()].filter(
          (row) => row.groupId === groupId && row.status !== "TERMINATED",
        ),
      ),
    ),
    list: vi.fn(async () => clone([...events.values()])),
    personalTables: vi.fn(async () => clone([...tables.values()])),
  };
  const groups = {
    find: vi.fn(async () => clone(group)),
    lock: vi.fn(async () => clone(group)),
    membership: vi.fn(async () => ({ status: "ACCEPTED" })),
    ban: vi.fn(async () => null),
  };
  const games = {
    findByIds: vi.fn(async (ids: number[]) =>
      ids.map((value) => ({ id: value, name: `Game ${value}`, maxPlayMinutes: 60 })),
    ),
  };
  const users = {
    findById: vi.fn(async (userId: string) => ({ clerkId: userId, name: userId })),
    findByIds: vi.fn(async (ids: string[]) =>
      ids.map((userId) => ({ clerkId: userId, name: userId })),
    ),
  };
  const relationships = { isFriend: vi.fn(async () => true), isBlocked: vi.fn(async () => false) };
  const notifications = { notifyMany: vi.fn(async () => []) },
    ratings = {
      applyTableResult: vi.fn(async () => undefined),
      forTable: vi.fn(async () => []),
      currentForPlayers: vi.fn(async (ids: string[]) =>
        ids.map((userId) => ({ userId, score: 0, provisional: true })),
      ),
      tableStats: vi.fn(
        async () => new Map<string, { gamesPlayed: number; gamesWon: number; nd: number }>(),
      ),
    };
  const service = new EventRecordsService(
    repo as never,
    groups as never,
    games as never,
    users as never,
    relationships as never,
    notifications as never,
    ratings as never,
  );
  const create = async () => {
    const input = body();
    if (type) input.groupId = other;
    if (type === "PUBLIC") {
      input.endsAt = "2027-01-03T18:00:00Z";
      input.bookingClosesAt = "2027-01-02T08:00:00Z";
    }
    return service.create(owner, input);
  };
  const yes = async (eventId: string, userId: string, tableId = id) => {
    await service.vote(userId, eventId, { kind: "date", optionId: id, vote: "YES" });
    await service.vote(userId, eventId, { kind: "location", optionId: id, vote: "YES" });
    await service.vote(userId, eventId, { kind: "game", tableId, gameId: 1, vote: "YES" });
  };
  const accept = async (row: TableRegistration) =>
    service.registrationAction(row.userId, row.id, { action: "accept", version: row.version });
  const confirm = async (eventId: string) =>
    service.transition(owner, eventId, {
      action: "confirm",
      version: events.get(eventId)!.version,
    });
  return {
    service,
    events,
    tables,
    registrations,
    votes,
    repo,
    groups,
    games,
    users,
    relationships,
    notifications,
    ratings,
    create,
    yes,
    accept,
    confirm,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("unified event core — real consent, no synthetic Match writes", () => {
  it("reuses existing PRIVATE participation on another Table without replacing Event preferences", async () => {
    const f = setup("PRIVATE"),
      event = await f.create();
    f.tables.set(other, { ...f.tables.get(id)!, id: other, order: 1 });
    const pending = await f.service.register(owner, event.id, id, guest);
    await expect(f.service.join(guest, event.id, other)).rejects.toMatchObject({
      code: "EVENT_AVAILABILITY_REQUIRED",
    });
    await f.service.registrationAction(guest, pending.id, {
      action: "decline",
      version: pending.version,
    });
    await f.service.join(guest, event.id, id, {
      version: f.events.get(event.id)!.version,
      dateVotes: { [id]: "YES" },
      locationVotes: { [id]: "IF_NEEDED" },
    });
    const previous = clone(f.votes.get(`${event.id}|${guest}`));
    const second = await f.service.join(guest, event.id, other);
    expect(second).toMatchObject({ status: "ACCEPTED", tableId: other, userId: guest });
    expect(f.votes.get(`${event.id}|${guest}`)).toEqual(previous);
    expect(f.repo.saveVoter).toHaveBeenCalledTimes(1);
  });
  it("rejects removing the final positive date/venue, allowing positive switches and another current alternative", async () => {
    const f = setup("PRIVATE"),
      event = await f.create();
    await f.service.join(guest, event.id, id, {
      version: event.version,
      dateVotes: { [id]: "YES" },
      locationVotes: { [id]: "IF_NEEDED" },
    });
    for (const kind of ["date", "location"] as const) {
      await expect(
        f.service.vote(guest, event.id, { kind, optionId: id, vote: "NO" }),
      ).rejects.toMatchObject({ code: "EVENT_POSITIVE_AVAILABILITY_REQUIRED" });
      await f.service.vote(guest, event.id, { kind, optionId: id, vote: "IF_NEEDED" });
      await f.service.vote(guest, event.id, { kind, optionId: id, vote: "YES" });
    }
    const latest = f.events.get(event.id)!;
    f.events.set(event.id, {
      ...latest,
      dates: [...latest.dates, { id: other, day: "2027-01-04" }],
      locations: [...latest.locations, { ...latest.locations[0], id: other }],
    });
    for (const kind of ["date", "location"] as const) {
      await f.service.vote(guest, event.id, { kind, optionId: other, vote: "IF_NEEDED" });
      await f.service.vote(guest, event.id, { kind, optionId: id, vote: "NO" });
      await expect(
        f.service.vote(guest, event.id, { kind, optionId: other, vote: "NO" }),
      ).rejects.toMatchObject({ code: "EVENT_POSITIVE_AVAILABILITY_REQUIRED" });
    }
    expect(f.votes.get(`${event.id}|${guest}`)).toMatchObject({
      dateVotes: { [id]: "NO", [other]: "IF_NEEDED" },
      locationVotes: { [id]: "NO", [other]: "IF_NEEDED" },
    });
    await expect(
      f.service.vote(guest, event.id, { kind: "game", tableId: id, gameId: 1, vote: "NO" }),
    ).resolves.toBeDefined();
  });
  it("requires complete current PRIVATE availability before voluntary enrollment writes", async () => {
    const f = setup("PRIVATE"),
      event = await f.create();
    const availability = {
      version: event.version,
      dateVotes: { [id]: "YES" as const },
      locationVotes: { [id]: "IF_NEEDED" as const },
    };
    await expect(f.service.join(guest, event.id, id)).rejects.toMatchObject({
      code: "EVENT_AVAILABILITY_REQUIRED",
    });
    for (const value of [
      { ...availability, dateVotes: {} },
      { ...availability, locationVotes: {} },
      { ...availability, dateVotes: { [id]: "NO" as const } },
      { ...availability, locationVotes: { [other]: "YES" as const } },
    ])
      await expect(
        f.service.join(guest, event.id, id, value as JoinEventAvailability),
      ).rejects.toMatchObject({
        code: "INVALID_JOIN_AVAILABILITY",
      });
    await expect(
      f.service.join(guest, event.id, id, { ...availability, version: event.version + 1 }),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    expect(f.repo.saveRegistration).not.toHaveBeenCalled();
    expect(f.repo.saveVoter).not.toHaveBeenCalled();
    const row = await f.service.join(guest, event.id, id, availability);
    expect(row).toMatchObject({ userId: guest, kind: "SELF", status: "ACCEPTED", gameVotes: {} });
    expect(f.votes.get(`${event.id}|${guest}`)).toMatchObject({
      dateVotes: availability.dateVotes,
      locationVotes: availability.locationVotes,
    });
    expect(f.events.get(event.id)?.version).toBe(event.version + 1);
    await f.service.vote(guest, event.id, { kind: "date", optionId: id, vote: "IF_NEEDED" });
    expect(f.votes.get(`${event.id}|${guest}`)?.dateVotes[id]).toBe("IF_NEEDED");
    await expect(
      f.service.vote(guest, event.id, { kind: "date", optionId: id, vote: "UNKNOWN" } as never),
    ).rejects.toMatchObject({ code: "INVALID_VOTE" });
  });
  it("preserves fixed/standalone enrollment, rejecting irrelevant preferences and forged invitation preferences", async () => {
    for (const type of [null, "PUBLIC"] as const) {
      const f = setup(type),
        event = await f.create(),
        availability = {
          version: event.version,
          dateVotes: { [id]: "YES" as const },
          locationVotes: { [id]: "YES" as const },
        };
      await expect(f.service.join(owner, event.id, id, availability)).rejects.toMatchObject({
        code: "EVENT_AVAILABILITY_NOT_REQUIRED",
      });
      expect((await f.service.join(owner, event.id, id)).status).toBe("ACCEPTED");
      expect(f.repo.saveVoter).not.toHaveBeenCalled();
    }
    const f = setup("PRIVATE"),
      event = await f.create();
    await expect(
      f.service.register(owner, event.id, id, guest, {
        version: event.version,
        dateVotes: { [id]: "YES" },
        locationVotes: { [id]: "YES" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOIN_AVAILABILITY" });
  });
  it.each([null, "PRIVATE"] as const)(
    "reads current %s Table rankings from the immutable roster/selected game, not pending users or legacy Matches",
    async (type) => {
      const f = setup(type),
        event = await f.create();
      await f.accept(await f.service.register(owner, event.id, id, guest));
      await f.accept(await f.service.register(owner, event.id, id, waiter));
      await f.yes(event.id, guest);
      await f.yes(event.id, waiter);
      await f.confirm(event.id);
      f.ratings.currentForPlayers.mockResolvedValue([
        { userId: guest, score: 100, provisional: false },
        { userId: waiter, score: 200, provisional: true },
      ]);
      f.ratings.tableStats.mockResolvedValue(
        new Map([[waiter, { gamesPlayed: 3, gamesWon: 1, nd: 1 }]]),
      );
      const first = await f.service.tableLeaderboard(owner, event.id, id, { limit: 1 });
      expect(first).toMatchObject({
        gameId: 1,
        scope: type ? "GROUP" : "GLOBAL",
        nextCursor: "1",
        items: [
          {
            userId: waiter,
            score: 200,
            name: waiter,
            avatarUrl: null,
            gamesPlayed: 3,
            gamesWon: 1,
            nd: 1,
            provisional: true,
          },
        ],
      });
      expect(f.ratings.currentForPlayers).toHaveBeenCalledWith(
        [guest, waiter],
        1,
        type ? other : null,
      );
      expect(f.ratings.tableStats).toHaveBeenCalledWith([waiter], 1, type ? other : null);
      f.users.findByIds.mockResolvedValue([]);
      const second = await f.service.tableLeaderboard(owner, event.id, id, {
        limit: 1,
        cursor: "1",
      });
      expect(second).toMatchObject({
        nextCursor: null,
        items: [{ userId: guest, gamesPlayed: 0, gamesWon: 0, nd: 0, name: guest }],
      });
      const frozen = f.events.get(event.id)!;
      f.events.set(event.id, { ...frozen, status: "TERMINATED" });
      f.ratings.currentForPlayers.mockResolvedValue([
        { userId: waiter, score: 250, provisional: false },
        { userId: guest, score: 250, provisional: false },
      ]);
      expect(
        (await f.service.tableLeaderboard(owner, event.id, id, { limit: 20 })).items.map(
          (row) => row.userId,
        ),
      ).toEqual([guest, waiter]);
      expect(f.ratings.applyTableResult).not.toHaveBeenCalled();
    },
  );
  it("never serves planning/excluded/mismatched Table rankings and preserves Event/Group read guards", async () => {
    const f = setup(),
      event = await f.create();
    await expect(
      f.service.tableLeaderboard(owner, event.id, id, { limit: 20 }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_CONFIRMED" });
    await expect(
      f.service.tableLeaderboard(owner, event.id, other, { limit: 20 }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    f.tables.set(id, { ...f.tables.get(id)!, eventId: other });
    await expect(
      f.service.tableLeaderboard(owner, event.id, id, { limit: 20 }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    await expect(
      f.service.tableLeaderboard("outsider", event.id, id, { limit: 20 }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
    const g = setup("PRIVATE"),
      grouped = await g.create();
    g.groups.membership.mockResolvedValue(null as never);
    await expect(
      g.service.tableLeaderboard("outsider", grouped.id, id, { limit: 20 }),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_REQUIRED" });
    expect(f.ratings.currentForPlayers).not.toHaveBeenCalled();
    expect(g.ratings.currentForPlayers).not.toHaveBeenCalled();
  });
  it("projects approved Group identity and complete accepted/pending totals separately from seat/queue counts", async () => {
    const f = setup("PRIVATE"),
      event = await f.create();
    await f.service.register(owner, event.id, id);
    await f.service.register(owner, event.id, id, guest);
    await f.service.register(waiter, event.id, id);
    await f.service.register(owner, event.id, id, "user_pending_waiter");
    const detail = await f.service.tableDetail(owner, event.id, id);
    expect(detail).toMatchObject({
      groupName: "Club group",
      acceptedCount: 2,
      pendingRegistrationCount: 2,
      seatedCount: 1,
      pendingCount: 1,
      waitingCount: 2,
    });
    const list = await f.service.tables(owner, event.id, { limit: 20 });
    expect(list.items[0]).toMatchObject({
      groupName: "Club group",
      acceptedCount: 2,
      pendingRegistrationCount: 2,
    });
    const solo = setup(),
      soloEvent = await solo.create();
    expect(await solo.service.tableDetail(owner, soloEvent.id, id)).toMatchObject({
      groupName: null,
      acceptedCount: 0,
      pendingRegistrationCount: 0,
    });
  });
  it.each([
    "2027-01-03T08:00:00Z",
    "2027-01-03T07:59:00Z",
    "2027-01-03T22:00:00Z",
    "2027-01-04T08:30:00Z",
  ])(
    "rejects a public table time outside the strict event interval as a client error: %s",
    async (startsAt) => {
      const f = setup("PUBLIC"),
        input = {
          ...body(),
          groupId: other,
          endsAt: "2027-01-03T22:00:00Z",
          bookingClosesAt: "2027-01-02T08:00:00Z",
        };
      input.tables[0].startsAt = startsAt;
      await expect(f.service.create(owner, input)).rejects.toMatchObject({
        status: 400,
        code: "TABLE_OUTSIDE_EVENT",
      });
      expect(f.events.size).toBe(0);
    },
  );
  it("accepts same-day public ends and combined same-day cutoffs, rejecting overnight writes in the venue zone atomically", async () => {
    const f = setup("PUBLIC"),
      input = {
        ...body(),
        groupId: other,
        endsAt: "2027-01-03T22:59:00Z",
        bookingClosesAt: "2027-01-03T07:59:00Z",
      };
    const event = await f.service.create(owner, input);
    expect(event.endsAt).toBe(input.endsAt.replace("00Z", "00.000Z"));
    const { groupId: _group, ...fields } = input;
    await expect(
      f.service.update(owner, event.id, {
        ...fields,
        endsAt: "2027-01-03T23:30:00Z",
        version: event.version,
        tables: [],
        removedTableIds: [],
      }),
    ).rejects.toMatchObject({ code: "EVENT_END_SAME_DAY_REQUIRED" });
    expect(f.events.get(event.id)?.version).toBe(event.version);
    const fresh = setup("PUBLIC");
    await expect(
      fresh.service.create(owner, { ...input, endsAt: "2027-01-03T23:30:00Z" }),
    ).rejects.toMatchObject({ code: "EVENT_END_SAME_DAY_REQUIRED" });
    expect(fresh.events.size).toBe(0);
    await expect(
      fresh.service.create(owner, { ...input, endsAt: "2027-01-03T08:00:00Z" }),
    ).rejects.toMatchObject({ code: "EVENT_END_AFTER_START_REQUIRED" });
    await expect(
      fresh.service.create(owner, { ...input, bookingClosesAt: "2027-01-03T08:00:00Z" }),
    ).rejects.toMatchObject({ code: "EVENT_CUTOFF_BEFORE_START_REQUIRED" });
  });
  it("exposes aggregate votes only on details, counts each accepted event participant once and excludes pending ballots", async () => {
    const f = setup("PRIVATE"),
      input = { ...body(), groupId: other };
    input.tables[0].maxPlayers = 4;
    input.tables.push({ ...input.tables[0], id: other, name: "Second table" });
    const event = await f.service.create(owner, input);
    await f.service.register(owner, event.id, id);
    await f.service.register(guest, event.id, id);
    await f.service.register(owner, event.id, other);
    const invitation = await f.service.register(owner, event.id, id, waiter);
    f.registrations.set(invitation.id, { ...invitation, gameVotes: { "1": "YES" } });
    f.votes.set(`${event.id}|${waiter}`, {
      eventId: event.id,
      userId: waiter,
      dateVotes: { [id]: "YES" },
      locationVotes: { [id]: "YES" },
      updatedAt: event.createdAt,
    });
    await f.yes(event.id, owner);
    const detail = await f.service.detail(owner, event.id);
    expect(detail.voteCounts?.dates[id]).toEqual({ YES: 1, NO: 0, IF_NEEDED: 0, UNKNOWN: 1 });
    expect(detail.voteCounts?.locations[id]).toEqual({ YES: 1, NO: 0, IF_NEEDED: 0, UNKNOWN: 1 });
    expect((await f.service.tableDetail(owner, event.id, id)).gameVoteCounts?.["1"]).toEqual({
      YES: 1,
      NO: 0,
      IF_NEEDED: 0,
      UNKNOWN: 1,
    });
    expect(
      (await f.service.tableDetail(owner, event.id, other)).gameVoteCounts?.["1"].UNKNOWN,
    ).toBe(1);
    expect((await f.service.list(owner, { limit: 20 })).items[0].voteCounts).toBeUndefined();
    expect(
      (await f.service.tables(owner, event.id, { limit: 20 })).items[0].gameVoteCounts,
    ).toBeUndefined();
    await expect(f.service.seats(guest, event.id, id, { limit: 20 }, true)).rejects.toMatchObject({
      code: "EVENT_ADMIN_REQUIRED",
    });
    expect((await f.service.tableDetail(waiter, event.id, id)).myRegistration).toMatchObject({
      userId: waiter,
      name: waiter,
      avatarUrl: null,
      status: "PENDING",
    });
    expect(JSON.stringify(await f.service.tableDetail(guest, event.id, id))).not.toContain(waiter);
  });
  it("keeps private options independent and confirms the voted time in the chosen venue's zone", async () => {
    const f = setup("PRIVATE"),
      input = body();
    input.groupId = other;
    input.dates = [
      { id, day: "2027-06-03", startTime: "18:15" },
      { id: other, day: "2027-06-03", startTime: "22:30" },
    ];
    input.locations.push({
      ...location,
      id: other,
      name: "New York venue",
      latitude: 40.71,
      longitude: -74.01,
      timeZone: "America/New_York",
    });
    const event = await f.service.create(owner, input);
    expect(event.dates).toEqual(input.dates);
    expect(event.locations).toHaveLength(2);
    expect(event.participantCount).toBe(0);
    for (const user of [owner, guest]) {
      await f.service.register(user, event.id, id);
      await f.service.vote(user, event.id, { kind: "date", optionId: other, vote: "YES" });
      await f.service.vote(user, event.id, { kind: "location", optionId: other, vote: "YES" });
      await f.service.vote(user, event.id, { kind: "game", tableId: id, gameId: 1, vote: "YES" });
    }
    const ready = await f.service.detail(owner, event.id);
    expect(ready.agreement).toMatchObject({ agreed: true, dateId: other, locationId: other });
    expect(f.events.get(event.id)?.status).toBe("PLANNING");
    await f.confirm(event.id);
    expect(f.tables.get(id)?.confirmed?.startsAt).toBe("2027-06-04T02:30:00.000Z");
    expect(f.events.get(event.id)?.timeZone).toBe("America/New_York");
    expect(f.events.get(event.id)?.startTime).toBe("09:00");
  });
  it("requires fresh option identity for edited private clocks and retains unchanged date/location IDs", async () => {
    const f = setup("PRIVATE"),
      input = { ...body(), groupId: other };
    input.dates = [
      { id, day: "2027-01-03", startTime: "09:00" },
      { id: other, day: "2027-01-03", startTime: "20:00" },
    ];
    const event = await f.service.create(owner, input);
    const { groupId: _group, ...fields } = input;
    const edit = {
      ...fields,
      version: event.version,
      removedTableIds: [],
      tables: [],
      dates: [input.dates[0], { ...input.dates[1], startTime: "21:00" }],
    };
    await expect(f.service.update(owner, event.id, edit)).rejects.toMatchObject({
      code: "OPTION_ID_REUSED",
    });
    const fresh = "33333333-3333-4333-8333-333333333333";
    edit.dates[1].id = fresh;
    const updated = await f.service.update(owner, event.id, edit);
    expect(updated.dates).toEqual(edit.dates);
    expect(f.repo.retainChoiceVotes).toHaveBeenCalledWith(event.id, [id, fresh], [id]);
  });
  it("rejects duplicate effective clocks, repeated identities and oversized private proposals before writes", async () => {
    for (const patch of [
      {
        dates: [
          { id, day: "2027-01-03" },
          { id: other, day: "2027-01-03", startTime: "09:00" },
        ],
      },
      {
        dates: [
          { id, day: "2027-01-03" },
          { id, day: "2027-01-04" },
        ],
      },
      { locations: [location, location] },
      {
        dates: Array.from({ length: 21 }, (_, n) => ({
          id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
          day: `2027-01-${String(n + 1).padStart(2, "0")}`,
        })),
      },
      {
        locations: Array.from({ length: 21 }, (_, n) => ({
          ...location,
          id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
        })),
      },
    ]) {
      const f = setup("PRIVATE");
      await expect(
        f.service.create(owner, { ...body(), groupId: other, ...patch }),
      ).rejects.toMatchObject({ code: "INVALID_EVENT_OPTIONS" });
      expect(f.repo.create).not.toHaveBeenCalled();
    }
    const f = setup("PRIVATE");
    await expect(
      f.service.create(owner, {
        ...body(),
        groupId: other,
        dates: [{ id, day: "2027-03-28", startTime: "02:30" }],
        locations: [
          {
            ...location,
            id: other,
            latitude: 40.71,
            longitude: -74.01,
            timeZone: "America/New_York",
          },
          location,
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_EVENT_TIME" });
    expect(f.repo.create).not.toHaveBeenCalled();
  });
  it("never lets per-option clocks bypass the registered public schedule lock", async () => {
    const f = setup("PUBLIC"),
      event = await f.create();
    await f.service.register(owner, event.id, id);
    const { groupId: _group, ...fields } = body();
    await expect(
      f.service.update(owner, event.id, {
        ...fields,
        endsAt: event.endsAt,
        bookingClosesAt: event.bookingClosesAt,
        dates: [{ id: other, day: event.dates[0].day, startTime: "10:00" }],
        version: f.events.get(event.id)!.version,
        removedTableIds: [],
        tables: [],
      }),
    ).rejects.toMatchObject({ code: "PUBLIC_SCHEDULE_HAS_REGISTRATIONS" });
  });
  it.each([null, "PUBLIC"] as const)(
    "refuses additional dates and locations before any write: %s",
    async (type) => {
      for (const dimension of ["dates", "locations"] as const) {
        const f = setup(type),
          input = body();
        if (type) input.groupId = other;
        if (dimension === "dates") input.dates.push({ id: other, day: "2027-01-04" });
        else input.locations.push({ ...location, id: other, address: "Another verified address" });
        await expect(f.service.create(owner, input)).rejects.toMatchObject({
          code: "EVENT_FIXED_SCHEDULE_REQUIRED",
        });
        expect(f.repo.create).not.toHaveBeenCalled();
        expect(f.events.size).toBe(0);
      }
    },
  );
  it("derives the persisted clock from coordinates rather than a caller timezone on create and edit", async () => {
    const f = setup();
    const event = await f.service.create(owner, { ...body(), timeZone: "Pacific/Honolulu" });
    expect(event.timeZone).toBe("Europe/Rome");
    expect(event.locations[0].timeZone).toBe("Europe/Rome");
    expect(f.events.get(event.id)?.timeZone).toBe("Europe/Rome");
    const { groupId: _group, ...fields } = body();
    const next = await f.service.update(owner, event.id, {
      ...fields,
      timeZone: "Pacific/Honolulu",
      tables: [],
      version: event.version,
      removedTableIds: [],
    });
    expect(next.timeZone).toBe("Europe/Rome");
    expect(next.dates[0].id).toBe(id);
  });
  it("creates explicit empty tables, leaves organizer unseated, and rejects non-member access", async () => {
    const f = setup(),
      event = await f.create();
    expect(event.status).toBe("PLANNING");
    expect(event.participantCount).toBe(0);
    expect(event.canVote).toBe(false);
    expect(event.myRegistrations).toEqual([]);
    expect(f.registrations.size).toBe(0);
    expect(event).not.toHaveProperty("nextPriority");
    expect(event).not.toHaveProperty("lastNotifiedSituation");
    await expect(f.service.detail(guest, event.id)).rejects.toMatchObject({ status: 404 });
    await expect(f.confirm(event.id)).rejects.toMatchObject({ code: "EVENT_NO_AGREEMENT" });
  });
  it("pending reserves an actual seat but cannot vote/count, including against a consenting waiter", async () => {
    const f = setup(),
      event = await f.create();
    await f.service.register(owner, event.id, id);
    const invited = await f.service.register(owner, event.id, id, guest);
    const waiting = await f.accept(await f.service.register(owner, event.id, id, waiter));
    await expect(
      f.service.vote(guest, event.id, { kind: "date", optionId: id, vote: "YES" }),
    ).rejects.toMatchObject({ code: "ACCEPTED_REGISTRATION_REQUIRED" });
    await f.yes(event.id, owner);
    await f.yes(event.id, waiter);
    expect((await f.service.detail(owner, event.id)).agreement?.agreed).toBe(false);
    expect(await f.service.tableDetail(owner, event.id, id)).toMatchObject({
      seatedCount: 1,
      pendingCount: 1,
      waitingCount: 1,
    });
    await f.service.registrationAction(guest, invited.id, {
      action: "decline",
      version: invited.version,
    });
    expect((await f.service.detail(owner, event.id)).agreement?.agreed).toBe(true);
    expect(waiting.priorityAt).toBe(invited.priorityAt); // sequence, NOT acceptance time, breaks same-clock ties.
    expect(f.registrations.get(waiting.id)?.sequence).toBeGreaterThan(invited.sequence);
    await f.confirm(event.id);
    expect(f.tables.get(id)?.confirmed?.playerIds).toEqual([owner, waiter]);
    expect(f.registrations.get(invited.id)?.status).toBe("DECLINED");
  });
  it("never conflates voting with acceptance; duplicate response/stale versions cannot change consent", async () => {
    const f = setup(),
      event = await f.create(),
      invite = await f.service.register(owner, event.id, id, guest);
    await expect(
      f.service.registrationAction(owner, invite.id, { action: "accept", version: 1 }),
    ).rejects.toMatchObject({ code: "INVITATION_RECIPIENT_REQUIRED" });
    await expect(
      f.service.registrationAction(guest, invite.id, { action: "accept", version: 99 }),
    ).rejects.toMatchObject({ code: "REGISTRATION_CHANGED" });
    const accepted = await f.accept(invite);
    expect(accepted.priorityAt).toBe(invite.priorityAt);
    expect(accepted.sequence).toBe(invite.sequence);
    await expect(f.accept(invite)).rejects.toMatchObject({ code: "REGISTRATION_CHANGED" });
    await f.service.vote(guest, event.id, { kind: "game", tableId: id, gameId: 1, vote: "YES" });
    expect(f.registrations.get(invite.id)?.status).toBe("ACCEPTED");
  });
  it("preserves votes, waiters and excluded tables when returning to PLANNING", async () => {
    const f = setup(),
      input = body();
    input.tables.push({ ...input.tables[0], id: other, name: "Excluded table" });
    const event = await f.service.create(owner, input);
    await f.service.register(owner, event.id, id);
    await f.accept(await f.service.register(owner, event.id, id, guest));
    await f.yes(event.id, owner);
    await f.yes(event.id, guest);
    const before = clone([...f.registrations.values()]);
    await f.confirm(event.id);
    expect(f.tables.has(other)).toBe(true);
    expect(f.tables.get(other)?.confirmed).toBeUndefined();
    await f.service.transition(owner, event.id, {
      action: "replan",
      version: f.events.get(event.id)!.version,
    });
    expect([...f.registrations.values()]).toEqual(before);
    expect(f.votes.size).toBe(2);
    expect(f.tables.size).toBe(2);
    expect((await f.service.detail(guest, event.id)).canVote).toBe(true);
  });
  it("requires every included result; all-ND produces no rating call", async () => {
    const f = setup(),
      event = await f.create();
    await f.service.register(owner, event.id, id);
    await f.accept(await f.service.register(owner, event.id, id, guest));
    await f.yes(event.id, owner);
    await f.yes(event.id, guest);
    await f.confirm(event.id);
    const version = f.events.get(event.id)!.version;
    await expect(
      f.service.finalize(owner, event.id, { version, results: [] }),
    ).rejects.toMatchObject({ code: "EVERY_INCLUDED_TABLE_RESULT_REQUIRED" });
    const result = await f.service.finalize(owner, event.id, {
      version,
      results: [
        {
          tableId: id,
          lowerWins: false,
          entries: [
            { userId: owner, score: null },
            { userId: guest, score: null },
          ],
          tieBreaks: [],
        },
      ],
    });
    expect(result.status).toBe("TERMINATED");
    expect(f.ratings.applyTableResult).not.toHaveBeenCalled();
    expect(f.tables.get(id)?.results?.entries.every((row) => row.score === null)).toBe(true);
    await expect(
      f.service.finalize(owner, event.id, { version, results: [] }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_CONFIRMED" });
    await expect(
      f.service.transition(owner, event.id, { version: version + 1, action: "replan" }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_CONFIRMED" });
  });
  it("requires friends only for ungrouped invitations, and never allows anonymous self-enrollment", async () => {
    const f = setup(),
      event = await f.create();
    f.relationships.isFriend.mockResolvedValue(false);
    await expect(f.service.register(owner, event.id, id, guest)).rejects.toMatchObject({
      code: "CONFIRMED_FRIEND_REQUIRED",
    });
    await expect(f.service.register(guest, event.id, id)).rejects.toMatchObject({ status: 404 });
    const g = setup("PRIVATE"),
      grouped = await g.create();
    g.relationships.isFriend.mockResolvedValue(false);
    expect((await g.service.register(guest, grouped.id, id)).status).toBe("ACCEPTED");
  });
  it("blocks globally blocked invite acceptance and confirmation for non-group events", async () => {
    const f = setup(),
      event = await f.create(),
      invite = await f.service.register(owner, event.id, id, guest);
    f.relationships.isBlocked.mockResolvedValue(true);
    await expect(f.accept(invite)).rejects.toMatchObject({ code: "BLOCKED_PARTICIPANT" });
  });
});
describe("public scheduling, deadline and membership consequences", () => {
  it("uses implicit fixed-option consent ONLY after explicit acceptance and closes every action at exact cutoff", async () => {
    const f = setup("PUBLIC"),
      event = await f.create();
    await f.service.register(owner, event.id, id);
    const invite = await f.service.register(owner, event.id, id, guest);
    expect((await f.service.detail(owner, event.id)).agreement?.agreed).toBe(false);
    await f.accept(invite);
    expect((await f.service.detail(owner, event.id)).agreement?.agreed).toBe(true);
    await expect(
      f.service.vote(guest, event.id, { kind: "date", optionId: id, vote: "NO" }),
    ).rejects.toMatchObject({ code: "FIXED_OPTION" });
    vi.setSystemTime(new Date("2027-01-02T08:00:00Z"));
    await expect(f.service.register(owner, event.id, id, waiter)).rejects.toMatchObject({
      code: "EVENT_BOOKING_CLOSED",
    });
    await expect(
      f.service.registrationAction(guest, invite.id, { action: "cancel", version: 2 }),
    ).rejects.toMatchObject({ code: "EVENT_BOOKING_CLOSED" });
    expect(f.events.get(event.id)?.status).toBe("PLANNING");
    await f.confirm(event.id);
    expect(f.events.get(event.id)?.status).toBe("CONFIRMED");
  });
  it("refuses protected target bans but leaves other participants/history untouched", async () => {
    const f = setup("PUBLIC"),
      event = await f.create();
    await f.service.register(owner, event.id, id);
    await f.accept(await f.service.register(owner, event.id, id, guest));
    await f.confirm(event.id);
    vi.setSystemTime(new Date("2027-01-02T08:00:00Z"));
    await expect(f.service.assertBanAllowed(other, guest)).rejects.toMatchObject({
      code: "BAN_FROZEN_PARTICIPATION",
    });
    await expect(f.service.assertBanAllowed(other, waiter)).resolves.toBeUndefined();
    expect(f.events.get(event.id)?.status).toBe("CONFIRMED");
  });
  it("reopens an affected pre-cutoff confirmed event on ban, retaining the other players and votes", async () => {
    const f = setup("PRIVATE"),
      event = await f.create();
    await f.service.register(owner, event.id, id);
    await f.service.register(guest, event.id, id);
    await f.yes(event.id, owner);
    await f.yes(event.id, guest);
    await f.confirm(event.id);
    await f.service.membershipDeparted(other, guest, "BAN");
    expect(f.events.get(event.id)?.status).toBe("PLANNING");
    expect([...f.registrations.values()].find((row) => row.userId === guest)?.status).toBe(
      "CANCELLED",
    );
    expect([...f.registrations.values()].find((row) => row.userId === owner)?.status).toBe(
      "ACCEPTED",
    );
    expect(f.votes.size).toBe(2);
  });
});
