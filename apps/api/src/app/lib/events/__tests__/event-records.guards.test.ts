import {
  type BoardGame,
  boardGameModel,
  changeEventVoteSchema,
  createPlannedEventSchema,
  decideTableRegistrationSchema,
  type EventRecord,
  eventRecordSchema,
  finalizeSavedEventSchema,
  type GroupMembership,
  type GroupRecord,
  groupMembershipSchema,
  groupRecordSchema,
  saveTableResultSchema,
  type TableRecord,
  type TableRegistration,
  tableRecordSchema,
  tableRegistrationSchema,
} from "@board-game-organizer/schemas";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventRecordsService } from "../event-records.service";

vi.mock("../../locations/community-location", () => ({
  verifyCommunityLocation: vi.fn(async (location) => location),
}));

const owner = "user_owner",
  guest = "user_guest",
  third = "user_third";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const id = uuid(1),
  groupId = uuid(2),
  tableId = uuid(3),
  dateId = uuid(4),
  registrationId = uuid(5);
const at = "2026-11-18T12:00:00.000Z";
const location = {
  id: uuid(6),
  name: "Verified game venue",
  address: "Fixture address",
  latitude: 45,
  longitude: 12,
  timeZone: "Europe/Rome",
};
function group(type: "PRIVATE" | "PUBLIC" = "PRIVATE"): GroupRecord {
  return groupRecordSchema.parse({
    id: groupId,
    adminUserId: owner,
    type,
    approved: {
      name: "Approved club",
      ...(type === "PUBLIC" ? { logoAssetId: uuid(7), location } : {}),
    },
    reservedNames: type === "PUBLIC" ? ["approved club"] : [],
    version: 1,
    createdAt: at,
    updatedAt: at,
  });
}
function event(publicEvent = false): EventRecord {
  return eventRecordSchema.parse({
    id,
    groupId: publicEvent ? groupId : null,
    visibility: publicEvent ? "PUBLIC" : "PRIVATE",
    adminUserId: owner,
    name: "Guarded event",
    timeZone: "Europe/Rome",
    startTime: "09:00",
    dates: [{ id: dateId, day: "2027-01-03" }],
    locations: [location],
    status: "PLANNING",
    version: 3,
    planningGeneration: 1,
    planningMode: "MANUAL",
    playerPreference: "MORE_PLAYERS",
    nextPriority: 0,
    nextTableOrder: 1,
    ...(publicEvent
      ? { bookingClosesAt: "2027-01-02T08:00:00.000Z", endsAt: "2027-01-03T18:00:00.000Z" }
      : {}),
    createdAt: at,
    updatedAt: at,
  });
}
function table(): TableRecord {
  return tableRecordSchema.parse({
    id: tableId,
    eventId: id,
    name: "Guarded table",
    order: 0,
    minPlayers: 2,
    maxPlayers: 4,
    games: [{ gameId: 1, durationMinutes: 60, durationSource: "BGG" }],
    rankingEnabled: false,
    allowParticipantGames: false,
    createdAt: at,
    updatedAt: at,
  });
}
function registration(
  userId = guest,
  status: TableRegistration["status"] = "ACCEPTED",
): TableRegistration {
  return tableRegistrationSchema.parse({
    id: registrationId,
    eventId: id,
    tableId,
    userId,
    status,
    kind: "INVITATION",
    priorityAt: at,
    sequence: 0,
    version: 2,
    gameVotes: { "1": "YES" },
    createdAt: at,
    updatedAt: at,
  });
}
function body(publicEvent = false) {
  const value = event(publicEvent);
  return createPlannedEventSchema.parse({
    groupId: value.groupId,
    visibility: value.visibility,
    name: value.name,
    timeZone: value.timeZone,
    startTime: value.startTime,
    dates: value.dates,
    locations: value.locations,
    ...(publicEvent ? { bookingClosesAt: value.bookingClosesAt, endsAt: value.endsAt } : {}),
    tables: [
      {
        id: tableId,
        name: "Guarded table",
        minPlayers: 2,
        maxPlayers: 4,
        games: [{ gameId: 1 }],
        rankingEnabled: false,
      },
    ],
  });
}
function setup(value = event(), approved: GroupRecord | null = null) {
  const events = {
    find: vi.fn(async (_id: string): Promise<EventRecord | null> => value),
    lock: vi.fn(async (_id: string): Promise<EventRecord | null> => value),
    userRegistrations: vi.fn(
      async (_id: string, userId: string): Promise<TableRegistration[]> =>
        userId === owner ? [] : [registration(userId)],
    ),
    table: vi.fn(async (_id: string): Promise<TableRecord | null> => table()),
    storedTable: vi.fn(async (_id: string): Promise<TableRecord | null> => null),
    allTables: vi.fn(async (_id: string): Promise<TableRecord[]> => [table()]),
    allRegistrations: vi.fn(async (_id: string): Promise<TableRegistration[]> => []),
    registration: vi.fn(async (_id: string): Promise<TableRegistration | null> => registration()),
    userRegistration: vi.fn(
      async (_table: string, _user: string): Promise<TableRegistration | null> => null,
    ),
    create: vi.fn(async (row: EventRecord) => row),
    save: vi.fn(async (row: EventRecord) => row),
    saveTable: vi.fn(async (row: TableRecord) => row),
    saveRegistration: vi.fn(async (row: TableRegistration) => row),
    saveVoter: vi.fn(),
    remove: vi.fn(),
  };
  const groups = {
    find: vi.fn(async (_id: string): Promise<GroupRecord | null> => approved),
    lock: vi.fn(async (_id: string): Promise<GroupRecord | null> => approved),
    ban: vi.fn(async (_id: string, _user: string) => null),
    membership: vi.fn(async (_id: string, _user: string): Promise<GroupMembership | null> => null),
  };
  const games = {
    findByIds: vi.fn(
      async (_ids: number[]): Promise<BoardGame[]> => [
        boardGameModel.parse({
          id: 1,
          name: "Known game",
          minPlayers: 2,
          maxPlayers: 6,
          maxPlayMinutes: 60,
        }),
      ],
    ),
  };
  const users = {
    findById: vi.fn(async (clerkId: string): Promise<{ clerkId: string } | null> => ({ clerkId })),
  };
  const relationships = {
    isFriend: vi.fn(async (_a: string, _b: string) => true),
    isBlocked: vi.fn(async (_a: string, _b: string) => false),
  };
  const notifications = { notifyMany: vi.fn(), acknowledgeItems: vi.fn(), retargetItems: vi.fn() };
  const ratings = { applyTableResult: vi.fn() };
  const service = new EventRecordsService(
    events as unknown as ConstructorParameters<typeof EventRecordsService>[0],
    groups as unknown as ConstructorParameters<typeof EventRecordsService>[1],
    games as unknown as ConstructorParameters<typeof EventRecordsService>[2],
    users as unknown as ConstructorParameters<typeof EventRecordsService>[3],
    relationships as unknown as ConstructorParameters<typeof EventRecordsService>[4],
    notifications as unknown as ConstructorParameters<typeof EventRecordsService>[5],
    ratings as unknown as ConstructorParameters<typeof EventRecordsService>[6],
  );
  const unchanged = () => {
    for (const write of [
      events.create,
      events.save,
      events.saveTable,
      events.saveRegistration,
      events.saveVoter,
      events.remove,
      notifications.notifyMany,
      notifications.acknowledgeItems,
      notifications.retargetItems,
      ratings.applyTableResult,
    ])
      expect(write).not.toHaveBeenCalled();
  };
  return {
    service,
    events,
    groups,
    games,
    users,
    relationships,
    notifications,
    ratings,
    unchanged,
  };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(at));
});
afterEach(() => vi.useRealTimers());

it.each(["missing-event", "lost-event-lock", "missing-approved-group"] as const)(
  "rejects unavailable resource authority before unified mutations: %s",
  async (reason) => {
    const current = reason === "missing-approved-group" ? { ...event(), groupId } : event();
    const f = setup(current);
    if (reason === "missing-event") f.events.find.mockResolvedValueOnce(null);
    if (reason === "lost-event-lock") f.events.lock.mockResolvedValueOnce(null);
    await expect(f.service.remove(owner, id, { version: 3 })).rejects.toMatchObject({
      status: 404,
      code: reason === "missing-approved-group" ? "GROUP_NOT_FOUND" : "EVENT_NOT_FOUND",
    });
    f.unchanged();
  },
);

it("does not treat a pending Public Group proposal as an approved parent for Event creation", async () => {
  const approved = group("PUBLIC");
  const pending = groupRecordSchema.parse({
    ...approved,
    approved: undefined,
    proposal: approved.approved,
    reviewStatus: "PENDING",
  });
  const f = setup(event(true), pending);
  await expect(f.service.create(owner, body(true))).rejects.toMatchObject({
    status: 404,
    code: "GROUP_NOT_FOUND",
  });
  f.unchanged();
});

it.each([
  "catalog-missing",
  "outside-player-bounds",
  "reused-table-id",
  "private-demonstrator",
  "private-guest-demonstrator",
  "public-game-proposals",
] as const)(
  "validates current table/catalog authority before any create writes: %s",
  async (reason) => {
    const isPublic = reason === "public-game-proposals";
    const f = setup(event(isPublic), isPublic ? group("PUBLIC") : null);
    const input = body(isPublic);
    if (reason === "catalog-missing") f.games.findByIds.mockResolvedValueOnce([]);
    if (reason === "outside-player-bounds") input.tables[0].maxPlayers = 7;
    if (reason === "reused-table-id")
      f.events.storedTable.mockResolvedValueOnce({ ...table(), eventId: uuid(90) });
    if (reason === "private-demonstrator") input.tables[0].demonstratorUserId = guest;
    if (reason === "private-guest-demonstrator") input.tables[0].demonstratorGuestName = "Arianna";
    if (reason === "public-game-proposals") input.tables[0].allowParticipantGames = true;
    const codes = {
      "catalog-missing": "GAME_NOT_FOUND",
      "outside-player-bounds": "TABLE_GAME_PLAYER_LIMITS",
      "reused-table-id": "TABLE_ID_REUSED",
      "private-demonstrator": "DEMONSTRATOR_REQUIRES_PUBLIC_GROUP",
      "private-guest-demonstrator": "DEMONSTRATOR_REQUIRES_PUBLIC_GROUP",
      "public-game-proposals": "PROPOSALS_PRIVATE_GROUP_ONLY",
    };
    await expect(
      f.service.create(owner, createPlannedEventSchema.parse(input)),
    ).rejects.toMatchObject({
      status: reason === "reused-table-id" ? 409 : 400,
      code: codes[reason],
    });
    f.unchanged();
  },
);

it.each([
  "standalone-public",
  "private-public-fields",
  "public-date-proposal",
  "public-two-dates",
  "public-missing-end",
  "public-missing-cutoff",
  "public-expired-cutoff",
] as const)(
  "rejects an incompatible but structurally valid declared schedule: %s",
  async (reason) => {
    const isPublic = reason.startsWith("public-");
    const f = setup(event(isPublic), isPublic ? group("PUBLIC") : null);
    const input = body(isPublic);
    if (reason === "standalone-public") input.visibility = "PUBLIC";
    if (reason === "private-public-fields") input.endsAt = "2027-01-03T18:00:00.000Z";
    if (reason === "public-date-proposal") input.allowParticipantDates = true;
    if (reason === "public-two-dates") input.dates.push({ id: uuid(8), day: "2027-01-04" });
    if (reason === "public-missing-end") delete input.endsAt;
    if (reason === "public-missing-cutoff") delete input.bookingClosesAt;
    if (reason === "public-expired-cutoff") input.bookingClosesAt = at;
    const codes = {
      "standalone-public": "EVENT_VISIBILITY_NOT_ALLOWED",
      "private-public-fields": "PUBLIC_EVENT_FIELDS_ONLY",
      "public-date-proposal": "PROPOSALS_PRIVATE_GROUP_ONLY",
      "public-two-dates": "EVENT_FIXED_SCHEDULE_REQUIRED",
      "public-missing-end": "PUBLIC_EVENT_FIXED_SCHEDULE_REQUIRED",
      "public-missing-cutoff": "PUBLIC_EVENT_FIXED_SCHEDULE_REQUIRED",
      "public-expired-cutoff": "EVENT_BOOKING_CLOSED",
    };
    await expect(
      f.service.create(owner, createPlannedEventSchema.parse(input)),
    ).rejects.toMatchObject({
      code: codes[reason],
      status: reason === "public-expired-cutoff" ? 409 : 400,
    });
    f.unchanged();
  },
);

it.each(["public", "missing", "foreign", "disabled"] as const)(
  "keeps proposal picker access constrained to its current table/category: %s",
  async (reason) => {
    const f = setup(event(reason === "public"), reason === "public" ? group("PUBLIC") : null);
    if (reason === "missing") f.events.table.mockResolvedValueOnce(null);
    if (reason === "foreign")
      f.events.table.mockResolvedValueOnce({ ...table(), eventId: uuid(90) });
    const actor = reason === "public" ? owner : guest;
    await expect(f.service.proposalPickerExclusions(actor, id, tableId)).rejects.toMatchObject({
      status: reason === "missing" || reason === "foreign" ? 404 : 403,
      code:
        reason === "public"
          ? "PROPOSALS_PRIVATE_GROUP_ONLY"
          : reason === "disabled"
            ? "PROPOSALS_DISABLED"
            : "TABLE_NOT_FOUND",
    });
    f.unchanged();
  },
);

it.each([null, { ...table(), eventId: uuid(90) }])(
  "rejects missing/foreign tables before disclosing collection-picker participants",
  async (target) => {
    const f = setup();
    f.events.table.mockResolvedValueOnce(target);
    await expect(f.service.collectionPickerScope(owner, id, tableId)).rejects.toMatchObject({
      status: 404,
      code: "TABLE_NOT_FOUND",
    });
    f.unchanged();
  },
);

it.each(["missing-table", "foreign-table", "self-invitation", "unknown-user"] as const)(
  "rejects invalid enrollment targets without consent or notification writes: %s",
  async (reason) => {
    const f = setup();
    if (reason === "missing-table") f.events.table.mockResolvedValueOnce(null);
    if (reason === "foreign-table")
      f.events.table.mockResolvedValueOnce({ ...table(), eventId: uuid(90) });
    if (reason === "unknown-user") f.users.findById.mockResolvedValueOnce(null);
    await expect(
      f.service.register(owner, id, tableId, reason === "self-invitation" ? owner : guest),
    ).rejects.toMatchObject({
      status: reason === "self-invitation" ? 400 : 404,
      code:
        reason === "self-invitation"
          ? "USE_SELF_REGISTRATION"
          : reason === "unknown-user"
            ? "USER_NOT_FOUND"
            : "TABLE_NOT_FOUND",
    });
    f.unchanged();
  },
);

it("does not enroll a Public participant when the game-consent input is omitted", async () => {
  const f = setup(event(true), group("PUBLIC"));
  await expect(f.service.join(owner, id, tableId)).rejects.toMatchObject({
    status: 400,
    code: "TABLE_GAME_AVAILABILITY_REQUIRED",
  });
  f.unchanged();
});

it.each([
  "missing-registration",
  "cancel-pending",
  "accept-missing-table",
  "accept-private-without-preferences",
] as const)("retains explicit registration consent requirements: %s", async (reason) => {
  const isGrouped = reason === "accept-private-without-preferences";
  const current = isGrouped ? { ...event(), groupId } : event();
  const f = setup(current, isGrouped ? group() : null);
  const pending = registration(guest, "PENDING");
  f.events.registration.mockResolvedValue(pending);
  f.events.userRegistrations.mockResolvedValue([pending]);
  if (isGrouped)
    f.groups.membership.mockResolvedValue(
      groupMembershipSchema.parse({
        id: uuid(9),
        groupId,
        userId: guest,
        kind: "INVITATION",
        status: "ACCEPTED",
        role: "MEMBER",
        version: 1,
        createdAt: at,
        updatedAt: at,
      }),
    );
  if (reason === "missing-registration") f.events.registration.mockResolvedValueOnce(null);
  if (reason === "accept-missing-table") f.events.table.mockResolvedValueOnce(null);
  const input = decideTableRegistrationSchema.parse(
    reason === "cancel-pending"
      ? { action: "cancel", version: 2 }
      : { action: "accept", version: 2, participation: { version: 3, gameVotes: { "1": "YES" } } },
  );
  const codes = {
    "missing-registration": "REGISTRATION_NOT_FOUND",
    "cancel-pending": "REGISTRATION_ACTION_FORBIDDEN",
    "accept-missing-table": "TABLE_NOT_FOUND",
    "accept-private-without-preferences": "EVENT_AVAILABILITY_REQUIRED",
  };
  await expect(f.service.registrationAction(guest, registrationId, input)).rejects.toMatchObject({
    status:
      reason === "missing-registration" || reason === "accept-missing-table"
        ? 404
        : reason === "cancel-pending"
          ? 403
          : 400,
    code: codes[reason],
  });
  f.unchanged();
});

it.each(["unknown-game", "fixed-game", "unknown-date"] as const)(
  "does not let a ballot target a missing or fixed option: %s",
  async (reason) => {
    const f = setup();
    const input =
      reason === "unknown-date"
        ? { kind: "date" as const, optionId: uuid(90), vote: "YES" as const }
        : {
            kind: "game" as const,
            tableId,
            gameId: reason === "unknown-game" ? 2 : 1,
            vote: "YES" as const,
          };
    await expect(
      f.service.vote(guest, id, changeEventVoteSchema.parse(input)),
    ).rejects.toMatchObject({
      status: reason === "fixed-game" ? 409 : 400,
      code: reason === "fixed-game" ? "FIXED_OPTION" : "INVALID_VOTE_OPTION",
    });
    f.unchanged();
  },
);

function resultsFixture(players = [owner, guest]) {
  const f = setup(
    eventRecordSchema.parse({
      ...event(),
      status: "CONFIRMED",
      confirmed: { dateId, locationId: location.id, at },
    }),
  );
  const included = tableRecordSchema.parse({
    ...table(),
    confirmed: { gameId: 1, playerIds: players, startsAt: "2027-01-03T08:00:00.000Z" },
  });
  f.events.table.mockResolvedValue(included);
  return f;
}
it.each(["duplicate-score", "missing-tied-player", "duplicate-player", "foreign-player"] as const)(
  "rejects a malformed explicit tiebreak without storing provisional or immutable results: %s",
  async (reason) => {
    const players = reason === "missing-tied-player" ? [owner, guest, third] : [owner, guest];
    const f = resultsFixture(players);
    const ordered =
      reason === "duplicate-player"
        ? [owner, owner]
        : reason === "foreign-player"
          ? [owner, third]
          : [owner, guest];
    const tie = { score: "5", orderedUserIds: ordered };
    const input = saveTableResultSchema.parse({
      version: 3,
      lowerWins: false,
      entries: players.map((userId) => ({ userId, score: "5" })),
      tieBreaks: reason === "duplicate-score" ? [tie, tie] : [tie],
    });
    await expect(f.service.saveResult(owner, id, tableId, input)).rejects.toMatchObject({
      status: 400,
      code: "INVALID_TIE_BREAK",
    });
    f.unchanged();
  },
);

it("validates a complete explicit tiebreak and propagates a parent-write failure after saving only the provisional draft", async () => {
  const f = resultsFixture();
  const input = saveTableResultSchema.parse({
    version: 3,
    lowerWins: false,
    entries: [owner, guest].map((userId) => ({ userId, score: "5" })),
    tieBreaks: [{ score: "5", orderedUserIds: [guest, owner] }],
  });
  const failure = new Error("Event write unavailable");
  f.events.save.mockRejectedValueOnce(failure);
  await expect(f.service.saveResult(owner, id, tableId, input)).rejects.toBe(failure);
  expect(f.events.saveTable).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      id: tableId,
      resultDraft: { lowerWins: false, entries: input.entries, tieBreaks: input.tieBreaks },
    }),
  );
  expect(f.events.saveTable.mock.calls[0][0]).not.toHaveProperty("results");
  expect(f.events.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ version: 4 }));
  expect(f.events.saveTable.mock.invocationCallOrder[0]).toBeLessThan(
    f.events.save.mock.invocationCallOrder[0],
  );
  expect(f.ratings.applyTableResult).not.toHaveBeenCalled();
  expect(f.notifications.notifyMany).not.toHaveBeenCalled();
});

it("rejects finalization against an outdated Event epoch before reading or applying saved results", async () => {
  const f = resultsFixture();
  await expect(
    f.service.finalize(owner, id, finalizeSavedEventSchema.parse({ version: 2 })),
  ).rejects.toMatchObject({
    status: 409,
    code: "EVENT_CHANGED",
  });
  expect(f.events.allTables).not.toHaveBeenCalled();
  f.unchanged();
});
