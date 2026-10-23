import type {
  CreatePlannedEventInput,
  EventRecord,
  EventVoter,
  GroupRecord,
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
    ratings = { applyTableResult: vi.fn(async () => undefined), forTable: vi.fn(async () => []) };
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
  it.each([null, "PRIVATE", "PUBLIC"] as const)(
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
