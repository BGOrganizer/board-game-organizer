import { randomUUID } from "node:crypto";
import type {
  CreatePlannedEventInput,
  EventProposal,
  EventRecord,
  EventVoter,
  GroupMembership,
  GroupRecord,
  JoinEventAvailability,
  JoinTableInput,
  PlannedEventResponse,
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
const privateBody = (): CreatePlannedEventInput => ({
  ...body(),
  groupId: other,
  dates: [
    { id, day: "2027-01-03" },
    { id: other, day: "2027-01-04" },
  ],
  locations: [location, { ...location, id: other, name: "Other venue" }],
});
const clone = <T>(value: T): T => structuredClone(value);
const joinChoices = (availability: JoinEventAvailability) => ({
  version: availability.version,
  gameVotes: { "1": "YES" as const },
  availability,
});
function setup(type: "PRIVATE" | "PUBLIC" | null = null) {
  const events = new Map<string, EventRecord>(),
    tables = new Map<string, TableRecord>(),
    registrations = new Map<string, TableRegistration>(),
    votes = new Map<string, EventVoter>(),
    proposals = new Map<string, EventProposal>();
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
    proposal: vi.fn(async (key: string) => clone(proposals.get(key) ?? null)),
    proposalRequest: vi.fn(async (eventId: string, userId: string, clientRequestId: string) =>
      clone(
        [...proposals.values()].find(
          (p) =>
            p.eventId === eventId && p.userId === userId && p.clientRequestId === clientRequestId,
        ) ?? null,
      ),
    ),
    duplicateProposal: vi.fn(async (eventId: string, userId: string, payloadKey: string) =>
      clone(
        [...proposals.values()].find(
          (p) =>
            p.eventId === eventId &&
            p.userId === userId &&
            p.payloadKey === payloadKey &&
            p.status === "PENDING",
        ) ?? null,
      ),
    ),
    ownProposedGames: vi.fn(async (eventId: string, tableId: string, userId: string) =>
      [...proposals.values()]
        .filter(
          (p) =>
            p.eventId === eventId &&
            p.userId === userId &&
            p.payload.kind === "game" &&
            p.payload.tableId === tableId,
        )
        .map((p) => (p.payload.kind === "game" ? p.payload.gameId : 0)),
    ),
    gameProposals: vi.fn(async (eventId: string, tableId: string, gameId: number) =>
      clone(
        [...proposals.values()].filter(
          (p) =>
            p.eventId === eventId &&
            p.payload.kind === "game" &&
            p.payload.tableId === tableId &&
            p.payload.gameId === gameId,
        ),
      ),
    ),
    proposalBatch: vi.fn(async (eventId: string, reviewBatchId: string) =>
      clone(
        [...proposals.values()].filter(
          (p) => p.eventId === eventId && p.reviewBatchId === reviewBatchId,
        ),
      ),
    ),
    gameProposalPage: vi.fn(
      async (eventId: string, tableId: string, page: { limit: number; cursor?: string }) => {
        const grouped = new Map<number, EventProposal[]>();
        for (const p of proposals.values())
          if (p.eventId === eventId && p.payload.kind === "game" && p.payload.tableId === tableId)
            grouped.set(p.payload.gameId, [...(grouped.get(p.payload.gameId) ?? []), p]);
        return clone(
          [...grouped.values()]
            .map((members) => ({
              members,
              representative: [...members].sort(
                (a, b) =>
                  Number(b.status === "PENDING") * 2 +
                    Number(b.status === "ACCEPTED") -
                    (Number(a.status === "PENDING") * 2 + Number(a.status === "ACCEPTED")) ||
                  `${b.createdAt}|${b.id}`.localeCompare(`${a.createdAt}|${a.id}`),
              )[0],
            }))
            .filter(
              (r) =>
                !page.cursor ||
                `${r.representative.createdAt}|${r.representative.id}` < page.cursor,
            )
            .sort((a, b) =>
              `${b.representative.createdAt}|${b.representative.id}`.localeCompare(
                `${a.representative.createdAt}|${a.representative.id}`,
              ),
            )
            .slice(0, page.limit + 1),
        );
      },
    ),
    saveProposal: vi.fn(async (row: EventProposal) => {
      proposals.set(row.id, clone(row));
      return row;
    }),
    proposals: vi.fn(
      async (
        eventId: string,
        userId: string | null,
        page: {
          kind: string;
          limit: number;
          cursor?: string;
          tableId?: string;
          clientRequestId?: string;
        },
      ) =>
        clone(
          [...proposals.values()]
            .filter(
              (p) =>
                p.eventId === eventId &&
                (userId === null || p.userId === userId) &&
                p.payload.kind === page.kind &&
                (!page.tableId ||
                  (p.payload.kind === "game" && p.payload.tableId === page.tableId)) &&
                (!page.clientRequestId || p.clientRequestId === page.clientRequestId) &&
                (!page.cursor || `${p.createdAt}|${p.id}` < page.cursor),
            )
            .sort((a, b) => `${b.createdAt}|${b.id}`.localeCompare(`${a.createdAt}|${a.id}`))
            .slice(0, page.limit + 1),
        ),
    ),
    find: vi.fn(async (key: string) => clone(events.get(key) ?? null)),
    lock: vi.fn(async (key: string) => clone(events.get(key) ?? null)),
    create: vi.fn(async (row: EventRecord) => {
      events.set(row.id, clone(row));
    }),
    remove: vi.fn(async (eventId: string) => {
      events.delete(eventId);
      for (const map of [tables, registrations, votes])
        for (const [key, row] of map) if (row.eventId === eventId) map.delete(key);
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
    participants: vi.fn(async (event: EventRecord, page: { limit: number; cursor?: string }) => {
      const byUser = new Map<string, Set<string>>();
      for (const table of tables.values())
        if (table.eventId === event.id && !table.removedAt) {
          const ids = [
            ...active(event.id)
              .filter((row) => row.tableId === table.id && row.status === "ACCEPTED")
              .map((row) => row.userId),
            ...(event.status === "PLANNING" ? [] : (table.confirmed?.playerIds ?? [])),
          ];
          for (const userId of ids)
            byUser.set(userId, new Set([...(byUser.get(userId) ?? []), table.id]));
        }
      return [...byUser.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([userId]) => !page.cursor || userId > page.cursor)
        .slice(0, page.limit + 1)
        .map(([userId, ids]) => ({ userId, tableIds: [...ids] }));
    }),
    allRegistrations: vi.fn(async (eventId: string) => clone(active(eventId))),
    acceptedTableUsers: vi.fn(async (tableId: string) =>
      [...registrations.values()]
        .filter((row) => row.tableId === tableId && row.status === "ACCEPTED")
        .map((row) => row.userId),
    ),
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
    invitationCandidates: vi.fn(
      async () =>
        [] as Array<{
          clerkId: string;
          name: string;
          email: string;
          username?: string;
          avatarUrl?: string;
        }>,
    ),
  };
  const groups = {
    find: vi.fn(async () => clone(group)),
    lock: vi.fn(async () => clone(group)),
    managerIds: vi.fn(async () => [owner]),
    membership: vi.fn(
      async (_groupId: string, _userId: string): Promise<Partial<GroupMembership> | null> => ({
        status: "ACCEPTED",
      }),
    ),
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
  const relationships = {
    isFriend: vi.fn(async (_a: string, _b: string) => true),
    isBlocked: vi.fn(async (_a: string, _b: string) => false),
  };
  const notifications = {
      notifyMany: vi.fn(async (_rows: unknown[]) => []),
      retargetItems: vi.fn(async () => undefined),
      acknowledgeItems: vi.fn(async () => ({ modifiedCount: 1 })),
    },
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
    const event = events.get(eventId)!,
      table = tables.get(tableId)!;
    if (event.dates.length > 1)
      await service.vote(userId, eventId, { kind: "date", optionId: id, vote: "YES" });
    if (event.locations.length > 1)
      await service.vote(userId, eventId, { kind: "location", optionId: id, vote: "YES" });
    if (table.games.length > 1)
      await service.vote(userId, eventId, { kind: "game", tableId, gameId: 1, vote: "YES" });
  };
  const participation = (eventId: string, tableId: string): JoinTableInput => {
    const event = events.get(eventId)!,
      table = tables.get(tableId)!;
    return {
      version: event.version,
      gameVotes: Object.fromEntries(
        table.games.length > 1
          ? table.games.map((game) => [String(game.gameId), "YES" as const])
          : [],
      ),
      ...(type === "PRIVATE"
        ? {
            availability: {
              version: event.version,
              dateVotes: Object.fromEntries(
                event.dates.length > 1 ? event.dates.map((row) => [row.id, "YES" as const]) : [],
              ),
              locationVotes: Object.fromEntries(
                event.locations.length > 1
                  ? event.locations.map((row) => [row.id, "YES" as const])
                  : [],
              ),
            },
          }
        : {}),
    };
  };
  const accept = async (row: TableRegistration) =>
    service.registrationAction(row.userId, row.id, {
      action: "accept",
      version: row.version,
      participation: participation(row.eventId, row.tableId),
    });
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
    proposals,
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
    participation,
    confirm,
  };
}
describe("Event participant source and event-only removal", () => {
  it("keeps an administrator-only Event empty until explicit accepted attendance exists", async () => {
    const f = setup("PRIVATE"),
      e = await f.create();
    expect(await f.service.participants(owner, e.id, { limit: 20 })).toMatchObject({
      items: [],
      nextCursor: null,
      eventVersion: e.version,
    });
    expect(f.users.findByIds).toHaveBeenCalledWith([]);
  });
  it("deduplicates accepted people, includes queues, hides pending identities and does not invent manager attendance", async () => {
    const f = setup("PRIVATE"),
      event = await f.create();
    for (const user of [owner, guest, waiter])
      await f.service.join(user, event.id, id, f.participation(event.id, id));
    const pending = await f.service.register(owner, event.id, id, "pending-person");
    const page = await f.service.participants(owner, event.id, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.items.find((row) => row.userId === guest)).toMatchObject({
      position: "SEATED",
      canRemove: true,
      canBanGroup: true,
    });
    expect(page.items.some((row) => row.userId === pending.userId)).toBe(false);
    const second = await f.service.participants(owner, event.id, {
      limit: 2,
      cursor: page.nextCursor ?? "",
    });
    expect(second.items).toEqual([
      expect.objectContaining({ userId: waiter, position: "WAITING" }),
    ]);
    expect(f.users.findByIds.mock.calls.at(-1)?.[0]).toEqual([waiter]);
    expect(second.items[0]).not.toHaveProperty("email");
    expect(second.items[0]).not.toHaveProperty("gameVotes");
  });
  it("denies PUBLIC nonmember roster reads and protects creator/peer Group bans separately from Event removal", async () => {
    const f = setup("PUBLIC"),
      event = await f.create();
    f.groups.membership.mockResolvedValue(null);
    await expect(f.service.participants(guest, event.id, { limit: 20 })).rejects.toMatchObject({
      status: 403,
      message: "GROUP_MEMBER_REQUIRED",
    });
    expect(f.repo.participants).not.toHaveBeenCalled();
    const p = setup("PRIVATE"),
      e = await p.create();
    for (const user of [owner, guest, waiter])
      await p.service.join(user, e.id, id, p.participation(e.id, id));
    p.groups.membership.mockImplementation(async (_id, user) => ({
      status: "ACCEPTED",
      role: user === owner ? "MEMBER" : "MODERATOR",
    }));
    const list = await p.service.participants(guest, e.id, { limit: 20 });
    expect(list.items.find((row) => row.userId === owner)).toMatchObject({
      canRemove: true,
      canBanGroup: false,
    });
    expect(list.items.find((row) => row.userId === waiter)?.canBanGroup).toBe(false);
  });
  it("removes every active target registration only from this Event and permits explicit rejoining", async () => {
    const f = setup("PRIVATE"),
      e = await f.create();
    await f.service.join(guest, e.id, id, f.participation(e.id, id));
    f.tables.set(other, { ...f.tables.get(id)!, id: other, order: 1 });
    await f.service.register(owner, e.id, other, guest);
    const version = f.events.get(e.id)!.version;
    const saved = await f.service.removeParticipant(owner, e.id, guest, { version });
    expect(saved.version).toBe(version + 1);
    expect(await f.repo.userRegistrations(e.id, guest)).toEqual([]);
    expect(f.registrations.size).toBe(2);
    expect([...f.registrations.values()].every((row) => row.status === "CANCELLED")).toBe(true);
    expect(f.repo.cancelUser).toHaveBeenCalledWith(e.id, guest, expect.any(String));
    expect(f.notifications.notifyMany.mock.calls.flatMap(([rows]) => rows as unknown[])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recipientUserId: guest, kind: "event_booking_removed" }),
      ]),
    );
    await f.service.join(guest, e.id, id, f.participation(e.id, id));
    expect((await f.repo.userRegistrations(e.id, guest))[0].status).toBe("ACCEPTED");
  });
  it("rejects stale versions, non-managers, pending-only targets and closed/nonplanning changes before cancellation", async () => {
    const f = setup("PRIVATE"),
      e = await f.create();
    await f.service.register(owner, e.id, id, guest);
    const version = f.events.get(e.id)!.version;
    await expect(
      f.service.removeParticipant(owner, e.id, guest, { version: version - 1 }),
    ).rejects.toMatchObject({ message: "EVENT_CHANGED" });
    await expect(
      f.service.removeParticipant(guest, e.id, owner, { version }),
    ).rejects.toMatchObject({ message: "EVENT_ADMIN_REQUIRED" });
    await expect(
      f.service.removeParticipant(owner, e.id, guest, { version }),
    ).rejects.toMatchObject({ message: "EVENT_PARTICIPANT_NOT_FOUND" });
    for (const status of ["CONFIRMED", "TERMINATED"] as const) {
      f.events.set(e.id, { ...f.events.get(e.id)!, status });
      await expect(
        f.service.removeParticipant(owner, e.id, guest, { version }),
      ).rejects.toMatchObject({ message: "EVENT_NOT_PLANNING" });
    }
    const p = setup("PUBLIC"),
      publicEvent = await p.create();
    p.events.set(publicEvent.id, {
      ...p.events.get(publicEvent.id)!,
      bookingClosesAt: "2020-01-01T00:00:00Z",
    });
    await expect(
      p.service.removeParticipant(owner, publicEvent.id, guest, { version: 1 }),
    ).rejects.toMatchObject({ message: "EVENT_BOOKING_CLOSED" });
    expect(f.repo.cancelUser).not.toHaveBeenCalled();
    expect(p.repo.cancelUser).not.toHaveBeenCalled();
  });
  it("retains genuine frozen attendance even when mutable registrations are absent", async () => {
    const f = setup("PRIVATE"),
      e = await f.create();
    f.events.set(e.id, { ...f.events.get(e.id)!, status: "TERMINATED" });
    f.tables.set(id, {
      ...f.tables.get(id)!,
      confirmed: { gameId: 1, playerIds: [guest, waiter], startsAt: "2027-01-03T09:00:00Z" },
    });
    const list = await f.service.participants(owner, e.id, { limit: 20 });
    expect(list.items).toHaveLength(2);
    expect(list.items.every((row) => row.position === "FROZEN" && !row.canRemove)).toBe(true);
  });
});
async function resultFixture() {
  const f = setup("PRIVATE"),
    created = await f.create();
  const event = { ...f.events.get(created.id)!, status: "CONFIRMED" as const, version: 10 };
  f.events.set(event.id, event);
  const included = {
    ...f.tables.get(id)!,
    confirmed: { gameId: 1, playerIds: [owner, guest], startsAt: "2027-01-03T09:00:00Z" },
  };
  f.tables.set(id, included);
  f.tables.set(other, { ...included, id: other, order: 1, confirmed: undefined });
  f.notifications.notifyMany.mockClear();
  return { ...f, event };
}
it("allows public observers only explicit enrollment, never manager/voting powers or draft/email disclosure", async () => {
  const f = setup("PUBLIC"),
    event = await f.create();
  f.groups.membership.mockResolvedValue(null as never);
  const view = await f.service.detail(guest, event.id);
  expect(view).toMatchObject({
    role: "viewer",
    readOnly: true,
    myRegistrations: [],
    canEdit: false,
    canInvite: false,
    canRegister: true,
    canVote: false,
    canConfirm: false,
    canReplan: false,
    canFinalize: false,
  });
  expect(view.agreement).toBeUndefined();
  expect(view.myVotes).toBeUndefined();
  const stored = f.events.get(event.id),
    table = f.tables.get(id);
  if (!stored || !table) throw new Error("Missing public fixture");
  f.events.set(event.id, { ...stored, status: "TERMINATED" });
  f.tables.set(id, {
    ...table,
    confirmed: { gameId: 1, playerIds: [owner, waiter], startsAt: "2027-01-03T09:00:00.000Z" },
    resultDraft: {
      lowerWins: false,
      entries: [
        { userId: owner, score: "2" },
        { userId: waiter, score: "1" },
      ],
      tieBreaks: [],
    },
    results: {
      lowerWins: false,
      entries: [
        { userId: owner, score: "2", rank: 1 },
        { userId: waiter, score: "1", rank: 2 },
      ],
      tieBreaks: [],
      finalizedAt: "2027-01-03T15:00:00.000Z",
    },
  });
  f.users.findByIds.mockImplementation(async (ids) =>
    ids.map((userId) => ({
      clerkId: userId,
      name: "private@example.test",
      email: "private@example.test",
      username: "safe",
    })),
  );
  const publicTable = await f.service.tableDetail(guest, event.id, id);
  expect(publicTable.resultDraft).toBeUndefined();
  expect(
    publicTable.resultProfiles?.every((row) => row.email === null && row.name === "safe"),
  ).toBe(true);
  expect(JSON.stringify(publicTable)).not.toContain("private@example.test");
  f.events.set(event.id, stored);
  f.tables.set(id, table);
  expect(await f.service.tableDetail(guest, event.id, id)).toMatchObject({
    readOnly: true,
    canRegister: true,
    canInvite: false,
    canLeave: false,
    canRespond: false,
    myRegistration: null,
  });
  expect(
    (await f.service.tables(guest, event.id, { limit: 10, query: "" })).items[0].readOnly,
  ).toBe(true);
  await expect(
    f.service.vote(guest, event.id, { kind: "game", tableId: id, gameId: 1, vote: "YES" }),
  ).rejects.toMatchObject({ message: "GROUP_MEMBER_REQUIRED" });
  await expect(
    f.service.transition(guest, event.id, { version: event.version, action: "confirm" }),
  ).rejects.toMatchObject({ message: "GROUP_MEMBER_REQUIRED" });
  await expect(
    f.service.saveResult(guest, event.id, id, {
      version: event.version,
      lowerWins: false,
      entries: [],
      tieBreaks: [],
    }),
  ).rejects.toMatchObject({ message: "GROUP_MEMBER_REQUIRED" });
  f.events.set(event.id, { ...stored, adminUserId: guest });
  await expect(
    f.service.seats(guest, event.id, id, { limit: 10, query: "" }, true),
  ).rejects.toMatchObject({ message: "EVENT_ADMIN_REQUIRED" });
  f.events.set(event.id, stored);
  f.relationships.isBlocked.mockResolvedValue(true);
  await expect(f.service.detail(guest, event.id)).rejects.toMatchObject({ status: 404 });
  f.relationships.isBlocked.mockResolvedValue(false);
  f.groups.ban.mockResolvedValue({ until: null } as never);
  await expect(f.service.detail(guest, event.id)).rejects.toMatchObject({
    message: "GROUP_BANNED",
  });
  f.groups.ban.mockResolvedValue(null);
  expect(await f.service.join(guest, event.id, id, f.participation(event.id, id))).toMatchObject({
    status: "ACCEPTED",
    kind: "SELF",
    gameVotes: {},
  });
  expect(await f.service.detail(guest, event.id)).toMatchObject({
    role: "participant",
    readOnly: false,
    canManage: false,
  });
  expect(await f.groups.membership(other, guest)).toBeNull();
});
it("retains PRIVATE detail authorization and excludes its activities even for its own administrator", async () => {
  const f = setup("PRIVATE"),
    event = await f.create();
  await expect(f.service.activityResource(owner, event.id, id, true)).rejects.toMatchObject({
    status: 404,
  });
  f.groups.membership.mockResolvedValue(null as never);
  await expect(f.service.detail(guest, event.id)).rejects.toMatchObject({
    message: "GROUP_MEMBER_REQUIRED",
  });
});
const draftScores = () => ({
  lowerWins: false,
  entries: [
    { userId: owner, score: "2" },
    { userId: guest, score: "1" },
  ],
  tieBreaks: [],
});
it("persists editable admin-only provisional scores, ignores excluded tables, then finalizes saved results atomically", async () => {
  const f = await resultFixture();
  await expect(f.service.finalize(owner, f.event.id, { version: 10 })).rejects.toMatchObject({
    message: "EVERY_INCLUDED_TABLE_RESULT_REQUIRED",
  });
  expect((await f.service.detail(owner, f.event.id)).resultsReady).toBe(false);
  const saved = await f.service.saveResult(owner, f.event.id, id, {
    ...draftScores(),
    version: 10,
  });
  expect(saved.event).toMatchObject({ status: "CONFIRMED", version: 11, resultsReady: true });
  expect(saved.table.resultDraft).toEqual(draftScores());
  expect(f.tables.get(id)?.results).toBeUndefined();
  expect(f.ratings.applyTableResult).not.toHaveBeenCalled();
  expect(f.notifications.notifyMany).not.toHaveBeenCalled();
  expect((await f.service.tableDetail(guest, f.event.id, id)).resultDraft).toBeUndefined();
  const edited = { ...draftScores(), lowerWins: true };
  await f.service.saveResult(owner, f.event.id, id, { ...edited, version: 11 });
  const ended = await f.service.finalize(owner, f.event.id, { version: 12 });
  expect(ended.status).toBe("TERMINATED");
  expect(f.tables.get(id)?.results).toMatchObject({
    lowerWins: true,
    entries: expect.arrayContaining([expect.objectContaining({ userId: guest, rank: 1 })]),
  });
  expect(f.tables.get(id)?.resultDraft).toBeUndefined();
  expect(f.tables.get(other)?.results).toBeUndefined();
  expect(f.ratings.applyTableResult).toHaveBeenCalledOnce();
  await expect(
    f.service.saveResult(owner, f.event.id, id, { ...edited, version: ended.version }),
  ).rejects.toMatchObject({ message: "EVENT_NOT_CONFIRMED" });
});
it("rejects non-admin, excluded, stale and malformed provisional result writes without side effects", async () => {
  const f = await resultFixture(),
    input = { ...draftScores(), version: 10 };
  await expect(f.service.saveResult(guest, f.event.id, id, input)).rejects.toMatchObject({
    message: "EVENT_ADMIN_REQUIRED",
  });
  await expect(f.service.saveResult(owner, f.event.id, other, input)).rejects.toMatchObject({
    message: "TABLE_NOT_CONFIRMED",
  });
  await expect(
    f.service.saveResult(owner, f.event.id, id, { ...input, version: 9 }),
  ).rejects.toMatchObject({ message: "EVENT_CHANGED" });
  await expect(
    f.service.saveResult(owner, f.event.id, id, { ...input, entries: [input.entries[0]] }),
  ).rejects.toMatchObject({ message: "RESULTS_REQUIRE_EVERY_PLAYER_ONCE" });
  await expect(
    f.service.saveResult(owner, f.event.id, id, {
      ...input,
      tieBreaks: [{ score: "2", orderedUserIds: [owner, guest] }],
    }),
  ).rejects.toMatchObject({ message: "INVALID_TIE_BREAK" });
  f.repo.table.mockResolvedValueOnce(null);
  await expect(f.service.saveResult(owner, f.event.id, id, input)).rejects.toMatchObject({
    message: "TABLE_NOT_FOUND",
  });
  const stored = f.tables.get(id);
  if (!stored) throw new Error("Missing included Table fixture");
  f.repo.table.mockResolvedValueOnce({ ...stored, eventId: other });
  await expect(f.service.saveResult(owner, f.event.id, id, input)).rejects.toMatchObject({
    message: "TABLE_NOT_FOUND",
  });
  f.tables.set(id, {
    ...stored,
    results: {
      ...draftScores(),
      entries: [
        { userId: owner, score: "2", rank: 1 },
        { userId: guest, score: "1", rank: 2 },
      ],
      finalizedAt: "2027-01-03T10:00:00Z",
    },
  });
  await expect(f.service.saveResult(owner, f.event.id, id, input)).rejects.toMatchObject({
    message: "TABLE_RESULTS_IMMUTABLE",
  });
  expect(f.tables.get(id)?.resultDraft).toBeUndefined();
  expect(f.events.get(f.event.id)?.version).toBe(10);
  expect(f.ratings.applyTableResult).not.toHaveBeenCalled();
});
it("does not finalize when one of several included tables lacks a saved result", async () => {
  const f = await resultFixture();
  f.tables.set(other, { ...f.tables.get(other)!, confirmed: f.tables.get(id)!.confirmed });
  const saved = await f.service.saveResult(owner, f.event.id, id, {
    ...draftScores(),
    version: 10,
  });
  expect(saved.event.resultsReady).toBe(false);
  await expect(f.service.finalize(owner, f.event.id, { version: 11 })).rejects.toMatchObject({
    message: "EVERY_INCLUDED_TABLE_RESULT_REQUIRED",
  });
  expect(f.ratings.applyTableResult).not.toHaveBeenCalled();
  expect(f.tables.get(id)?.results).toBeUndefined();
});
it("projects only own source seats into Event summaries, matching Table reads without persisting positions", async () => {
  const f = setup(),
    event = await f.create();
  expect(event.myRegistrations).toEqual([]);
  for (const [sequence, userId] of [owner, guest, waiter].entries()) {
    f.registrations.set(userId, {
      id: userId,
      eventId: event.id,
      tableId: id,
      userId,
      kind: "SELF",
      status: "ACCEPTED",
      sequence,
      priorityAt: event.createdAt,
      version: 1,
      gameVotes: {},
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
    });
  }
  for (const userId of [owner, guest, waiter]) {
    const detail = await f.service.detail(userId, event.id);
    const table = await f.service.tableDetail(userId, event.id, id);
    expect(detail.myRegistrations).toHaveLength(1);
    expect(detail.myRegistrations[0]).toMatchObject({ userId, position: table.myPosition });
    expect(detail.myRegistrations[0].position).toBe(userId === waiter ? "WAITING" : "SEATED");
  }
  expect([...f.registrations.values()].every((row) => !("position" in row))).toBe(true);
});
it("uses immutable frozen rosters and leaves missing Table evidence unknown", async () => {
  const f = setup(),
    event = await f.create();
  const registration: TableRegistration = {
    id,
    eventId: event.id,
    tableId: id,
    userId: guest,
    kind: "SELF",
    status: "ACCEPTED",
    sequence: 9,
    priorityAt: event.createdAt,
    version: 1,
    gameVotes: {},
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };
  f.registrations.set(id, registration);
  f.events.set(event.id, { ...f.events.get(event.id)!, status: "CONFIRMED" });
  f.tables.set(id, {
    ...f.tables.get(id)!,
    confirmed: { gameId: 1, playerIds: [guest], startsAt: "2027-01-03T09:00:00Z" },
  });
  expect((await f.service.detail(guest, event.id)).myRegistrations[0].position).toBe("FROZEN");
  f.tables.set(id, {
    ...f.tables.get(id)!,
    confirmed: { gameId: 1, playerIds: [owner], startsAt: "2027-01-03T09:00:00Z" },
  });
  expect((await f.service.detail(guest, event.id)).myRegistrations[0].position).toBe("WAITING");
  f.tables.delete(id);
  expect((await f.service.detail(guest, event.id)).myRegistrations[0].position).toBeUndefined();
});

it("acknowledges exactly the successfully voted item at the displayed source cutoff, never a rejected vote", async () => {
  const f = setup("PRIVATE"),
    input = privateBody();
  input.tables[0].games.push({ gameId: 2 });
  const event = await f.service.create(owner, input);
  await f.service.join(owner, event.id, id, {
    ...f.participation(event.id, id),
    gameVotes: { "1": "YES", "2": "NO" },
  });
  const through = "2026-01-01T00:00:00.000Z";
  await f.service.vote(owner, event.id, {
    kind: "date",
    optionId: id,
    vote: "YES",
    attentionThrough: through,
  });
  expect(f.notifications.acknowledgeItems).toHaveBeenCalledExactlyOnceWith(
    owner,
    [JSON.stringify(["event", event.id, "date", id])],
    through,
  );
  await expect(
    f.service.vote(owner, event.id, {
      kind: "game",
      tableId: id,
      gameId: 1,
      vote: "NO",
      attentionThrough: through,
    }),
  ).rejects.toMatchObject({ code: "GAME_POSITIVE_AVAILABILITY_REQUIRED" });
  expect(f.notifications.acknowledgeItems).toHaveBeenCalledTimes(1);
});
it.each([null, "PRIVATE", "PUBLIC"] as const)(
  "deletes planning Event/Table atomically through creator/version guards (%s)",
  async (type) => {
    const s = setup(type),
      input = body();
    input.groupId = type ? other : null;
    input.tables.push({ ...input.tables[0], id: other, name: "Second table" });
    if (type === "PUBLIC") {
      input.endsAt = "2027-01-03T18:00:00Z";
      input.bookingClosesAt = "2027-01-02T08:00:00Z";
    }
    const event = await s.service.create(owner, input);
    const invitation = await s.service.register(owner, event.id, id, guest);
    await s.accept(invitation);
    const version = s.events.get(event.id)!.version;
    await expect(s.service.remove(guest, event.id, { version })).rejects.toMatchObject({
      code: "EVENT_ADMIN_REQUIRED",
    });
    await expect(s.service.removeTable(guest, event.id, id, { version })).rejects.toMatchObject({
      code: "EVENT_ADMIN_REQUIRED",
    });
    for (const action of [
      () => s.service.remove(owner, event.id, { version: version + 1 }),
      () => s.service.removeTable(owner, event.id, id, { version: version + 1 }),
    ])
      await expect(action()).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    await expect(
      s.service.removeTable(owner, event.id, "missing", { version }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    const result = await s.service.removeTable(owner, event.id, id, { version });
    expect(result.tableCount).toBe(1);
    expect(result.version).toBe(version + 1);
    expect(s.tables.get(id)?.removedAt).toBeTruthy();
    expect(
      [...s.registrations.values()]
        .filter((row) => row.tableId === id)
        .every((row) => row.status === "CANCELLED"),
    ).toBe(true);
    expect(s.tables.get(other)?.removedAt).toBeUndefined();
    await expect(
      s.service.removeTable(owner, event.id, other, { version: result.version }),
    ).rejects.toMatchObject({ code: "EVENT_TABLE_LIMIT" });
    expect(await s.service.remove(owner, event.id, { version: result.version })).toEqual({
      id: event.id,
      groupId: input.groupId,
    });
    expect(s.events.has(event.id)).toBe(false);
    expect(s.tables.size).toBe(0);
    expect(s.registrations.size).toBe(0);
    expect(s.ratings.applyTableResult).not.toHaveBeenCalled();
  },
);
it.each(["CONFIRMED", "TERMINATED"] as const)(
  "never deletes immutable/non-planning %s Event or Table",
  async (status) => {
    const s = setup(),
      event = await s.create();
    s.events.set(event.id, { ...s.events.get(event.id)!, status });
    await expect(
      s.service.remove(owner, event.id, { version: event.version }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_PLANNING" });
    await expect(
      s.service.removeTable(owner, event.id, id, { version: event.version }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_PLANNING" });
    expect(s.repo.remove).not.toHaveBeenCalled();
    expect(s.repo.removeTable).not.toHaveBeenCalled();
  },
);
it("preserves exact public cutoffs for both deletion paths", async () => {
  const s = setup("PUBLIC"),
    event = await s.create();
  vi.setSystemTime(new Date(event.bookingClosesAt!));
  await expect(s.service.remove(owner, event.id, { version: event.version })).rejects.toMatchObject(
    { code: "EVENT_BOOKING_CLOSED" },
  );
  await expect(
    s.service.removeTable(owner, event.id, id, { version: event.version }),
  ).rejects.toMatchObject({ code: "EVENT_BOOKING_CLOSED" });
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("creation correlation without client identity authority", () => {
  it("persists and returns the optional correlation on create/read/list and keeps it immutable across planning edits", async () => {
    const f = setup();
    const clientRequestId = "99999999-9999-4999-8999-999999999999";
    const input = { ...body(), clientRequestId };
    const created = await f.service.create(owner, input);
    expect(created.clientRequestId).toBe(clientRequestId);
    expect(created.id).not.toBe(clientRequestId);
    expect(f.events.get(created.id)).toMatchObject({
      id: created.id,
      clientRequestId,
      adminUserId: owner,
    });
    expect((await f.service.detail(owner, created.id)).clientRequestId).toBe(clientRequestId);
    expect((await f.service.list(owner, { limit: 20 })).items[0].clientRequestId).toBe(
      clientRequestId,
    );
    const { groupId: _group, clientRequestId: _request, ...fields } = input;
    await f.service.update(owner, created.id, {
      ...fields,
      name: "Edited event",
      version: created.version,
      tables: [],
      removedTableIds: [],
    });
    expect(f.events.get(created.id)).toMatchObject({
      clientRequestId,
      name: "Edited event",
      version: 2,
    });
    expect(created.myRegistrations).toEqual([]);
    expect(created.participantCount).toBe(0);
  });
});

describe("atomic invitation acceptance", () => {
  it("returns only the exact committed parent epoch, separately from the stored registration version", async () => {
    const f = setup();
    const event = await f.create();
    const invite = await f.service.register(owner, event.id, id, guest);
    expect(invite.eventVersion).toBe(f.events.get(event.id)?.version);
    expect(invite.eventVersion).toBe(event.version + 1);
    expect(f.registrations.get(invite.id)).not.toHaveProperty("eventVersion");
    const accepted = await f.accept(invite);
    expect(accepted.eventVersion).toBe(f.events.get(event.id)?.version);
    expect(accepted.eventVersion).toBe(invite.eventVersion + 1);
    expect(accepted.version).toBe(invite.version + 1);
    expect(f.registrations.get(invite.id)).not.toHaveProperty("eventVersion");
    const cancelled = await f.service.registrationAction(guest, invite.id, {
      action: "cancel",
      version: accepted.version,
    });
    expect(cancelled.eventVersion).toBe(f.events.get(event.id)?.version);
    expect(cancelled.eventVersion).toBe(accepted.eventVersion + 1);
    expect(f.registrations.get(invite.id)).not.toHaveProperty("eventVersion");
  });
  it.each([false, true])(
    "rejects missing/foreign invitation Tables before writes: foreign=%s",
    async (foreign) => {
      const f = setup(),
        event = await f.create(),
        invite = await f.service.register(owner, event.id, id, guest);
      f.repo.table.mockResolvedValueOnce(foreign ? { ...f.tables.get(id)!, eventId: other } : null);
      f.repo.saveRegistration.mockClear();
      await expect(f.accept(invite)).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
      expect(f.repo.saveRegistration).not.toHaveBeenCalled();
      expect(f.registrations.get(invite.id)?.status).toBe("PENDING");
    },
  );
  it.each([null, "PRIVATE", "PUBLIC"] as const)(
    "requires valid current choices before any acceptance write: %s",
    async (type) => {
      const f = setup(type),
        event = await f.create(),
        invite = await f.service.register(owner, event.id, id, guest);
      const choices = f.participation(event.id, id);
      const invalid: Array<{ input: JoinTableInput | undefined; code: string }> = [
        { input: undefined, code: "TABLE_GAME_AVAILABILITY_REQUIRED" },
        { input: { ...choices, version: choices.version - 1 }, code: "EVENT_CHANGED" },
        { input: { ...choices, gameVotes: { "1": "NO" } }, code: "INVALID_JOIN_GAME_VOTES" },
        { input: { ...choices, gameVotes: { "2": "YES" } }, code: "INVALID_JOIN_GAME_VOTES" },
        {
          input: { ...choices, gameVotes: { "1": "YES", "2": "NO" } },
          code: "INVALID_JOIN_GAME_VOTES",
        },
      ];
      if (type === "PRIVATE") {
        const availability = choices.availability!;
        invalid.push(
          { input: { ...choices, availability: undefined }, code: "EVENT_AVAILABILITY_REQUIRED" },
          {
            input: {
              ...choices,
              availability: { ...availability, version: availability.version - 1 },
            },
            code: "EVENT_CHANGED",
          },
          {
            input: {
              ...choices,
              availability: { ...availability, dateVotes: { [id]: "UNKNOWN" as never } },
            },
            code: "INVALID_JOIN_AVAILABILITY",
          },
          {
            input: { ...choices, availability: { ...availability, locationVotes: { [id]: "NO" } } },
            code: "INVALID_JOIN_AVAILABILITY",
          },
          {
            input: { ...choices, availability: { ...availability, dateVotes: { [other]: "YES" } } },
            code: "INVALID_JOIN_AVAILABILITY",
          },
        );
      } else
        invalid.push({
          input: {
            ...choices,
            availability: {
              version: choices.version,
              dateVotes: { [id]: "YES" },
              locationVotes: { [id]: "YES" },
            },
          },
          code: "INVALID_JOIN_AVAILABILITY",
        });
      const before = structuredClone(f.events.get(event.id));
      f.repo.saveRegistration.mockClear();
      f.repo.saveVoter.mockClear();
      f.repo.save.mockClear();
      for (const { input, code } of invalid)
        await expect(
          f.service.registrationAction(guest, invite.id, {
            action: "accept",
            version: invite.version,
            participation: input as JoinTableInput,
          }),
        ).rejects.toMatchObject({ code });
      expect(f.repo.saveRegistration).not.toHaveBeenCalled();
      expect(f.repo.saveVoter).not.toHaveBeenCalled();
      expect(f.repo.save).not.toHaveBeenCalled();
      expect(f.events.get(event.id)).toEqual(before);
      expect(f.registrations.get(invite.id)?.status).toBe("PENDING");
      expect(f.registrations.get(invite.id)?.gameVotes).toEqual({});
    },
  );
  it.each([null, "PRIVATE", "PUBLIC"] as const)(
    "accepts with choices without changing invitation priority or creating another registration: %s",
    async (type) => {
      const f = setup(type),
        event = await f.create(),
        invite = await f.service.register(owner, event.id, id, guest);
      const participation = f.participation(event.id, id);
      participation.gameVotes = { "1": "IF_NEEDED" };
      const accepted = await f.service.registrationAction(guest, invite.id, {
        action: "accept",
        version: invite.version,
        participation,
      });
      expect(accepted).toMatchObject({
        id: invite.id,
        status: "ACCEPTED",
        version: invite.version + 1,
        priorityAt: invite.priorityAt,
        sequence: invite.sequence,
        gameVotes: {},
      });
      expect(f.registrations.size).toBe(1);
      if (type === "PRIVATE")
        expect(f.repo.saveVoter).toHaveBeenLastCalledWith(
          expect.objectContaining({
            eventId: event.id,
            userId: guest,
            dateVotes: participation.availability!.dateVotes,
            locationVotes: participation.availability!.locationVotes,
          }),
        );
      else expect(f.repo.saveVoter).not.toHaveBeenCalled();
    },
  );
  it("still requires date/location choices for PRIVATE invitations when another Table is already accepted", async () => {
    const f = setup("PRIVATE"),
      input = body();
    input.groupId = other;
    input.tables.push({ ...input.tables[0], id: other, name: "Second table" });
    const event = await f.service.create(owner, input);
    await f.service.join(guest, event.id, id, f.participation(event.id, id));
    const invite = await f.service.register(owner, event.id, other, guest);
    const choices = f.participation(event.id, other);
    delete choices.availability;
    await expect(
      f.service.registrationAction(guest, invite.id, {
        action: "accept",
        version: invite.version,
        participation: choices,
      }),
    ).rejects.toMatchObject({ code: "EVENT_AVAILABILITY_REQUIRED" });
    expect(f.registrations.get(invite.id)?.status).toBe("PENDING");
  });
});

describe("unified event core — real consent, no synthetic Match writes", () => {
  it.each([null, "PRIVATE"] as const)(
    "reads only authorized %s Table candidates with source paging and no extra profile disclosure",
    async (type) => {
      const f = setup(type),
        event = await f.create();
      f.repo.invitationCandidates.mockResolvedValue([
        { clerkId: guest, name: "Guest", email: "guest@example.test" },
        {
          clerkId: waiter,
          name: "Waiter",
          email: "waiter@example.test",
          username: "waiter",
          avatarUrl: "https://example.test/avatar.png",
        },
      ]);
      const first = await f.service.invitationCandidates(owner, event.id, id, {
        limit: 1,
        query: "play",
      });
      expect(first).toEqual({
        items: [
          {
            id: guest,
            name: "Guest",
            username: null,
            invitationBlockReason: null,
            email: type ? null : "guest@example.test",
            avatarUrl: null,
          },
        ],
        nextCursor: guest,
        eventVersion: event.version,
      });
      expect(f.repo.invitationCandidates).toHaveBeenCalledWith(
        type ? expect.objectContaining({ id: other }) : null,
        owner,
        id,
        { limit: 1, query: "play" },
      );
      f.repo.invitationCandidates.mockResolvedValue([
        {
          clerkId: waiter,
          name: "Waiter",
          email: "waiter@example.test",
          username: "waiter",
          avatarUrl: "https://example.test/avatar.png",
        },
      ]);
      const second = await f.service.invitationCandidates(owner, event.id, id, {
        limit: 1,
        cursor: guest,
      });
      expect(second.items[0]).toMatchObject({
        id: waiter,
        username: "waiter",
        avatarUrl: "https://example.test/avatar.png",
      });
      expect(second.nextCursor).toBeNull();
      expect(second.eventVersion).toBe(event.version);
      await expect(
        f.service.invitationCandidates(guest, event.id, id, { limit: 20 }),
      ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
      await expect(
        f.service.invitationCandidates(owner, event.id, other, { limit: 20 }),
      ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
      for (const username of ["handle", undefined]) {
        f.repo.invitationCandidates.mockResolvedValue([
          { clerkId: guest, name: "", email: "guest@example.test", username },
        ]);
        expect(
          (await f.service.invitationCandidates(owner, event.id, id, { limit: 20 })).items[0].name,
        ).toBe(username ?? guest);
      }
      f.repo.invitationCandidates.mockResolvedValue([]);
      expect(
        (await f.service.invitationCandidates(owner, event.id, id, { limit: 20 })).items,
      ).toEqual([]);
      f.events.set(event.id, { ...f.events.get(event.id)!, status: "CONFIRMED" });
      await expect(
        f.service.invitationCandidates(owner, event.id, id, { limit: 20 }),
      ).rejects.toMatchObject({ code: "EVENT_NOT_PLANNING" });
      expect(f.repo.saveRegistration).not.toHaveBeenCalled();
    },
  );
  it("keeps conflicting PUBLIC invitees visible with the write policy's reason, including non-playing demonstrators", async () => {
    const f = setup("PUBLIC"),
      input = {
        ...body(),
        groupId: other,
        endsAt: "2027-01-03T18:00:00Z",
        bookingClosesAt: "2027-01-02T08:00:00Z",
      };
    const adjacentId = "33333333-3333-4333-8333-333333333333";
    input.tables.push(
      {
        ...input.tables[0],
        id: other,
        name: "Overlapping",
        startsAt: "2027-01-03T08:30:00Z",
        demonstratorUserId: "demo",
      },
      {
        ...input.tables[0],
        id: adjacentId,
        name: "Adjacent",
        startsAt: "2027-01-03T09:00:00Z",
        demonstratorUserId: "adjacent",
      },
    );
    const event = await f.service.create(owner, input);
    await f.service.register(owner, event.id, other, "pending");
    const accepted = await f.service.register(owner, event.id, other, "accepted");
    await f.accept(accepted);
    const cancelled = await f.service.register(owner, event.id, other, "cancelled");
    await f.service.registrationAction(owner, cancelled.id, {
      action: "remove",
      version: cancelled.version,
    });
    const candidates = ["demo", "pending", "accepted", "adjacent", "cancelled", "free"];
    f.repo.invitationCandidates.mockResolvedValue(
      candidates.map((clerkId) => ({ clerkId, name: clerkId, email: `${clerkId}@example.test` })),
    );
    f.repo.allTables.mockClear();
    f.repo.allRegistrations.mockClear();
    const writes = f.repo.saveRegistration.mock.calls.length;
    const page = await f.service.invitationCandidates(owner, event.id, id, { limit: 2 });
    expect(page.items.map((row) => [row.id, row.invitationBlockReason])).toEqual([
      ["demo", "TABLE_TIME_CONFLICT"],
      ["pending", "TABLE_TIME_CONFLICT"],
    ]);
    expect(page.nextCursor).toBe("pending");
    expect(f.repo.allTables).toHaveBeenCalledOnce();
    expect(f.repo.allRegistrations).toHaveBeenCalledOnce();
    const all = await f.service.invitationCandidates(owner, event.id, id, { limit: 20 });
    expect(all.items.map((row) => [row.id, row.invitationBlockReason])).toEqual([
      ["demo", "TABLE_TIME_CONFLICT"],
      ["pending", "TABLE_TIME_CONFLICT"],
      ["accepted", "TABLE_TIME_CONFLICT"],
      ["adjacent", null],
      ["cancelled", null],
      ["free", null],
    ]);
    expect(
      all.items.every(
        (row) => row.email === null && !("presence" in row) && !("conflictingTableId" in row),
      ),
    ).toBe(true);
    expect(f.repo.saveRegistration.mock.calls).toHaveLength(writes);
    await expect(f.service.register(owner, event.id, id, "demo")).rejects.toMatchObject({
      code: "TABLE_TIME_CONFLICT",
    });
  });
  it("requires explicit current game votes and protects the final positive game under the Event lock", async () => {
    const f = setup(),
      input = body();
    input.tables[0].games.push({ gameId: 2 });
    const event = await f.service.create(owner, input);
    await expect(f.service.join(owner, event.id, id)).rejects.toMatchObject({
      code: "TABLE_GAME_AVAILABILITY_REQUIRED",
    });
    for (const gameVotes of [
      {},
      { "1": "NO", "2": "NO" },
      { "1": "UNKNOWN", "2": "YES" },
      { "3": "YES" },
    ])
      await expect(
        f.service.join(owner, event.id, id, { version: event.version, gameVotes } as never),
      ).rejects.toMatchObject({ code: "INVALID_JOIN_GAME_VOTES" });
    await expect(
      f.service.join(owner, event.id, id, {
        version: event.version + 1,
        gameVotes: { "1": "YES" },
      }),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    expect(f.repo.saveRegistration).not.toHaveBeenCalled();
    const row = await f.service.join(owner, event.id, id, {
      version: event.version,
      gameVotes: { "1": "YES", "2": "NO" },
    });
    expect(row.gameVotes).toEqual({ "1": "YES", "2": "NO" });
    await expect(
      f.service.vote(owner, event.id, { kind: "game", tableId: id, gameId: 1, vote: "NO" }),
    ).rejects.toMatchObject({ code: "GAME_POSITIVE_AVAILABILITY_REQUIRED" });
    await f.service.vote(owner, event.id, {
      kind: "game",
      tableId: id,
      gameId: 1,
      vote: "IF_NEEDED",
    });
    const table = f.tables.get(id)!;

    await f.service.vote(owner, event.id, { kind: "game", tableId: id, gameId: 2, vote: "YES" });
    await f.service.vote(owner, event.id, { kind: "game", tableId: id, gameId: 1, vote: "NO" });
    await expect(
      f.service.vote(owner, event.id, { kind: "game", tableId: id, gameId: 2, vote: "NO" }),
    ).rejects.toMatchObject({ code: "GAME_POSITIVE_AVAILABILITY_REQUIRED" });
    await expect(
      f.service.vote(owner, event.id, {
        kind: "game",
        tableId: id,
        gameId: 2,
        vote: "UNKNOWN",
      } as never),
    ).rejects.toMatchObject({ code: "INVALID_VOTE" });
    f.tables.set(id, { ...table, games: table.games.slice(0, 1) });
    await expect(
      f.service.vote(owner, event.id, { kind: "game", tableId: id, gameId: 1, vote: "NO" }),
    ).rejects.toMatchObject({ code: "FIXED_OPTION" });
  });
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
    await f.service.join(
      guest,
      event.id,
      id,
      joinChoices({
        version: f.events.get(event.id)!.version,
        dateVotes: { [id]: "YES" },
        locationVotes: { [id]: "IF_NEEDED" },
      }),
    );
    const previous = clone(f.votes.get(`${event.id}|${guest}`));
    const second = await f.service.join(guest, event.id, other, {
      version: f.events.get(event.id)!.version,
      gameVotes: { "1": "IF_NEEDED" },
    });
    expect(second).toMatchObject({ status: "ACCEPTED", tableId: other, userId: guest });
    expect(f.votes.get(`${event.id}|${guest}`)).toEqual(previous);
    expect(f.repo.saveVoter).toHaveBeenCalledTimes(1);
  });
  it("rejects removing the final positive date/venue, allowing positive switches and another current alternative", async () => {
    const f = setup("PRIVATE"),
      event = await f.service.create(owner, privateBody());
    await f.service.join(
      guest,
      event.id,
      id,
      joinChoices({
        version: event.version,
        dateVotes: { [id]: "YES", [other]: "NO" },
        locationVotes: { [id]: "IF_NEEDED", [other]: "NO" },
      }),
    );
    for (const kind of ["date", "location"] as const) {
      await expect(
        f.service.vote(guest, event.id, { kind, optionId: id, vote: "NO" }),
      ).rejects.toMatchObject({ code: "EVENT_POSITIVE_AVAILABILITY_REQUIRED" });
      await f.service.vote(guest, event.id, { kind, optionId: id, vote: "IF_NEEDED" });
      await f.service.vote(guest, event.id, { kind, optionId: id, vote: "YES" });
    }

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
    ).rejects.toMatchObject({ code: "FIXED_OPTION" });
  });
  it("updates PRIVATE Event availability with a second Table join, enforcing the same complete positive choices", async () => {
    const f = setup("PRIVATE"),
      event = await f.service.create(owner, privateBody());
    f.tables.set(other, { ...f.tables.get(id)!, id: other, order: 1 });
    await f.service.join(
      guest,
      event.id,
      id,
      joinChoices({
        version: event.version,
        dateVotes: { [id]: "YES", [other]: "NO" },
        locationVotes: { [id]: "IF_NEEDED", [other]: "NO" },
      }),
    );
    const availability = {
      version: f.events.get(event.id)!.version,
      dateVotes: { [id]: "IF_NEEDED" as const, [other]: "NO" as const },
      locationVotes: { [id]: "YES" as const, [other]: "NO" as const },
    };
    await expect(
      f.service.join(
        guest,
        event.id,
        other,
        joinChoices({ ...availability, dateVotes: { [id]: "NO" } }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_JOIN_AVAILABILITY" });
    expect(f.repo.saveVoter).toHaveBeenCalledTimes(1);
    const row = await f.service.join(guest, event.id, other, {
      ...joinChoices(availability),
      gameVotes: { "1": "IF_NEEDED" },
    });
    expect(row).toMatchObject({
      status: "ACCEPTED",
      tableId: other,
      gameVotes: {},
    });
    expect(f.votes.get(`${event.id}|${guest}`)).toMatchObject({
      dateVotes: availability.dateVotes,
      locationVotes: availability.locationVotes,
    });
    expect(f.repo.saveVoter).toHaveBeenCalledTimes(2);
  });
  it("requires complete current PRIVATE availability before voluntary enrollment writes", async () => {
    const f = setup("PRIVATE"),
      event = await f.service.create(owner, privateBody());
    const availability = {
      version: event.version,
      dateVotes: { [id]: "YES" as const, [other]: "NO" as const },
      locationVotes: { [id]: "IF_NEEDED" as const, [other]: "NO" as const },
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
        f.service.join(guest, event.id, id, joinChoices(value as JoinEventAvailability)),
      ).rejects.toMatchObject({
        code: "INVALID_JOIN_AVAILABILITY",
      });
    await expect(
      f.service.join(
        guest,
        event.id,
        id,
        joinChoices({ ...availability, version: event.version + 1 }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    await expect(
      f.service.join(guest, event.id, id, {
        ...joinChoices(availability),
        availability: { ...availability, version: availability.version + 1 },
      }),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    expect(f.repo.saveRegistration).not.toHaveBeenCalled();
    expect(f.repo.saveVoter).not.toHaveBeenCalled();
    const row = await f.service.join(guest, event.id, id, joinChoices(availability));
    expect(row).toMatchObject({
      userId: guest,
      kind: "SELF",
      status: "ACCEPTED",
      gameVotes: {},
    });
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
      await expect(
        f.service.join(owner, event.id, id, joinChoices(availability)),
      ).rejects.toMatchObject({
        code: "EVENT_AVAILABILITY_NOT_REQUIRED",
      });
      expect(
        (
          await f.service.join(owner, event.id, id, {
            version: event.version,
            gameVotes: { "1": "YES" },
          })
        ).status,
      ).toBe("ACCEPTED");
      expect(f.repo.saveVoter).not.toHaveBeenCalled();
    }
    const f = setup("PRIVATE"),
      event = await f.create();
    await expect(
      f.service.register(
        owner,
        event.id,
        id,
        guest,
        joinChoices({
          version: event.version,
          dateVotes: { [id]: "YES" },
          locationVotes: { [id]: "YES" },
        }),
      ),
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
  it("projects the authorized parent Event schedule in list/detail Table responses without guessing a Table start", async () => {
    const f = setup("PRIVATE"),
      event = await f.create();
    const stored = f.events.get(event.id);
    if (!stored) throw new Error("Missing Event fixture");
    const secondLocation = {
      ...location,
      id: other,
      name: "Other venue",
      timeZone: "America/New_York",
    };
    stored.dates.push({ id: other, day: "2027-01-04", startTime: "16:45" });
    stored.locations.push(secondLocation);
    const table = f.tables.get(id);
    if (!table) throw new Error("Missing Table fixture");
    table.startsAt = "2027-01-04T23:00:00Z";
    const proposed = {
      localStartsAt: "2027-01-03T09:00",
      location: stored.locations[0],
      dateCount: 2,
      locationCount: 2,
      timeZone: stored.timeZone,
      dates: stored.dates.map((row) => ({
        id: row.id,
        localStartsAt: `${row.day}T${row.startTime ?? stored.startTime}`,
      })),
      locations: stored.locations,
    };
    expect((await f.service.tableDetail(owner, event.id, id)).eventSchedule).toEqual(proposed);
    expect((await f.service.tables(owner, event.id, { limit: 20 })).items[0].eventSchedule).toEqual(
      proposed,
    );
    stored.status = "CONFIRMED";
    stored.confirmed = { dateId: other, locationId: other, at: stored.updatedAt };
    expect((await f.service.tableDetail(owner, event.id, id)).eventSchedule).toEqual({
      localStartsAt: "2027-01-04T16:45",
      location: secondLocation,
      dateCount: 1,
      locationCount: 1,
      timeZone: stored.timeZone,
      dates: [{ id: other, localStartsAt: "2027-01-04T16:45" }],
      locations: [secondLocation],
    });
    f.groups.membership.mockResolvedValue(null as never);
    await expect(f.service.tableDetail("outsider", event.id, id)).rejects.toMatchObject({
      code: "GROUP_MEMBER_REQUIRED",
    });
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
      managementRole: "admin",
      acceptedCount: 0,
      pendingRegistrationCount: 0,
    });
  });
  it.each([
    "2027-01-03T07:59:00Z",
    "2027-01-03T21:01:00Z",
    "2027-01-03T22:00:00Z",
    "2027-01-04T08:30:00Z",
  ])(
    "rejects public table starts or full durations outside the inclusive event interval: %s",
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
  it.each([undefined, "2027-01-03T08:00:00Z", "2027-01-03T21:00:00Z"])(
    "accepts default/event-start/latest full-duration public table starts: %s",
    async (startsAt) => {
      const f = setup("PUBLIC"),
        input = {
          ...body(),
          groupId: other,
          endsAt: "2027-01-03T22:00:00Z",
          bookingClosesAt: "2027-01-02T22:59:59Z",
        };
      input.tables[0].startsAt = startsAt;
      await f.service.create(owner, input);
      expect(f.tables.get(id)?.startsAt).toBe(
        new Date(startsAt ?? "2027-01-03T08:00:00Z").toISOString(),
      );
    },
  );
  it.each(["2027-01-03T07:59:00Z", "2027-01-02T23:30:00Z"])(
    "rejects event-day cutoffs in the verified venue zone, even before event start: %s",
    async (bookingClosesAt) => {
      const f = setup("PUBLIC");
      await expect(
        f.service.create(owner, {
          ...body(),
          groupId: other,
          endsAt: "2027-01-03T22:00:00Z",
          bookingClosesAt,
        }),
      ).rejects.toMatchObject({ code: "EVENT_CUTOFF_BEFORE_START_REQUIRED" });
      expect(f.events.size).toBe(0);
      expect(f.tables.size).toBe(0);
    },
  );
  it("accepts same-day public ends and prior-day cutoffs, rejecting overnight writes in the venue zone atomically", async () => {
    const f = setup("PUBLIC"),
      input = {
        ...body(),
        groupId: other,
        endsAt: "2027-01-03T22:59:00Z",
        bookingClosesAt: "2027-01-02T22:59:59Z",
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
      input = privateBody();
    input.tables[0].games.push({ gameId: 2 });
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
      // The single game is accepted by registration, not a synthetic ballot.
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
      f.service.registrationAction(owner, invite.id, {
        action: "accept",
        version: 1,
        participation: f.participation(event.id, id),
      }),
    ).rejects.toMatchObject({ code: "INVITATION_RECIPIENT_REQUIRED" });
    await expect(
      f.service.registrationAction(guest, invite.id, {
        action: "accept",
        version: 99,
        participation: f.participation(event.id, id),
      }),
    ).rejects.toMatchObject({ code: "REGISTRATION_CHANGED" });
    const accepted = await f.accept(invite);
    expect(accepted.priorityAt).toBe(invite.priorityAt);
    expect(accepted.sequence).toBe(invite.sequence);
    await expect(f.accept(invite)).rejects.toMatchObject({ code: "REGISTRATION_CHANGED" });
    await expect(
      f.service.vote(guest, event.id, { kind: "game", tableId: id, gameId: 1, vote: "YES" }),
    ).rejects.toMatchObject({ code: "FIXED_OPTION" });
    expect(f.registrations.get(invite.id)?.status).toBe("ACCEPTED");
  });
  it("preserves votes, waiters and excluded tables when returning to PLANNING", async () => {
    const f = setup("PRIVATE"),
      input = privateBody();
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
      event = await f.service.create(owner, privateBody());
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
describe("singleton consent", () => {
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    "requires ballots only for multiple options, for join and invitation acceptance: %s",
    async (mask) => {
      const f = setup("PRIVATE"),
        input = privateBody();
      if (!(mask & 1)) input.dates = input.dates.slice(0, 1);
      if (!(mask & 2)) input.locations = input.locations.slice(0, 1);
      if (mask & 4) input.tables[0].games.push({ gameId: 2 });
      const event = await f.service.create(owner, input);
      await f.service.join(owner, event.id, id, f.participation(event.id, id));
      const invitation = await f.service.register(owner, event.id, id, guest);
      expect(f.registrations.get(invitation.id)?.status).toBe("PENDING");
      expect((await f.service.detail(owner, event.id)).agreement?.agreed).toBe(false);
      const choices = f.participation(event.id, id);
      const writes = f.repo.saveRegistration.mock.calls.length;
      for (const dimension of ["date", "location", "game"] as const) {
        const bit = dimension === "date" ? 1 : dimension === "location" ? 2 : 4;
        if (!(mask & bit)) continue;
        const invalid = clone(choices);
        if (dimension === "game") invalid.gameVotes = {};
        else invalid.availability![dimension === "date" ? "dateVotes" : "locationVotes"] = {};
        await expect(
          f.service.registrationAction(guest, invitation.id, {
            action: "accept",
            version: invitation.version,
            participation: invalid,
          }),
        ).rejects.toMatchObject({
          code: dimension === "game" ? "INVALID_JOIN_GAME_VOTES" : "INVALID_JOIN_AVAILABILITY",
        });
      }
      expect(f.repo.saveRegistration).toHaveBeenCalledTimes(writes);
      await f.service.registrationAction(guest, invitation.id, {
        action: "accept",
        version: invitation.version,
        participation: choices,
      });
      expect(f.registrations.get(invitation.id)?.gameVotes).toEqual(
        mask & 4 ? { "1": "YES", "2": "YES" } : {},
      );
      expect(f.votes.get(`${event.id}|${guest}`)).toMatchObject({
        dateVotes: mask & 1 ? { [id]: "YES", [other]: "YES" } : {},
        locationVotes: mask & 2 ? { [id]: "YES", [other]: "YES" } : {},
      });
      expect((await f.service.detail(owner, event.id)).agreement).toMatchObject({ agreed: true });
      f.notifications.acknowledgeItems.mockClear();
      for (const dimension of ["date", "location", "game"] as const) {
        const bit = dimension === "date" ? 1 : dimension === "location" ? 2 : 4;
        if (mask & bit) continue;
        await expect(
          f.service.vote(guest, event.id, {
            ...(dimension === "game"
              ? { kind: "game", tableId: id, gameId: 1 }
              : { kind: dimension, optionId: id }),
            vote: "YES",
            attentionThrough: event.createdAt,
          }),
        ).rejects.toMatchObject({ code: "FIXED_OPTION" });
      }
      expect(f.notifications.acknowledgeItems).not.toHaveBeenCalled();
      await f.confirm(event.id);
      expect(f.tables.get(id)?.confirmed?.playerIds).toEqual([owner, guest]);
    },
  );
  it.each([null, "PRIVATE", "PUBLIC"] as const)(
    "accepts empty singleton ballots but rejects stale consent before writes: %s",
    async (type) => {
      const f = setup(type),
        event = await f.create();
      const choices = f.participation(event.id, id);
      await expect(
        f.service.join(owner, event.id, id, { ...choices, version: event.version + 1 }),
      ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
      expect(f.repo.saveRegistration).not.toHaveBeenCalled();
      const accepted = await f.service.join(owner, event.id, id, choices);
      expect(accepted.gameVotes).toEqual({});
      expect(f.repo.saveVoter).toHaveBeenCalledTimes(type === "PRIVATE" ? 1 : 0);
    },
  );
});

describe("current Group management authority", () => {
  it("permits a current moderator to create grouped Events without implicit registrations", async () => {
    const f = setup("PRIVATE");
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED", role: "MODERATOR" });
    const event = await f.service.create(guest, { ...body(), groupId: other });
    expect(event).toMatchObject({
      adminUserId: guest,
      canManage: true,
      canEdit: true,
      role: "admin",
      participantCount: 0,
    });
    expect(f.registrations.size).toBe(0);
    expect(await f.service.tableDetail(guest, event.id, id)).toMatchObject({
      canManage: true,
      managementRole: "moderator",
    });
    expect(await f.service.tableDetail(owner, event.id, id)).toMatchObject({
      canManage: true,
      managementRole: "admin",
    });
    expect(await f.service.detail(owner, event.id)).toMatchObject({
      canManage: true,
      canEdit: true,
      role: "admin",
    });
  });
  it("allows delegated provisional results/finalization but preserves frozen rosters and immutable outcomes", async () => {
    const f = await resultFixture();
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED", role: "MODERATOR" });
    expect(await f.service.detail(guest, f.event.id)).toMatchObject({
      canManage: true,
      canFinalize: true,
    });
    const saved = await f.service.saveResult(guest, f.event.id, id, {
      version: 10,
      lowerWins: false,
      entries: [
        { userId: owner, score: "5" },
        { userId: guest, score: "3" },
      ],
      tieBreaks: [],
    });
    expect(saved.table).toMatchObject({ canManage: true, resultDraft: { lowerWins: false } });
    const done = await f.service.finalize(guest, f.event.id, { version: saved.event.version });
    expect(done.status).toBe("TERMINATED");
    expect(f.ratings.applyTableResult).toHaveBeenCalledOnce();
    await expect(
      f.service.saveResult(guest, f.event.id, id, {
        version: done.version,
        lowerWins: false,
        entries: [
          { userId: owner, score: "5" },
          { userId: guest, score: "3" },
        ],
        tieBreaks: [],
      }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_CONFIRMED" });
  });
  it("revokes even the historical Event author's powers after demotion and denies pending roster reads", async () => {
    const f = setup("PRIVATE");
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED", role: "MODERATOR" });
    const event = await f.service.create(guest, { ...body(), groupId: other });
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED", role: "MEMBER" });
    expect(await f.service.detail(guest, event.id)).toMatchObject({
      canManage: false,
      canEdit: false,
      canInvite: false,
      canConfirm: false,
      role: "member",
    });
    expect(await f.service.tableDetail(guest, event.id, id)).toMatchObject({
      canManage: false,
      managementRole: null,
      canInvite: false,
    });
    await expect(
      f.service.remove(guest, event.id, { version: event.version }),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    await expect(f.service.seats(guest, event.id, id, { limit: 20 }, true)).rejects.toMatchObject({
      code: "EVENT_ADMIN_REQUIRED",
    });
    await f.service.remove(owner, event.id, { version: event.version });
    expect(f.events.size).toBe(0);
  });
});

describe("private participant proposals", () => {
  const date = (day = "2027-01-05") => ({ kind: "date" as const, day, startTime: "16:00" });
  async function prepared() {
    const f = setup("PRIVATE"),
      e = await f.create();
    await f.service.update(owner, e.id, {
      name: e.name,
      timeZone: e.timeZone,
      startTime: e.startTime,
      dates: e.dates,
      locations: e.locations,
      version: e.version,
      allowParticipantDates: true,
      allowParticipantLocations: true,
      tables: [{ ...body().tables[0], allowParticipantGames: true }],
      removedTableIds: [],
    });
    return {
      ...f,
      e,
      version: () => f.events.get(e.id)!.version,
      submit: (
        userId: string,
        payload: import("@board-game-organizer/schemas").EventProposalPayload,
        clientRequestId = randomUUID(),
      ) =>
        f.service.submitProposal(userId, e.id, {
          eventVersion: f.events.get(e.id)!.version,
          clientRequestId,
          payload,
        }),
    };
  }
  it.each(["accept", "reject"] as const)(
    "groups duplicate game suggestions and atomically %s every pending author with private batch readback",
    async (action) => {
      const f = await prepared();
      await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
      await f.service.join(waiter, f.e.id, id, f.participation(f.e.id, id));
      const first = await f.submit(guest, { kind: "game", tableId: id, gameId: 2 });
      const stale = (
        await f.service.proposals(owner, f.e.id, {
          kind: "game",
          tableId: id,
          mode: "review",
          limit: 1,
        })
      ).items[0];
      const second = await f.submit(waiter, { kind: "game", tableId: id, gameId: 2 });
      await expect(
        f.service.reviewProposal(owner, f.e.id, first.id, {
          action,
          version: 1,
          eventVersion: f.version(),
          groupRevision: stale.groupRevision,
        }),
      ).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
      await expect(
        f.service.reviewProposal(owner, f.e.id, first.id, {
          action,
          version: 1,
          eventVersion: f.version(),
        }),
      ).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
      const page = await f.service.proposals(owner, f.e.id, {
        kind: "game",
        tableId: id,
        mode: "review",
        limit: 1,
      });
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0].gameSuggestions?.map((p) => p.userId).sort()).toEqual(
        [waiter, guest].sort(),
      );
      const input = {
        action,
        version: 1,
        eventVersion: f.version(),
        groupRevision: page.items[0].groupRevision,
      };
      const receipt = await f.service.reviewProposal(owner, f.e.id, first.id, input);
      expect(receipt.proposals).toHaveLength(2);
      for (const row of [first, second])
        expect(f.proposals.get(row.id)).toMatchObject({
          status: action === "accept" ? "ACCEPTED" : "REJECTED",
          version: 2,
          reviewBatchId: receipt.proposal.reviewBatchId,
        });
      expect(f.tables.get(id)?.games.filter((g) => g.gameId === 2)).toHaveLength(
        action === "accept" ? 1 : 0,
      );
      expect((await f.service.reviewProposal(owner, f.e.id, first.id, input)).proposals).toEqual(
        receipt.proposals,
      );
      expect((await f.service.proposalDetail(guest, f.e.id, first.id)).proposals).toBeUndefined();
      expect((await f.service.proposalDetail(owner, f.e.id, first.id)).proposals).toHaveLength(2);
      expect(await f.service.proposalPickerExclusions(guest, f.e.id, id)).toContain(2);
      if (action === "reject")
        await expect(
          f.submit(guest, { kind: "game", tableId: id, gameId: 2 }),
        ).rejects.toMatchObject({ code: "PROPOSAL_ALREADY_PENDING" });
    },
  );
  it("does not accept a grouped game if any captured proposer no longer has an actual seat", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    await f.service.join(waiter, f.e.id, id, f.participation(f.e.id, id));
    const one = await f.submit(guest, { kind: "game", tableId: id, gameId: 2 });
    await f.submit(waiter, { kind: "game", tableId: id, gameId: 2 });
    const row = (
      await f.service.proposals(owner, f.e.id, {
        mode: "review",
        kind: "game",
        tableId: id,
        limit: 5,
      })
    ).items[0];
    for (const [key, registration] of f.registrations)
      if (registration.userId === guest) f.registrations.delete(key);
    await expect(
      f.service.reviewProposal(owner, f.e.id, one.id, {
        action: "accept",
        version: 1,
        eventVersion: f.version(),
        groupRevision: row.groupRevision,
      }),
    ).rejects.toMatchObject({ code: "PROPOSAL_SEAT_REQUIRED" });
    expect([...f.proposals.values()].every((p) => p.status === "PENDING")).toBe(true);
    expect(f.tables.get(id)?.games.some((g) => g.gameId === 2)).toBe(false);
  });
  it("defaults flags off and gives no proposal authority to management, pending reservations or accepted queues", async () => {
    const defaults = setup("PRIVATE"),
      e = await defaults.create();
    expect(e).toMatchObject({
      allowParticipantDates: false,
      allowParticipantLocations: false,
      canProposeDates: false,
    });
    await expect(
      defaults.service.submitProposal(guest, e.id, {
        eventVersion: e.version,
        clientRequestId: randomUUID(),
        payload: date(),
      }),
    ).rejects.toMatchObject({ code: "PROPOSALS_DISABLED" });
    const f = await prepared();
    await expect(f.submit(owner, date())).rejects.toMatchObject({
      code: "PROPOSAL_MANAGER_CANNOT_SUBMIT",
    });
    const invitation = await f.service.register(owner, f.e.id, id, waiter);
    await expect(f.submit(waiter, date())).rejects.toMatchObject({
      code: "PROPOSAL_SEAT_REQUIRED",
    });
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    await f.service.join(owner, f.e.id, id, f.participation(f.e.id, id));
    await expect(f.submit(owner, date())).rejects.toMatchObject({
      code: "PROPOSAL_MANAGER_CANNOT_SUBMIT",
    });
    expect((await f.service.detail(guest, f.e.id)).canProposeDates).toBe(true);
    expect((await f.service.detail(owner, f.e.id)).canProposeDates).toBe(false);
    expect((await f.service.tableDetail(guest, f.e.id, id)).canProposeGames).toBe(true);
    expect((await f.service.tableDetail(waiter, f.e.id, id)).canProposeGames).toBe(false);
    expect(f.registrations.get(invitation.id)?.status).toBe("PENDING");
  });
  it("allows multiple own pending proposals, deduplicates only own pending payloads and hides private hashes/other authors", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    await f.service.join(waiter, f.e.id, id, f.participation(f.e.id, id));
    const first = await f.submit(guest, date());
    await f.submit(guest, date("2027-01-06"));
    await expect(f.submit(guest, date())).rejects.toMatchObject({
      code: "PROPOSAL_ALREADY_PENDING",
    });
    await f.submit(waiter, date()); // Hidden other-author duplicate does not leak existence.
    expect(f.proposals.size).toBe(3);
    const own = await f.service.proposals(guest, f.e.id, { mode: "mine", kind: "date", limit: 1 });
    expect(own.items).toHaveLength(1);
    expect(own.items[0].userId).toBe(guest);
    expect(own.nextCursor).toBeTruthy();
    const later = await f.service.proposals(guest, f.e.id, {
      mode: "mine",
      kind: "date",
      limit: 1,
      cursor: own.nextCursor!,
    });
    expect(later.items).toHaveLength(1);
    expect(later.nextCursor).toBeNull();
    expect(later.items[0].id).not.toBe(own.items[0].id);
    const reviewed = await f.service.proposals(owner, f.e.id, {
      mode: "review",
      kind: "date",
      limit: 20,
    });
    expect(reviewed.items).toHaveLength(3);
    expect(JSON.stringify(reviewed)).not.toMatch(/requestHash|payloadKey|email|gameVotes/);
    await expect(
      f.service.proposals(guest, f.e.id, { mode: "review", kind: "date", limit: 20 }),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    expect(
      (
        await f.service.proposals(guest, f.e.id, {
          mode: "mine",
          kind: "date",
          limit: 20,
          clientRequestId: first.clientRequestId,
        })
      ).items.map((p) => p.id),
    ).toEqual([first.id]);
  });
  it("reads one proposal receipt only for its authorized author or current manager", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    const row = await f.submit(guest, date());
    expect((await f.service.proposalDetail(guest, f.e.id, row.id)).proposal).toEqual(row);
    expect((await f.service.proposalDetail(owner, f.e.id, row.id)).proposal).toEqual(row);
    await expect(f.service.proposalDetail(waiter, f.e.id, row.id)).rejects.toMatchObject({
      code: "PROPOSAL_NOT_FOUND",
    });
    await expect(f.service.proposalDetail(guest, f.e.id, randomUUID())).rejects.toMatchObject({
      code: "PROPOSAL_NOT_FOUND",
    });
    f.proposals.set(row.id, { ...f.proposals.get(row.id)!, eventId: other });
    await expect(f.service.proposalDetail(guest, f.e.id, row.id)).rejects.toMatchObject({
      code: "PROPOSAL_NOT_FOUND",
    });
    const publicFixture = setup("PUBLIC"),
      e = await publicFixture.create();
    await expect(publicFixture.service.proposalDetail(owner, e.id, row.id)).rejects.toMatchObject({
      code: "PROPOSALS_PRIVATE_GROUP_ONLY",
    });
  });
  it("correlates exact submissions without repeat notices and rejects request reuse or stale Event versions", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    const correlation = randomUUID(),
      version = f.version(),
      payload = date();
    const first = await f.submit(guest, payload, correlation),
      noticeCount = f.notifications.notifyMany.mock.calls.length;
    expect(
      await f.service.submitProposal(guest, f.e.id, {
        clientRequestId: correlation,
        eventVersion: version,
        payload,
      }),
    ).toEqual(first);
    expect(f.notifications.notifyMany).toHaveBeenCalledTimes(noticeCount);
    await expect(f.submit(guest, date("2027-01-06"), correlation)).rejects.toMatchObject({
      code: "PROPOSAL_REQUEST_REUSED",
    });
    await expect(
      f.service.submitProposal(guest, f.e.id, {
        clientRequestId: randomUUID(),
        eventVersion: version - 1,
        payload: date("2027-01-06"),
      }),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    expect(f.proposals.size).toBe(1);
  });
  it("approves via canonical edit, preserves registrations and ballots and replays only same decision receipt", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    const row = await f.submit(guest, date()),
      version = f.version(),
      registrations = clone([...f.registrations.values()]),
      votes = clone([...f.votes.values()]);
    const reviewed = await f.service.reviewProposal(owner, f.e.id, row.id, {
      eventVersion: version,
      version: 1,
      action: "accept",
    });
    expect(reviewed.proposal).toMatchObject({ status: "ACCEPTED", version: 2 });
    expect(reviewed.event.version).toBe(version + 1);
    expect(reviewed.event.dates).toHaveLength(2);
    expect(reviewed.event.dates[0].id).toBe(id);
    expect(reviewed.event.dates[1].id).toBe(reviewed.proposal.canonicalOptionId);
    expect([...f.registrations.values()]).toEqual(registrations);
    expect([...f.votes.values()]).toEqual(votes);
    expect(
      votes.every((v) => !Object.keys(v.dateVotes).length && !Object.keys(v.locationVotes).length),
    ).toBe(true);
    const notices = f.notifications.notifyMany.mock.calls.length;
    expect(
      (
        await f.service.reviewProposal(owner, f.e.id, row.id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        })
      ).proposal,
    ).toEqual(reviewed.proposal);
    expect(f.notifications.notifyMany).toHaveBeenCalledTimes(notices);
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: version,
        version: 1,
        action: "reject",
      }),
    ).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
    await expect(f.submit(guest, date())).rejects.toMatchObject({ code: "PROPOSAL_OPTION_EXISTS" });
  });
  it("rejects privately, permits later explicit submission and reviews existing pending after category disabled", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    const row = await f.submit(guest, date()),
      before = clone(f.events.get(f.e.id));
    const rejected = await f.service.reviewProposal(owner, f.e.id, row.id, {
      eventVersion: f.version(),
      version: 1,
      action: "reject",
    });
    expect(rejected.proposal.status).toBe("REJECTED");
    expect(f.events.get(f.e.id)).toEqual(before);
    expect(
      (
        await f.service.reviewProposal(owner, f.e.id, row.id, {
          eventVersion: f.version(),
          version: 1,
          action: "reject",
        })
      ).proposal,
    ).toEqual(rejected.proposal);
    const pending = await f.submit(guest, date()),
      e = f.events.get(f.e.id)!;
    await f.service.update(owner, e.id, {
      name: e.name,
      timeZone: e.timeZone,
      startTime: e.startTime,
      dates: e.dates,
      locations: e.locations,
      version: e.version,
      allowParticipantDates: false,
      tables: [],
      removedTableIds: [],
    });
    await expect(f.submit(guest, date("2027-01-06"))).rejects.toMatchObject({
      code: "PROPOSALS_DISABLED",
    });
    expect(
      (
        await f.service.reviewProposal(owner, e.id, pending.id, {
          eventVersion: f.version(),
          version: 1,
          action: "accept",
        })
      ).proposal.status,
    ).toBe("ACCEPTED");
  });
  it("never turns pending into a confirmation blocker or automatically rejects outside planning", async () => {
    const f = await prepared();
    for (const user of [guest, owner])
      await f.service.join(user, f.e.id, id, f.participation(f.e.id, id));
    const row = await f.submit(guest, date());
    await f.confirm(f.e.id);
    for (const action of ["accept", "reject"] as const)
      await expect(
        f.service.reviewProposal(owner, f.e.id, row.id, {
          eventVersion: f.version(),
          version: 1,
          action,
        }),
      ).rejects.toMatchObject({ code: "EVENT_NOT_PLANNING" });
    expect(
      (await f.service.proposals(guest, f.e.id, { kind: "date", mode: "mine", limit: 20 })).items[0]
        .status,
    ).toBe("PENDING");
    expect(f.proposals.get(row.id)?.status).toBe("PENDING");
  });
  it("rechecks current manager, proposer membership and effective seat before approval; rejection remains possible", async () => {
    const f = await prepared();
    const registration = await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id)),
      row = await f.submit(guest, date());
    await expect(
      f.service.reviewProposal(guest, f.e.id, row.id, {
        eventVersion: f.version(),
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    f.groups.membership.mockImplementation(async (_id, who) =>
      who === guest ? null : { status: "ACCEPTED" },
    );
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: f.version(),
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_REQUIRED" });
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED" });
    await f.service.registrationAction(guest, registration.id, {
      action: "cancel",
      version: registration.version,
    });
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: f.version(),
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "PROPOSAL_SEAT_REQUIRED" });
    expect(
      (await f.service.proposals(guest, f.e.id, { kind: "date", mode: "mine", limit: 20 })).items[0]
        .status,
    ).toBe("PENDING");
    expect(
      (
        await f.service.reviewProposal(owner, f.e.id, row.id, {
          eventVersion: f.version(),
          version: 1,
          action: "reject",
        })
      ).proposal.status,
    ).toBe("REJECTED");
  });
  it("restricts games to own seated Table and preserves existing durations on canonical approval", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    const e = f.events.get(f.e.id)!;
    await f.service.update(owner, e.id, {
      name: e.name,
      timeZone: e.timeZone,
      startTime: e.startTime,
      dates: e.dates,
      locations: e.locations,
      version: e.version,
      tables: [{ ...body().tables[0], id: other, allowParticipantGames: true }],
      removedTableIds: [],
    });
    await expect(
      f.submit(guest, { kind: "game", tableId: other, gameId: 2 }),
    ).rejects.toMatchObject({ code: "PROPOSAL_SEAT_REQUIRED" });
    const old = clone(f.tables.get(id)!.games),
      row = await f.submit(guest, { kind: "game", tableId: id, gameId: 2 });
    const receipt = await f.service.reviewProposal(owner, e.id, row.id, {
      eventVersion: f.version(),
      version: 1,
      action: "accept",
    });
    expect(receipt.proposal.canonicalOptionId).toBe("2");
    expect(f.tables.get(id)?.games).toEqual([
      ...old,
      { gameId: 2, durationMinutes: 60, durationSource: "BGG" },
    ]);
    expect(f.registrations.values().next().value?.gameVotes).toEqual({});
    expect(
      (
        await f.service.proposals(guest, e.id, {
          kind: "game",
          tableId: id,
          mode: "mine",
          limit: 20,
        })
      ).items[0].id,
    ).toBe(row.id);
    await expect(
      f.service.proposals(owner, e.id, {
        kind: "game",
        tableId: randomUUID(),
        mode: "review",
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    await expect(
      f.submit(guest, { kind: "game", tableId: randomUUID(), gameId: 2 }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
  });
  it("revalidates current playable catalog on submission and approval without consuming the pending request", async () => {
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    const payload = { kind: "game" as const, tableId: id, gameId: 2 };
    const catalog = f.games.findByIds.getMockImplementation()!;
    let state: "missing" | "expansion" | "ready" = "missing";
    f.games.findByIds.mockImplementation(async (ids) =>
      ids.includes(2) && state !== "ready"
        ? state === "missing"
          ? []
          : [{ id: 2, name: "Expansion", maxPlayMinutes: 60, isExpansion: true }]
        : catalog(ids),
    );
    await expect(f.submit(guest, payload)).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
    state = "expansion";
    await expect(f.submit(guest, payload)).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
    state = "ready";
    const row = await f.submit(guest, payload),
      version = f.version();
    state = "missing";
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: version,
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
    state = "expansion";
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: version,
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
    expect(f.proposals.get(row.id)?.status).toBe("PENDING");
    expect(f.version()).toBe(version);
    state = "ready";
    expect(
      (
        await f.service.reviewProposal(owner, f.e.id, row.id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        })
      ).proposal.status,
    ).toBe("ACCEPTED");
  });
  it("keeps source authority, stale decisions, canonical duplicates and removed targets guarded", async () => {
    for (const type of [null, "PUBLIC"] as const) {
      const f = setup(type),
        e = await f.create();
      await expect(
        f.service.proposals(owner, e.id, { kind: "date", mode: "mine", limit: 20 }),
      ).rejects.toMatchObject({ code: "PROPOSALS_PRIVATE_GROUP_ONLY" });
      await expect(
        f.service.submitProposal(owner, e.id, {
          eventVersion: e.version,
          clientRequestId: randomUUID(),
          payload: date(),
        }),
      ).rejects.toMatchObject({ code: "PROPOSALS_PRIVATE_GROUP_ONLY" });
      await expect(
        f.service.reviewProposal(owner, e.id, id, {
          eventVersion: e.version,
          version: 1,
          action: "accept",
        }),
      ).rejects.toMatchObject({ code: "PROPOSALS_PRIVATE_GROUP_ONLY" });
    }
    const f = await prepared();
    await f.service.join(guest, f.e.id, id, f.participation(f.e.id, id));
    const row = await f.submit(guest, { kind: "game", tableId: id, gameId: 2 });
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: f.version() - 1,
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: f.version(),
        version: 2,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });
    await expect(
      f.service.reviewProposal(owner, f.e.id, randomUUID(), {
        eventVersion: f.version(),
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND" });
    f.tables.set(id, { ...f.tables.get(id)!, removedAt: "2027-01-01T00:00:00Z" });
    await expect(
      f.service.reviewProposal(owner, f.e.id, row.id, {
        eventVersion: f.version(),
        version: 1,
        action: "accept",
      }),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    expect(f.proposals.get(row.id)?.status).toBe("PENDING");
  });
});

describe("independent Event access, enrollment and verified game capacity", () => {
  const visibilityEdit = (event: PlannedEventResponse, visibility: "PRIVATE" | "PUBLIC") => ({
    version: event.version,
    name: event.name,
    visibility,
    timeZone: event.timeZone,
    startTime: event.startTime,
    dates: event.dates,
    locations: event.locations,
    endsAt: event.endsAt,
    bookingClosesAt: event.bookingClosesAt,
    tables: [],
    removedTableIds: [],
  });
  it("keeps a PRIVATE Event in a PUBLIC Group member-only without changing fixed scheduling or public deadlines", async () => {
    const f = setup("PUBLIC"),
      e = await f.create();
    const saved = await f.service.update(owner, e.id, visibilityEdit(e, "PRIVATE"));
    expect(saved).toMatchObject({
      visibility: "PRIVATE",
      groupType: "PUBLIC",
      endsAt: e.endsAt,
      bookingClosesAt: e.bookingClosesAt,
    });
    f.groups.membership.mockResolvedValue(null);
    await expect(f.service.detail(guest, e.id)).rejects.toMatchObject({
      code: "GROUP_MEMBER_REQUIRED",
    });
    await expect(f.service.join(guest, e.id, id, f.participation(e.id, id))).rejects.toMatchObject({
      code: "GROUP_MEMBER_REQUIRED",
    });
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED" });
    expect((await f.service.detail(guest, e.id)).canRegister).toBe(true);
    await expect(
      f.service.join(guest, e.id, id, {
        ...f.participation(e.id, id),
        availability: { version: saved.version, dateVotes: {}, locationVotes: {} },
      }),
    ).rejects.toMatchObject({ code: "EVENT_AVAILABILITY_NOT_REQUIRED" });
    await expect(
      f.service.update(owner, e.id, {
        ...visibilityEdit(saved, "PRIVATE"),
        dates: [...saved.dates, { id: other, day: "2027-01-04" }],
      }),
    ).rejects.toMatchObject({ code: "EVENT_FIXED_SCHEDULE_REQUIRED" });
  });
  it.each([null, "PRIVATE"] as const)(
    "does not widen standalone/PRIVATE Group access through a forged PUBLIC visibility: %s",
    async (type) => {
      const f = setup(type);
      await expect(
        f.service.create(owner, { ...body(), groupId: type ? other : null, visibility: "PUBLIC" }),
      ).rejects.toMatchObject({ code: "EVENT_VISIBILITY_NOT_ALLOWED" });
      expect(f.events.size).toBe(0);
    },
  );
  it("autoaccepts all voluntary public enrollments including queue, never creates Group membership, and confirms eligible outsiders", async () => {
    const f = setup("PUBLIC"),
      e = await f.create();
    f.groups.membership.mockResolvedValue(null);
    for (const user of [guest, waiter, "queue-only"])
      expect(await f.service.join(user, e.id, id, f.participation(e.id, id))).toMatchObject({
        kind: "SELF",
        status: "ACCEPTED",
        userId: user,
      });
    expect(await f.service.tableDetail("queue-only", e.id, id)).toMatchObject({
      myPosition: "WAITING",
      readOnly: false,
      canManage: false,
    });
    expect((await f.service.collectionPickerScope(owner, e.id, id)).userIds).toEqual(
      [guest, waiter, "queue-only"].sort(),
    );
    await expect(f.service.collectionPickerScope(guest, e.id, id)).rejects.toMatchObject({
      code: "EVENT_ADMIN_REQUIRED",
    });
    await f.confirm(e.id);
    expect(f.tables.get(id)?.confirmed?.playerIds).toEqual([guest, waiter]);
    expect(f.tables.get(id)?.confirmed?.playerIds).not.toContain("queue-only");
    expect(await f.groups.membership(other, guest)).toBeNull();
  });
  it("does not silently orphan/remove nonmember enrollments on a public->private edit", async () => {
    const f = setup("PUBLIC"),
      e = await f.create();
    f.groups.membership.mockResolvedValue(null);
    const registration = await f.service.join(guest, e.id, id, f.participation(e.id, id));
    const current = await f.service.detail(owner, e.id);
    await expect(
      f.service.update(owner, e.id, visibilityEdit(current, "PRIVATE")),
    ).rejects.toMatchObject({ code: "EVENT_VISIBILITY_HAS_NONMEMBERS" });
    expect(f.events.get(e.id)?.visibility).toBe("PUBLIC");
    expect(f.registrations.get(registration.id)?.status).toBe("ACCEPTED");
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED" });
    expect(
      (await f.service.update(owner, e.id, visibilityEdit(current, "PRIVATE"))).visibility,
    ).toBe("PRIVATE");
  });
  it("preserves accepted public participation after Group departure while retaining private membership cleanup", async () => {
    for (const type of ["PUBLIC", "PRIVATE"] as const) {
      const f = setup(type),
        e = await f.create();
      const row = await f.service.join(guest, e.id, id, f.participation(e.id, id));
      f.groups.membership.mockResolvedValue(null);
      await f.service.membershipDeparted(other, guest, "LEFT");
      expect(f.registrations.get(row.id)?.status).toBe(
        type === "PUBLIC" ? "ACCEPTED" : "CANCELLED",
      );
      if (type === "PUBLIC") expect((await f.service.detail(guest, e.id)).role).toBe("participant");
    }
  });
  it("keeps foreign roster/result emails redacted for public nonmembers even after accepted enrollment", async () => {
    const f = setup("PUBLIC"),
      e = await f.create();
    f.groups.membership.mockResolvedValue(null);
    f.users.findByIds.mockImplementation(async (ids) =>
      ids.map((userId) => ({
        clerkId: userId,
        name: userId,
        username: userId,
        email: `${userId}@private.test`,
      })),
    );
    for (const user of [guest, waiter])
      await f.service.join(user, e.id, id, f.participation(e.id, id));
    expect(
      (await f.service.seats(guest, e.id, id, { limit: 20 })).items.every(
        (row) => row.email === null,
      ),
    ).toBe(true);
    await f.confirm(e.id);
    const stored = f.tables.get(id)!;
    f.tables.set(id, {
      ...stored,
      results: {
        lowerWins: false,
        entries: [
          { userId: guest, score: "2", rank: 1 },
          { userId: waiter, score: "1", rank: 2 },
        ],
        tieBreaks: [],
        finalizedAt: e.updatedAt,
      },
    });
    expect(
      (await f.service.tableDetail(guest, e.id, id)).resultProfiles?.every(
        (profile) => profile.email === null,
      ),
    ).toBe(true);
  });
  it("denies seated current creators/moderators proposal submission, but does not confuse a demoted historical author with a manager", async () => {
    const f = setup("PRIVATE"),
      input = body();
    const e = await f.service.create(owner, {
      ...input,
      groupId: other,
      allowParticipantDates: true,
      allowParticipantLocations: true,
      tables: [{ ...input.tables[0], allowParticipantGames: true }],
    });
    for (const user of [owner, guest])
      await f.service.join(user, e.id, id, f.participation(e.id, id));
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED", role: "MODERATOR" } as never);
    for (const actor of [owner, guest]) {
      expect(await f.service.detail(actor, e.id)).toMatchObject({
        canProposeDates: false,
        canProposeLocations: false,
      });
      expect((await f.service.tableDetail(actor, e.id, id)).canProposeGames).toBe(false);
      for (const payload of [
        { kind: "date", day: "2027-01-05", startTime: "20:00" },
        { kind: "location", location: { ...input.locations[0], id: randomUUID() } },
        { kind: "game", tableId: id, gameId: 2 },
      ] as const)
        await expect(
          f.service.submitProposal(actor, e.id, {
            eventVersion: f.events.get(e.id)!.version,
            clientRequestId: randomUUID(),
            payload,
          }),
        ).rejects.toMatchObject({ code: "PROPOSAL_MANAGER_CANNOT_SUBMIT" });
      await expect(f.service.proposalPickerExclusions(actor, e.id, id)).rejects.toMatchObject({
        code: "PROPOSAL_MANAGER_CANNOT_SUBMIT",
      });
    }
    expect(f.proposals.size).toBe(0);
    f.groups.membership.mockResolvedValue({ status: "ACCEPTED" });
    f.events.set(e.id, { ...f.events.get(e.id)!, adminUserId: guest });
    expect(
      await f.service.submitProposal(guest, e.id, {
        eventVersion: f.events.get(e.id)!.version,
        clientRequestId: randomUUID(),
        payload: { kind: "date", day: "2027-01-05", startTime: "20:00" },
      }),
    ).toMatchObject({ status: "PENDING", userId: guest });
  });
  it("validates the known 2–6 envelope on writes and ignores individual unknown pairs rather than inventing bounds", async () => {
    const f = setup("PRIVATE");
    f.games.findByIds.mockImplementation(async (ids) =>
      ids.map((id) => ({
        id,
        name: `Game ${id}`,
        maxPlayMinutes: 60,
        minPlayers: id === 1 ? 2 : 3,
        maxPlayers: id === 1 ? 4 : 6,
      })),
    );
    const input = {
      ...body(),
      groupId: other,
      tables: [{ ...body().tables[0], maxPlayers: 6, games: [{ gameId: 1 }, { gameId: 2 }] }],
    };
    const e = await f.service.create(owner, input);
    expect((await f.service.tableDetail(owner, e.id, id)).maxPlayers).toBe(6);
    await expect(
      f.service.update(owner, e.id, {
        ...visibilityEdit(e, "PRIVATE"),
        tables: [{ ...input.tables[0], maxPlayers: 7 }],
      }),
    ).rejects.toMatchObject({ code: "TABLE_GAME_PLAYER_LIMITS" });
    f.games.findByIds.mockImplementation(async (ids) =>
      ids.map((id) => ({
        id,
        name: `Game ${id}`,
        maxPlayMinutes: 60,
        ...(id === 1 ? { minPlayers: 2, maxPlayers: 4 } : {}),
      })),
    );
    await expect(
      f.service.update(owner, e.id, { ...visibilityEdit(e, "PRIVATE"), tables: input.tables }),
    ).rejects.toMatchObject({ code: "TABLE_GAME_PLAYER_LIMITS" });
    f.games.findByIds.mockImplementation(async (ids) =>
      ids.map((id) => ({ id, name: `Game ${id}`, maxPlayMinutes: 60 })),
    );
    expect(
      (
        await f.service.update(owner, e.id, {
          ...visibilityEdit(e, "PRIVATE"),
          tables: input.tables,
        })
      ).id,
    ).toBe(e.id);
  });
  it("does not confirm too few players for the actual selected game or discard excess seated players to fit a game", async () => {
    const f = setup("PRIVATE");
    f.games.findByIds.mockImplementation(async (ids) =>
      ids.map((id) => ({
        id,
        name: `Game ${id}`,
        maxPlayMinutes: 60,
        minPlayers: id === 1 ? 2 : 3,
        maxPlayers: id === 1 ? 4 : 6,
      })),
    );
    const e = await f.service.create(owner, {
      ...body(),
      groupId: other,
      tables: [{ ...body().tables[0], maxPlayers: 6, games: [{ gameId: 1 }, { gameId: 2 }] }],
    });
    for (const user of [guest, waiter])
      await f.service.join(user, e.id, id, {
        ...f.participation(e.id, id),
        gameVotes: { "1": "NO", "2": "YES" },
      });
    await expect(f.confirm(e.id)).rejects.toMatchObject({ code: "EVENT_NO_AGREEMENT" });
    await f.service.join("third", e.id, id, {
      ...f.participation(e.id, id),
      gameVotes: { "1": "NO", "2": "YES" },
    });
    await f.confirm(e.id);
    expect(f.tables.get(id)?.confirmed).toMatchObject({
      gameId: 2,
      playerIds: [guest, waiter, "third"],
    });
  });
});

describe("immutable private Event results audience", () => {
  async function finished(type: "PRIVATE" | "PUBLIC", share = false) {
    const f = setup(type),
      e = await f.create();
    f.events.set(e.id, {
      ...f.events.get(e.id)!,
      status: "CONFIRMED",
      visibility: "PRIVATE",
      version: 10,
      confirmed: { dateId: id, locationId: id, at: e.updatedAt },
    });
    f.tables.set(id, {
      ...f.tables.get(id)!,
      confirmed: { gameId: 1, playerIds: [guest, waiter], startsAt: "2027-01-03T09:00:00.000Z" },
      resultDraft: {
        lowerWins: false,
        entries: [
          { userId: guest, score: "3" },
          { userId: waiter, score: null },
        ],
        tieBreaks: [],
      },
    });
    f.tables.set(other, {
      ...f.tables.get(id)!,
      id: other,
      order: 1,
      confirmed: undefined,
      resultDraft: undefined,
    });
    const done = await f.service.finalize(owner, e.id, {
      version: 10,
      shareResultsWithFriends: share,
    });
    f.groups.membership.mockResolvedValue(null);
    f.relationships.isFriend.mockImplementation(async (_a, _b) => false);
    return { ...f, done };
  }
  it.each(["PRIVATE", "PUBLIC"] as const)(
    "defaults sharing off and never publishes private activities solely because the Group is public: %s",
    async (type) => {
      const f = await finished(type);
      expect(f.done.shareResultsWithFriends).toBe(false);
      f.relationships.isFriend.mockResolvedValue(true);
      await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 403 });
      await expect(f.service.activityResource(owner, f.done.id, id, true)).rejects.toMatchObject({
        status: 404,
      });
    },
  );
  it.each(["PRIVATE", "PUBLIC"] as const)(
    "grants current friends of frozen players (including ND), never admin-only/queue friends, only safe final read projections: %s",
    async (type) => {
      const f = await finished(type, true);
      for (const target of [owner, "queue-only", "pending-invite"]) {
        f.relationships.isFriend.mockImplementation(async (_a, b) => b === target);
        await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 403 });
      }
      f.relationships.isFriend.mockImplementation(async (_a, b) => b === waiter);
      const view = await f.service.detail("viewer", f.done.id);
      expect(view).toMatchObject({
        sharedResultsOnly: true,
        role: "viewer",
        readOnly: true,
        groupId: null,
        groupType: null,
        groupName: null,
        canManage: false,
        canRegister: false,
        tableCount: 1,
        participantCount: 2,
      });
      const detail = await f.service.tableDetail("viewer", f.done.id, id);
      expect(detail).toMatchObject({
        sharedResultsOnly: true,
        groupId: null,
        groupType: null,
        groupName: null,
        confirmed: { playerIds: [guest, waiter] },
      });
      expect(detail.results?.entries.find((row) => row.userId === waiter)?.score).toBeNull();
      expect(detail).not.toHaveProperty("groupRatingChanges");
      expect(detail).not.toHaveProperty("resultDraft");
      expect(
        (await f.service.tables("viewer", f.done.id, { limit: 1 })).items.map((row) => row.id),
      ).toEqual([id]);
      expect(await f.service.activityResource("viewer", f.done.id, id, true)).toMatchObject({
        sharedResultsOnly: true,
        href: `/events/${f.done.id}/tables/${id}`,
      });
      expect(
        await f.service.activityResource("viewer", f.done.id, undefined, true),
      ).not.toHaveProperty("groupId");
      await expect(f.service.tableDetail("viewer", f.done.id, other)).rejects.toMatchObject({
        status: 404,
      });
      await expect(f.service.seats("viewer", f.done.id, id, { limit: 20 })).rejects.toMatchObject({
        code: "EVENT_RESULTS_ONLY",
      });
      await expect(
        f.service.tableLeaderboard("viewer", f.done.id, id, { limit: 20 }),
      ).rejects.toMatchObject({ code: "EVENT_RESULTS_ONLY" });
      await expect(
        f.service.participants("viewer", f.done.id, { limit: 20 }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        f.service.join("viewer", f.done.id, id, f.participation(f.done.id, id)),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it("revalidates friendship, bilateral blocks, Group exclusions and resource existence on every read", async () => {
    const f = await finished("PRIVATE", true);
    f.relationships.isFriend.mockImplementation(async (_a, b) => b === waiter);
    expect((await f.service.detail("viewer", f.done.id)).sharedResultsOnly).toBe(true);
    f.relationships.isFriend.mockResolvedValue(false);
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 403 });
    f.relationships.isFriend.mockImplementation(async (_a, b) => b === waiter);
    f.relationships.isBlocked.mockImplementation(async (_a, b) => b === waiter);
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 403 });
    f.relationships.isBlocked.mockImplementation(async (_a, b) => b === owner);
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 404 });
    f.relationships.isBlocked.mockResolvedValue(false);
    f.groups.ban.mockResolvedValue({ until: null } as never);
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({
      code: "GROUP_BANNED",
    });
    f.groups.ban.mockResolvedValue(null);
    f.events.delete(f.done.id);
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 404 });
  });
  it("never grants early/provisional access and cannot change sharing once finalization commits", async () => {
    const f = await finished("PRIVATE", true);
    await expect(
      f.service.finalize(owner, f.done.id, {
        version: f.done.version,
        shareResultsWithFriends: false,
      }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_CONFIRMED" });
    const stored = f.events.get(f.done.id)!;
    f.events.set(f.done.id, { ...stored, status: "CONFIRMED" });
    f.relationships.isFriend.mockResolvedValue(true);
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 403 });
    f.events.set(f.done.id, { ...stored, confirmed: undefined });
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 403 });
    f.events.set(f.done.id, stored);
    f.tables.set(id, { ...f.tables.get(id)!, confirmed: undefined });
    await expect(f.service.detail("viewer", f.done.id)).rejects.toMatchObject({ status: 403 });
  });
  it("does not accept redundant public/standalone sharing flags", async () => {
    for (const type of [null, "PUBLIC"] as const) {
      const f = setup(type),
        e = await f.create();
      f.events.set(e.id, { ...f.events.get(e.id)!, status: "CONFIRMED" });
      await expect(
        f.service.finalize(owner, e.id, { version: e.version, shareResultsWithFriends: true }),
      ).rejects.toMatchObject({ code: "EVENT_RESULTS_SHARING_NOT_AVAILABLE" });
    }
  });
});
