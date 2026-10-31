import { randomUUID } from "node:crypto";
import type { CreatePlannedEventInput, JoinTableInput } from "@board-game-organizer/schemas";
import {
  registerMatchResultsSchema,
  type SaveEventInput,
  saveEventSchema,
  updateEventSchema,
} from "@board-game-organizer/schemas";
import { normalizeMatchScore } from "@board-game-organizer/shared";
import { type ClientSession, type Db, MongoClient } from "mongodb";
import sharp from "sharp";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recordServices } from "../../src/app/lib/community/record-services";
import { RelationshipRepository } from "../../src/app/lib/contacts/relationship.repository";
import { COLLECTIONS } from "../../src/app/lib/db";
import { deadlineServiceConfigured } from "../../src/app/lib/events/event-deadlines";
import { EventRecordsRepository } from "../../src/app/lib/events/event-records.repository";
import { EventsRepository } from "../../src/app/lib/events/events.repository";
import { EventsService } from "../../src/app/lib/events/events.service";
import { BoardGamesRepository } from "../../src/app/lib/games/boardGames.repository";
import { GroupRecordsRepository } from "../../src/app/lib/groups/group-records.repository";
import { MatchService } from "../../src/app/lib/matches/match.service";
import { MatchInvitationsRepository } from "../../src/app/lib/matches/match-invitations.repository";
import { MatchesRepository } from "../../src/app/lib/matches/matches.repository";
import { migrate } from "../../src/app/lib/migrate";
import { NotificationsRepository } from "../../src/app/lib/notifications/notifications.repository";
import { OrganizationAssetsRepository } from "../../src/app/lib/organizations/organization-assets.repository";
import { OrganizationAssetsService } from "../../src/app/lib/organizations/organization-assets.service";
import { OrganizationsRepository } from "../../src/app/lib/organizations/organizations.repository";
import { OrganizationsService } from "../../src/app/lib/organizations/organizations.service";
import { RatingsRepository } from "../../src/app/lib/ratings/ratings.repository";
import { UsersRepository } from "../../src/app/lib/users/users.repository";

// External Clerk/MapTiler/provider boundaries have their own request/authentication tests.
// These tests exercise real repositories, locks, indexes, transactions and Sharp preparation.
vi.mock("../../src/app/lib/locations/community-location", () => ({
  verifyCommunityLocation: vi.fn(async (value: unknown) => value),
}));
vi.mock("../../src/app/lib/organizations/community-role", () => ({
  requireBgoModerator: vi.fn(async (userId: string) => {
    if (userId !== "moderator") throw new Error("Moderator required");
  }),
}));
let container: StartedTestContainer,
  client: MongoClient,
  db: Db,
  number = 0;
const OWNER = "owner",
  GUEST = "guest",
  OTHER = "other",
  DEMO = "demo",
  OUTSIDER = "outsider";
const location = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Game club",
  address: "Verified address 10",
  longitude: 12.5,
  latitude: 41.9,
};
function services(session?: ClientSession) {
  const organizations = new OrganizationsRepository(db, session),
    assets = new OrganizationAssetsRepository(db, session),
    users = new UsersRepository(db, session),
    relationships = new RelationshipRepository(db, session),
    notifications = new NotificationsRepository(db, session),
    events = new EventsRepository(db, session),
    games = new BoardGamesRepository(db, session);
  const eventService = new EventsService(
    events,
    organizations,
    assets,
    users,
    games,
    notifications,
  );
  const organizationService = new OrganizationsService(
    organizations,
    assets,
    users,
    relationships,
    notifications,
    (id, userId) => eventService.membershipDeparted(id, userId),
  );
  const assetService = new OrganizationAssetsService(assets, organizations, users);
  const matches = new MatchesRepository(db, session),
    invitations = new MatchInvitationsRepository(db, session),
    ratings = new RatingsRepository(db, session);
  const groupRecords = new GroupRecordsRepository(db, session);
  const eventRecords = new EventRecordsRepository(db, session);
  const {
    assets: groupAssetService,
    events: plannedEventService,
    groups: unifiedGroupService,
  } = recordServices(db, session);
  const matchService = new MatchService(
    matches,
    invitations,
    users,
    relationships,
    games,
    notifications,
    undefined,
    ratings,
    eventService,
    events,
  );
  return {
    organizations,
    assets,
    users,
    relationships,
    notifications,
    events,
    eventService,
    organizationService,
    assetService,
    matchService,
    matches,
    invitations,
    ratings,
    groupRecords,
    eventRecords,
    plannedEventService,
    unifiedGroupService,
    groupAssetService,
  };
}
async function participation(eventId: string, tableId: string): Promise<JoinTableInput> {
  const s = services(),
    event = await s.eventRecords.find(eventId),
    table = await s.eventRecords.table(tableId);
  if (!event || !table) throw new Error("Missing participation fixture");
  const group = event.groupId ? await s.groupRecords.find(event.groupId) : null;
  return {
    version: event.version,
    gameVotes: Object.fromEntries(table.games.map((game) => [String(game.gameId), "YES" as const])),
    ...(group?.type === "PRIVATE"
      ? {
          availability: {
            version: event.version,
            dateVotes: Object.fromEntries(event.dates.map((row) => [row.id, "YES" as const])),
            locationVotes: Object.fromEntries(
              event.locations.map((row) => [row.id, "YES" as const]),
            ),
          },
        }
      : {}),
  };
}
async function transaction<T>(fn: (s: ReturnType<typeof services>) => Promise<T>) {
  const session = client.startSession();
  try {
    return await session.withTransaction(() => fn(services(session)));
  } finally {
    await session.endSession();
  }
}
async function logo() {
  const bytes = await sharp({
    create: { width: 32, height: 16, channels: 4, background: { r: 80, g: 120, b: 40, alpha: 1 } },
  })
    .png()
    .toBuffer();
  const s = services();
  const asset = await transaction((s) =>
    s.assetService.start(OWNER, { mimeType: "image/png", byteLength: bytes.length }),
  );
  await transaction((s) =>
    s.assetService.append(OWNER, asset.id, { offset: 0, base64: bytes.toString("base64") }),
  );
  return transaction((s) => s.assetService.complete(OWNER, asset.id));
}
async function organization(approve = true) {
  const asset = await logo();
  const row = await transaction((s) =>
    s.organizationService.save(OWNER, {
      name: `Club ${randomUUID()}`,
      location,
      logoAssetId: asset.id,
    }),
  );
  if (!approve) return row;
  return transaction((s) =>
    s.organizationService.review("moderator", row.id, {
      decision: "approve",
      version: row.version,
    }),
  );
}
async function member(id: string, userId: string) {
  await transaction((s) => s.organizationService.request(userId, id));
  await transaction((s) => s.organizationService.membershipAction(OWNER, id, userId, "approve"));
}
function eventInput(extra: Partial<SaveEventInput> = {}): SaveEventInput {
  return {
    name: "Games afternoon",
    status: "PUBLISHED",
    timeZone: "UTC",
    startsAt: "2030-06-12T14:00:00.000Z",
    endsAt: "2030-06-12T20:00:00.000Z",
    bookingClosesAt: "2030-06-11T14:00:00.000Z",
    location,
    tables: [
      {
        name: "First table",
        gameId: 1,
        startsAt: "2030-06-12T14:01:00.000Z",
        endsAt: "2030-06-12T16:00:00.000Z",
        minPlayers: 2,
        maxPlayers: 4,
        openSkill: false,
      },
    ],
    ...extra,
  };
}
async function eventSetup(extra: Partial<SaveEventInput> = {}) {
  const org = await organization();
  for (const id of [GUEST, OTHER, DEMO]) await member(org.id, id);
  const event = await transaction((s) => s.eventService.create(OWNER, org.id, eventInput(extra)));
  const tables = await transaction((s) => s.eventService.tables(OWNER, event.id, { limit: 50 }));
  return { org, event, tables: tables.items };
}
async function book(eventId: string, tableId: string, userId: string, confirm = true) {
  const row = await transaction((s) => s.eventService.book(userId, eventId, tableId));
  if (confirm) await transaction((s) => s.eventService.bookingAction(OWNER, row.id, "approve"));
  return row;
}
beforeAll(async () => {
  container = await new GenericContainer("mongo:7")
    .withCommand(["--replSet", "rs0", "--bind_ip_all"])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .start();
  const uri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?directConnection=true`;
  const bootstrap = new MongoClient(uri);
  await bootstrap.connect();
  await bootstrap
    .db("admin")
    .command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] } });
  await bootstrap.close();
  client = new MongoClient(`${uri}&replicaSet=rs0`);
  await client.connect();
  for (let i = 0; i < 60; i++) {
    if ((await client.db("admin").command({ hello: 1 })).isWritablePrimary) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("MongoDB replica set did not elect a primary");
}, 240_000);
afterAll(async () => {
  await client?.close();
  await container?.stop();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  db = client.db(`integration-community-${number++}`);
  await migrate(db);
  for (const id of [OWNER, GUEST, OTHER, DEMO, OUTSIDER, "moderator"]) {
    await services().users.upsertFromClerk({
      id,
      username: id,
      name: `${id} Player`,
      email: `${id}@example.test`,
      avatarUrl: "",
      mobileNumber: "123456789",
      preferredLanguage: "en",
      bgoRole: id === "moderator" ? "ADMIN" : null,
    });
  }
  await db
    .collection(COLLECTIONS.BOARD_GAMES)
    .insertOne({ id: 1, name: "Test game", isExpansion: false });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-06-01T10:00:00.000Z"));
});
describe("community transactions on a MongoDB replica set", () => {
  it("returns authoritative member/publication counts and distinct confirmed people across paginated tables", async () => {
    const first = eventInput().tables[0];
    const { org, event, tables } = await eventSetup({
      tables: [
        first,
        {
          ...first,
          name: "Later table",
          startsAt: "2030-06-12T17:00:00.000Z",
          endsAt: "2030-06-12T19:00:00.000Z",
        },
      ],
    });
    await transaction((s) => s.organizationService.request(OUTSIDER, org.id));
    await book(event.id, tables[0].id, GUEST);
    const later = await book(event.id, tables[1].id, GUEST);
    await book(event.id, tables[0].id, OWNER);
    await book(event.id, tables[0].id, OTHER, false);
    expect(await services().organizationService.detail(OWNER, org.id)).toMatchObject({
      memberCount: 4,
      publishedEventCount: 1,
    });
    expect(await services().eventService.detail(OWNER, event.id)).toMatchObject({
      tableCount: 2,
      confirmedParticipantCount: 2,
      organizationApproved: true,
    });
    expect(
      (await services().eventService.tables(OWNER, event.id, { limit: 1 })).items,
    ).toHaveLength(1);
    expect(
      (await services().eventService.list(OWNER, { limit: 1 }, org.id)).items[0],
    ).toMatchObject({ tableCount: 2, confirmedParticipantCount: 2 });
    const draft = await transaction((s) =>
      s.eventService.create(OWNER, org.id, eventInput({ status: "DRAFT", tables: [] })),
    );
    expect((await services().organizationService.detail(OWNER, org.id)).publishedEventCount).toBe(
      1,
    );
    const published = await transaction((s) =>
      s.eventService.update(OWNER, draft.id, {
        ...eventInput(),
        version: draft.version,
        removedTableIds: [],
      }),
    );
    expect((await services().organizationService.detail(OWNER, org.id)).publishedEventCount).toBe(
      2,
    );
    await transaction((s) => s.eventService.cancel(OWNER, published.id));
    expect((await services().organizationService.detail(OWNER, org.id)).publishedEventCount).toBe(
      1,
    );
    await transaction((s) =>
      s.eventService.update(OWNER, event.id, {
        ...eventInput(),
        tables: [],
        version: event.version,
        removedTableIds: [tables[1].id],
      }),
    );
    expect((await services().events.findBooking(later.id))?.status).toBe("CANCELLED");
    expect(await services().eventService.detail(OWNER, event.id)).toMatchObject({
      tableCount: 1,
      confirmedParticipantCount: 2,
    });
    await transaction((s) =>
      s.organizationService.membershipAction(OWNER, org.id, GUEST, "remove"),
    );
    expect((await services().organizationService.detail(OWNER, org.id)).memberCount).toBe(3);
    expect((await services().eventService.detail(OWNER, event.id)).confirmedParticipantCount).toBe(
      1,
    );
  });
  it("claims a prepared logo, keeps approved revision public and retires only replaced assets", async () => {
    const org = await organization();
    const original = org.logoAssetId;
    const replacement = await logo();
    const proposed = await transaction((s) =>
      s.organizationService.save(
        OWNER,
        { name: "Modified club", location, logoAssetId: replacement.id, version: org.version },
        org.id,
      ),
    );
    expect((await services().assets.find(original))?.expiresAt).toBeUndefined();
    expect((await services().organizationService.detail(OUTSIDER, org.id)).name).toBe(org.name);
    expect(proposed.name).toBe("Modified club");
    expect((await services().organizationService.moderationDetail("moderator", org.id)).name).toBe(
      "Modified club",
    );
    await transaction((s) =>
      s.organizationService.review("moderator", org.id, {
        decision: "approve",
        version: proposed.version,
      }),
    );
    const obsolete = await services().assets.find(original);
    expect(obsolete?.organizationId).toBeUndefined();
    expect(obsolete?.expiresAt?.getTime()).toBeLessThanOrEqual(Date.now());
    expect((await services().assets.find(replacement.id))?.organizationId).toBe(org.id);
    expect((await services().organizationService.detail(OUTSIDER, org.id)).name).toBe(
      "Modified club",
    );
  });
  it("keeps rejected corrections private and preserves reservations for approved names", async () => {
    const org = await organization(false);
    await expect(services().organizationService.detail(OUTSIDER, org.id)).rejects.toMatchObject({
      status: 404,
    });
    const rejected = await transaction((s) =>
      s.organizationService.review("moderator", org.id, {
        decision: "reject",
        reason: "Correct this name",
        version: org.version,
      }),
    );
    expect(rejected.rejectionReason).toBe("Correct this name");
    const corrected = await transaction((s) =>
      s.organizationService.save(
        OWNER,
        {
          name: "Corrected club",
          location,
          logoAssetId: org.logoAssetId,
          version: rejected.version,
        },
        org.id,
      ),
    );
    expect(corrected.reviewStatus).toBe("PENDING");
    await expect(
      transaction((s) =>
        s.organizationService.review(OUTSIDER, org.id, {
          decision: "approve",
          version: corrected.version,
        }),
      ),
    ).rejects.toThrow("Moderator required");
    const another = await logo();
    await expect(
      transaction((s) =>
        s.organizationService.save(OWNER, {
          name: "  CORRECTED   CLUB  ",
          location,
          logoAssetId: another.id,
        }),
      ),
    ).rejects.toMatchObject({ status: 409, code: "ORGANIZATION_NAME_TAKEN" });
  });
  it("allows requests without friendship, source-pages members, and never restores revoked bookings", async () => {
    const { org, event, tables } = await eventSetup();
    await expect(
      transaction((s) => s.organizationService.invite(OWNER, org.id, OUTSIDER)),
    ).rejects.toMatchObject({ status: 403 });
    await member(org.id, OUTSIDER);
    const first = await services().organizationService.members(
      GUEST,
      org.id,
      { limit: 2 },
      "accepted",
    );
    expect(first.items).toHaveLength(3); // Creator is a fixed first-page header.
    expect(first.nextCursor).toBeTruthy();
    const second = await services().organizationService.members(
      GUEST,
      org.id,
      { limit: 2, cursor: first.nextCursor ?? undefined },
      "accepted",
    );
    expect(new Set([...first.items, ...second.items].map((row) => row.userId)).size).toBe(5);
    expect(first.items[0]).toMatchObject({ name: "owner Player", username: OWNER, isAdmin: true });
    await book(event.id, tables[0].id, GUEST);
    await transaction((s) => s.organizationService.membershipAction(OWNER, org.id, GUEST, "ban"));
    await expect(services().organizationService.detail(GUEST, org.id)).rejects.toMatchObject({
      status: 403,
    });
    await transaction((s) =>
      s.organizationService.membershipAction(OWNER, org.id, GUEST, "revoke"),
    );
    expect((await services().events.bookingForUser(tables[0].id, GUEST))?.status).toBe("CANCELLED");
    await member(org.id, GUEST);
    expect((await services().events.bookingForUser(tables[0].id, GUEST))?.status).toBe("CANCELLED");
  });
  it("removal permits new requests and invitations without reviving cancelled participation", async () => {
    const { org, event, tables } = await eventSetup();
    await book(event.id, tables[0].id, GUEST);
    await transaction((s) =>
      s.organizationService.membershipAction(OWNER, org.id, GUEST, "remove"),
    );
    expect((await services().organizationService.detail(GUEST, org.id)).role).toBe("none");
    expect((await services().events.bookingForUser(tables[0].id, GUEST))?.status).toBe("CANCELLED");
    await member(org.id, GUEST);
    expect((await services().events.bookingForUser(tables[0].id, GUEST))?.status).toBe("CANCELLED");
    await transaction((s) =>
      s.organizationService.membershipAction(OWNER, org.id, GUEST, "remove"),
    );
    await transaction((s) => s.relationships.becomeFriends(OWNER, GUEST));
    await expect(
      transaction((s) => s.organizationService.invite(OWNER, org.id, GUEST)),
    ).resolves.toMatchObject({ status: "PENDING", kind: "INVITATION" });
    await expect(
      transaction((s) => s.organizationService.membershipAction(OWNER, org.id, GUEST, "accept")),
    ).rejects.toMatchObject({ code: "INVITATION_RECIPIENT_REQUIRED" });
    // Recipient alone accepts; organization actions never create or clear global blocks.
    await transaction((s) =>
      s.organizationService.membershipAction(GUEST, org.id, GUEST, "accept"),
    );
    await transaction((s) => s.organizationService.membershipAction(OWNER, org.id, GUEST, "ban"));
    await expect(
      transaction((s) => s.organizationService.request(GUEST, org.id)),
    ).rejects.toMatchObject({ code: "ORGANIZATION_EXCLUDED" });
    expect(await services().relationships.isBlocked(OWNER, GUEST)).toBe(false);
    await transaction((s) =>
      s.organizationService.membershipAction(OWNER, org.id, GUEST, "revoke"),
    );
    expect(
      (await services().organizationService.members(OWNER, org.id, { limit: 20 }, "excluded"))
        .items,
    ).toEqual([]);
    expect((await services().events.bookingForUser(tables[0].id, GUEST))?.status).toBe("CANCELLED");
  });
  it("source-pages private pending and excluded feeds and keeps global blocking independent", async () => {
    const org = await organization();
    await member(org.id, GUEST);
    await member(org.id, OTHER);
    await transaction((s) => s.organizationService.request(OUTSIDER, org.id));
    await transaction((s) => s.organizationService.request(DEMO, org.id));
    await transaction((s) => s.organizationService.membershipAction(OWNER, org.id, OTHER, "ban"));
    await transaction((s) => s.relationships.becomeFriends(OWNER, GUEST));
    const accepted = await transaction((s) =>
      s.organizationService.members(OWNER, org.id, { limit: 1 }),
    );
    expect(accepted.items.find((row) => row.userId === GUEST)).toMatchObject({
      name: "guest Player",
      username: GUEST,
      social: { isFriend: true, isFollowing: true },
    });
    expect(accepted.items.every((row) => !Reflect.has(row, "email"))).toBe(true);
    const pending = await services().organizationService.members(
      OWNER,
      org.id,
      { limit: 1 },
      "pending",
    );
    expect(pending.items).toHaveLength(1);
    expect(pending.nextCursor).not.toBeNull();
    const next = await services().organizationService.members(
      OWNER,
      org.id,
      { limit: 1, cursor: pending.nextCursor ?? undefined },
      "pending",
    );
    expect(new Set([...pending.items, ...next.items].map((row) => row.userId)).size).toBe(2);
    const excluded = await services().organizationService.members(
      OWNER,
      org.id,
      { limit: 1 },
      "excluded",
    );
    expect(excluded.items.map((row) => row.userId)).toEqual([OTHER]);
    for (const viewer of [GUEST, OUTSIDER])
      for (const mode of ["pending", "excluded"] as const)
        await expect(
          services().organizationService.members(viewer, org.id, { limit: 1 }, mode),
        ).rejects.toMatchObject({ code: "ORGANIZATION_MEMBER_REQUIRED" });
    await transaction((s) => s.relationships.block(OWNER, GUEST));
    expect((await services().organizationService.detail(GUEST, org.id)).role).toBe("accepted");
    expect(
      (await services().organizationService.members(OWNER, org.id, { limit: 20 })).items.find(
        (row) => row.userId === GUEST,
      )?.social,
    ).toMatchObject({ blockedByMe: true, isFriend: false });
  });

  it("source-filters organization administration, invitations, accepted membership and requests before pagination", async () => {
    const invited = await organization(),
      accepted = await organization(),
      requested = await organization(),
      hidden = await organization(false);
    await db.collection(COLLECTIONS.FRIEND_REQUESTS).insertMany([
      {
        fromUserId: OWNER,
        toUserId: GUEST,
        status: "accepted",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        fromUserId: GUEST,
        toUserId: OWNER,
        status: "accepted",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await transaction((s) => s.organizationService.invite(OWNER, invited.id, GUEST));
    await member(accepted.id, GUEST);
    await transaction((s) => s.organizationService.request(GUEST, requested.id));
    for (const [role, id] of [
      ["invited", invited.id],
      ["accepted", accepted.id],
      ["requested", requested.id],
    ] as const) {
      const result = await services().organizationService.list(GUEST, "mine", { limit: 1 }, [role]);
      expect(result.items.map((row) => row.id)).toEqual([id]);
      expect(result.items[0].role).toBe(role);
      expect(result.nextCursor).toBeNull();
    }
    expect(
      (await services().organizationService.list(GUEST, "mine", { limit: 20 }, ["admin"])).items,
    ).toEqual([]);
    expect(
      (await services().organizationService.list(OWNER, "mine", { limit: 20 }, ["admin"])).items,
    ).toHaveLength(4);
    expect(
      (await services().organizationService.list(OWNER, "mine", { limit: 20 }, ["accepted"])).items,
    ).toEqual([]);
    expect(
      (await services().organizationService.list(GUEST, "mine", { limit: 20 }, [])).items,
    ).toEqual([]);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await services().organizationService.list(GUEST, "mine", { limit: 1, cursor });
      ids.push(...result.items.map((row) => row.id));
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(ids)).toEqual(new Set([invited.id, accepted.id, requested.id]));
    expect(ids).not.toContain(hidden.id);
    expect(
      (await services().organizationService.list(GUEST, "public", { limit: 20, query: "Club" }, []))
        .items,
    ).toHaveLength(3);
  });
  it("lists personal participation and assigned demonstrations, not every membership event; role guards remain enforced", async () => {
    const { org, event, tables } = await eventSetup();
    await book(event.id, tables[0].id, GUEST);
    const add = async (
      name: string,
      start: string,
      end: string,
      demonstratorUserId?: string,
      status: "PUBLISHED" | "DRAFT" = "PUBLISHED",
    ) => {
      const row = await transaction((s) =>
        s.eventService.create(
          OWNER,
          org.id,
          eventInput({
            name,
            status,
            tables: [
              {
                ...eventInput().tables[0],
                startsAt: `2030-06-12T${start}:00.000Z`,
                endsAt: `2030-06-12T${end}:00.000Z`,
                demonstratorUserId,
              },
            ],
          }),
        ),
      );
      const table = (await services().events.listTables(row.id, { limit: 1 }))[0];
      return { row, table };
    };
    const pending = await add("Pending own request", "16:00", "17:00");
    await book(pending.row.id, pending.table.id, GUEST, false);
    const invited = await add("Another voluntary request", "17:00", "18:00");
    await expect(
      transaction((s) => s.eventService.book(OWNER, invited.row.id, invited.table.id, GUEST)),
    ).rejects.toMatchObject({ status: 403, message: "TABLE_INVITATIONS_DISABLED" });
    expect(await services().events.bookingForUser(invited.table.id, GUEST)).toBeNull();
    await book(invited.row.id, invited.table.id, GUEST, false);
    const demonstration = await add("Assigned demonstration", "18:00", "19:00", GUEST);
    const unrelated = await add("Unrelated member event", "19:00", "20:00");
    const draft = await add("Private assigned draft", "18:00", "19:00", GUEST, "DRAFT");
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await services().eventService.list(GUEST, { limit: 1, cursor });
      expect(result.items.every((row) => row.role === "member" && !row.canModify)).toBe(true);
      ids.push(...result.items.map((row) => row.id));
      cursor = result.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(ids)).toEqual(
      new Set([event.id, pending.row.id, invited.row.id, demonstration.row.id]),
    );
    expect(ids).not.toContain(unrelated.row.id);
    expect(ids).not.toContain(draft.row.id);
    expect((await services().eventService.list(OWNER, { limit: 20 })).items).toHaveLength(6);
    expect((await services().eventService.list(OUTSIDER, { limit: 20 })).items).toEqual([]);
    expect((await services().eventService.list(GUEST, { limit: 20 }, org.id)).items).toHaveLength(
      5,
    );
    await expect(
      transaction((s) => s.eventService.cancel(GUEST, demonstration.row.id)),
    ).rejects.toMatchObject({ status: 403 });
    const invitation = await services().events.bookingForUser(invited.table.id, GUEST);
    await transaction((s) => s.eventService.bookingAction(GUEST, invitation?.id ?? "", "cancel"));
    expect(
      (await services().eventService.list(GUEST, { limit: 20 })).items.map((row) => row.id),
    ).not.toContain(invited.row.id);
    await transaction((s) => s.organizationService.membershipAction(OWNER, org.id, GUEST, "ban"));
    expect((await services().eventService.list(GUEST, { limit: 20 })).items).toEqual([]);
  });
  it("classifies ongoing and exactly ended events at source and retains paginated period selections", async () => {
    const { org, event } = await eventSetup();
    await transaction((s) =>
      s.eventService.create(OWNER, org.id, eventInput({ name: "Another event" })),
    );
    vi.setSystemTime(new Date("2030-06-12T15:00:00.000Z"));
    expect(await services().events.list(OWNER, { limit: 20 }, undefined, ["past"])).toEqual([]);
    expect(await services().events.list(OWNER, { limit: 20 }, org.id, ["future"])).toHaveLength(2);
    vi.setSystemTime(new Date(event.endsAt));
    expect(await services().events.list(OWNER, { limit: 20 }, undefined, ["future"])).toEqual([]);
    const rows = await services().events.list(OWNER, { limit: 1 }, undefined, ["past"]);
    expect(rows).toHaveLength(2); // Repository fetches limit + 1 to establish the cursor.
    const cursor = `${rows[0].createdAt}|${rows[0].id}`;
    expect(
      await services().events.list(OWNER, { limit: 1, cursor }, org.id, ["past"]),
    ).toHaveLength(1);
    expect(await services().events.list(OWNER, { limit: 20 }, undefined, [])).toEqual([]);
  });
  it("saves drafts and publishes without Inngest, preserves outbox and freezes at authorized access after cutoff", async () => {
    for (const key of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "INNGEST_ENV"])
      vi.stubEnv(key, "");
    expect(deadlineServiceConfigured()).toBe(false);
    const pendingOrg = await organization(false);
    const draft = await transaction((s) =>
      s.eventService.create(OWNER, pendingOrg.id, eventInput({ status: "DRAFT", tables: [] })),
    );
    expect(draft.status).toBe("DRAFT");
    await expect(
      transaction((s) => s.eventService.create(OWNER, pendingOrg.id, eventInput())),
    ).rejects.toMatchObject({ code: "ORGANIZATION_NOT_APPROVED" });
    const { event, tables } = await eventSetup();
    expect(event.status).toBe("PUBLISHED");
    expect(event.canPublish).toBe(true);
    expect(
      (await services().events.pendingDeliveries()).some((row) => row.eventId === event.id),
    ).toBe(true);
    await book(event.id, tables[0].id, GUEST);
    await book(event.id, tables[0].id, OTHER);
    vi.setSystemTime(new Date(event.bookingClosesAt));
    await expect(book(event.id, tables[0].id, DEMO)).rejects.toMatchObject({
      code: "EVENT_CLOSED",
    });
    expect((await services().events.find(event.id))?.closedAt).toBeUndefined();
    const closed = await transaction((s) => s.eventService.detail(OWNER, event.id));
    expect(closed.closedAt).toBe(event.bookingClosesAt);
    expect(closed.canModify).toBe(false);
    const frozen = await services().events.findTable(tables[0].id);
    expect(frozen?.status).toBe("CREATED");
    const match = await services().events.findMatch(frozen?.matchId ?? "");
    expect(match?.status).toBe("CREATED");
    await transaction((s) => s.eventService.detail(OWNER, event.id));
    expect((await services().events.findTable(tables[0].id))?.matchId).toBe(frozen?.matchId);
  });
  it("retains one-day table instants through validated creation and schedule edits", async () => {
    const raw = eventInput({
      tables: [{ ...eventInput().tables[0], endsAt: "2030-06-12T19:59:12.123Z" }],
    });
    const input = saveEventSchema.parse(raw);
    const { event, tables } = await eventSetup(input);
    expect(tables[0].startsAt).toBe(input.tables[0].startsAt);
    expect(tables[0].endsAt).toBe(input.tables[0].endsAt);
    await book(event.id, tables[0].id, GUEST);
    const updated = await transaction((s) =>
      s.eventService.update(
        OWNER,
        event.id,
        updateEventSchema.parse({
          ...input,
          endsAt: "2030-06-12T21:00:00.000Z",
          tables: [],
          version: event.version,
          removedTableIds: [],
        }),
      ),
    );
    expect(updated.endsAt).toBe("2030-06-12T21:00:00.000Z");
    const retained = await services().eventService.tables(OWNER, event.id, { limit: 50 });
    expect(retained.items[0].id).toBe(tables[0].id);
    expect(retained.items[0].endsAt).toBe(input.tables[0].endsAt);
    // Schedule changes still cancel participation; no booking silently revives.
    expect(
      (await services().eventService.bookings(GUEST, event.id, tables[0].id, { limit: 50 })).items,
    ).toEqual([]);
  });
  it("enforces 20 total tables across partial edits and allows explicit replacement atomically", async () => {
    const input = saveEventSchema.parse(
      eventInput({
        tables: Array.from({ length: 20 }, (_, index) => ({
          ...eventInput().tables[0],
          name: `Table ${index + 1}`,
        })),
      }),
    );
    const { event, tables } = await eventSetup(input);
    expect(tables).toHaveLength(20);
    const extra = { ...eventInput().tables[0], name: "Replacement table" };
    await expect(
      transaction((s) =>
        s.eventService.update(
          OWNER,
          event.id,
          updateEventSchema.parse({
            ...input,
            version: event.version,
            tables: [extra],
            removedTableIds: [],
          }),
        ),
      ),
    ).rejects.toThrow("EVENT_TABLE_LIMIT");
    expect((await services().events.find(event.id))?.version).toBe(event.version);
    expect(await services().events.allTables(event.id)).toHaveLength(20);
    const updated = await transaction((s) =>
      s.eventService.update(
        OWNER,
        event.id,
        updateEventSchema.parse({
          ...input,
          version: event.version,
          tables: [extra],
          removedTableIds: [tables[0].id],
        }),
      ),
    );
    expect(updated.tableCount).toBe(20);
    const retained = await services().events.allTables(event.id);
    expect(retained).toHaveLength(20);
    expect(retained.some((table) => table.id === tables[0].id)).toBe(false);
    expect(retained.some((table) => table.name === "Replacement table")).toBe(true);
  });
  it("keeps drafts private and source-pagination applies event and booking visibility", async () => {
    const { org, event, tables } = await eventSetup();
    const draft = await transaction((s) =>
      s.eventService.create(
        OWNER,
        org.id,
        eventInput({ status: "DRAFT", name: "Private event draft" }),
      ),
    );
    await expect(services().eventService.detail(GUEST, draft.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await services().eventService.list(GUEST, { limit: 1 }, org.id)).items[0].id).toBe(
      event.id,
    );
    const guestBooking = await book(event.id, tables[0].id, GUEST, false);
    await book(event.id, tables[0].id, OTHER, false);
    await book(event.id, tables[0].id, DEMO, true);
    const rows = await services().eventService.bookings(GUEST, event.id, tables[0].id, {
      limit: 1,
    });
    expect(rows.items).toHaveLength(1);
    const next = await services().eventService.bookings(GUEST, event.id, tables[0].id, {
      limit: 1,
      cursor: rows.nextCursor ?? undefined,
    });
    expect(new Set([...rows.items, ...next.items].map((row) => row.userId))).toEqual(
      new Set([GUEST, DEMO]),
    );
    expect([...rows.items, ...next.items].some((row) => row.id === guestBooking.id)).toBe(true);
    await expect(
      transaction((s) =>
        s.eventService.create(
          OWNER,
          org.id,
          eventInput({
            status: "DRAFT",
            bookingClosesAt: new Date(Date.now() - 1000).toISOString(),
          }),
        ),
      ),
    ).rejects.toMatchObject({ status: 409, code: "BOOKING_DEADLINE_PASSED" });
    vi.setSystemTime(new Date(draft.bookingClosesAt));
    expect((await services().eventService.detail(OWNER, draft.id)).canModify).toBe(false);
    await expect(
      transaction((s) =>
        s.eventService.update(OWNER, draft.id, {
          ...eventInput({ status: "DRAFT" }),
          version: draft.version,
          removedTableIds: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 409, code: "EVENT_CLOSED" });
    await expect(transaction((s) => s.eventService.cancel(OWNER, draft.id))).rejects.toMatchObject({
      status: 409,
      code: "EVENT_CLOSED",
    });
  });
  it("serializes concurrent seat reservations and overlap checks, allowing adjacent tables", async () => {
    const base = eventInput();
    const { event, tables } = await eventSetup({
      tables: [
        { ...base.tables[0], maxPlayers: 2 },
        {
          ...base.tables[0],
          name: "Adjacent table",
          startsAt: base.tables[0].endsAt,
          endsAt: "2030-06-12T18:00:00.000Z",
        },
      ],
    });
    const table = tables.find((row) => row.name === "First table")!;
    const adjacent = tables.find((row) => row.name === "Adjacent table")!;
    const outcomes = await Promise.allSettled(
      [GUEST, OTHER, DEMO].map((id) => book(event.id, table.id, id, false)),
    );
    expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(2);
    expect(outcomes.filter((row) => row.status === "rejected")).toHaveLength(1);
    expect(
      (await services().events.tableBookings(table.id)).filter((row) => row.status === "PENDING"),
    ).toHaveLength(2);
    const booked = (await services().events.tableBookings(table.id))[0].userId;
    await expect(book(event.id, adjacent.id, booked, false)).resolves.toBeDefined();
    const overlapping = await transaction((s) =>
      s.eventService.update(OWNER, event.id, {
        ...eventInput(),
        version: event.version,
        removedTableIds: [],
        tables: [{ ...base.tables[0], name: "Overlapping table" }],
      }),
    );
    const overlap = (
      await services().eventService.tables(OWNER, event.id, { limit: 50 })
    ).items.find((row) => row.name === "Overlapping table")!;
    await expect(book(overlapping.id, overlap.id, booked, false)).rejects.toMatchObject({
      status: 409,
      code: "TABLE_TIME_CONFLICT",
    });
  });
  it("retains unloaded tables and bookings for title-only edits, resets only changed tables", async () => {
    const base = eventInput();
    const { event, tables } = await eventSetup({
      tables: Array.from({ length: 20 }, (_, i) => ({ ...base.tables[0], name: `Table ${i}` })),
    });
    const firstPage = await services().eventService.tables(OWNER, event.id, { limit: 10 });
    expect(firstPage.items).toHaveLength(10);
    expect(firstPage.nextCursor).toBeTruthy();
    const one = tables[0],
      two = tables[1];
    await book(event.id, one.id, GUEST);
    await book(event.id, two.id, OTHER);
    const updated = await transaction((s) =>
      s.eventService.update(OWNER, event.id, {
        ...base,
        name: "New event title",
        version: event.version,
        removedTableIds: [],
        tables: [],
      }),
    );
    expect(await services().events.countTables(event.id)).toBe(20);
    expect((await services().events.bookingForUser(one.id, GUEST))?.status).toBe("CONFIRMED");
    await transaction((s) =>
      s.eventService.update(OWNER, event.id, {
        ...base,
        name: updated.name,
        version: updated.version,
        removedTableIds: [],
        tables: [
          {
            id: one.id,
            name: "Changed table",
            gameId: one.gameId,
            startsAt: one.startsAt,
            endsAt: one.endsAt,
            minPlayers: one.minPlayers,
            maxPlayers: one.maxPlayers,
            openSkill: one.openSkill,
          },
        ],
      }),
    );
    expect(await services().events.countTables(event.id)).toBe(20);
    expect((await services().events.bookingForUser(one.id, GUEST))?.status).toBe("CANCELLED");
    expect((await services().events.bookingForUser(two.id, OTHER))?.status).toBe("CONFIRMED");
  });
  it("freezes the confirmed roster, cancels undersubscribed matches, ignores stale closure jobs and preserves departed players", async () => {
    const base = eventInput();
    const { org, event, tables } = await eventSetup({
      tables: [
        { ...base.tables[0], demonstratorUserId: DEMO },
        { ...base.tables[0], name: "Too few players" },
      ],
    });
    const good = tables.find((row) => row.name === "First table")!,
      bad = tables.find((row) => row.name === "Too few players")!;
    await book(event.id, good.id, GUEST);
    await book(event.id, good.id, OTHER);
    await book(event.id, good.id, DEMO, false);
    const updated = await transaction((s) =>
      s.eventService.update(OWNER, event.id, {
        ...base,
        name: "Final title",
        version: event.version,
        removedTableIds: [],
        tables: [],
      }),
    );
    vi.setSystemTime(new Date(event.bookingClosesAt));
    await transaction((s) => s.eventService.close(event.id, event.version));
    expect((await services().events.findTable(good.id))?.status).toBe("PLANNING");
    await transaction((s) => s.eventService.close(event.id, updated.version));
    const closed = await services().events.findTable(good.id);
    expect(closed?.status).toBe("CREATED");
    expect((await services().events.findTable(bad.id))?.status).toBe("CANCELLED");
    expect(await services().matches.findById(bad.matchId!)).toBeNull();
    expect((await services().events.bookingForUser(good.id, DEMO))?.status).toBe("CANCELLED");
    await expect(
      transaction((s) => s.eventService.book(OWNER, event.id, good.id)),
    ).rejects.toMatchObject({ status: 409, code: "EVENT_CLOSED" });
    await transaction((s) =>
      s.organizationService.membershipAction(GUEST, org.id, GUEST, "cancel"),
    );
    expect((await services().events.bookingForUser(good.id, GUEST))?.status).toBe("CONFIRMED");
    const match = await services().matchService.detail(DEMO, closed!.matchId!);
    expect(match.match.status).toBe("CREATED");
    expect(match.invitedPlayers.map((p) => p.id).sort()).toEqual([GUEST, OTHER]);
    await expect(
      transaction((s) =>
        s.matchService.setChoice(OWNER, closed!.matchId!, {
          kind: "games",
          itemId: 1,
          choice: "YES",
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await transaction((s) =>
      s.matchService.registerResults(
        DEMO,
        closed!.matchId!,
        registerMatchResultsSchema.parse({
          lowerWins: false,
          entries: [
            { userId: GUEST, score: normalizeMatchScore("4.20") },
            { userId: OTHER, score: null },
          ],
          tieBreaks: [],
        }),
      ),
    );
    expect((await services().events.findTable(good.id))?.status).toBe("TERMINATED");
    expect((await services().matches.findById(closed!.matchId!))?.results?.entries).toHaveLength(2);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
    await expect(
      transaction((s) =>
        s.matchService.registerResults(DEMO, closed!.matchId!, {
          lowerWins: false,
          entries: [
            { userId: GUEST, score: "1" },
            { userId: OTHER, score: "2" },
          ],
          tieBreaks: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("atomically records optional GLOBAL-only ratings and excludes an unbooked owner/demo", async () => {
    const base = eventInput();
    const { event, tables } = await eventSetup({
      tables: [{ ...base.tables[0], demonstratorUserId: DEMO, openSkill: true }],
    });
    await book(event.id, tables[0].id, GUEST);
    await book(event.id, tables[0].id, OTHER);
    vi.setSystemTime(new Date(event.bookingClosesAt));
    await transaction((s) => s.eventService.close(event.id));
    const match = (await services().events.findTable(tables[0].id))!.matchId!;
    await expect(
      transaction((s) =>
        s.matchService.registerResults(OUTSIDER, match, {
          lowerWins: false,
          entries: [
            { userId: GUEST, score: "1" },
            { userId: OTHER, score: "2" },
          ],
          tieBreaks: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      transaction((s) =>
        s.matchService.registerResults(DEMO, match, {
          lowerWins: false,
          entries: [
            { userId: OWNER, score: "1" },
            { userId: GUEST, score: "2" },
          ],
          tieBreaks: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await transaction((s) =>
      s.matchService.registerResults(
        DEMO,
        match,
        registerMatchResultsSchema.parse({
          lowerWins: false,
          entries: [
            { userId: GUEST, score: normalizeMatchScore("1.50") },
            { userId: OTHER, score: "1.5" },
          ],
          tieBreaks: [],
        }),
      ),
    );
    const rows = await db.collection(COLLECTIONS.PLAYER_RATINGS).find({}).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.userId).sort()).toEqual([GUEST, OTHER]);
    expect(rows.every((row) => row.scope === "GLOBAL" && row.gamesPlayed === 1)).toBe(true);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(2);
  });
  it("rolls back across-cutoff edits and cancels deliveries with removed events", async () => {
    const { org, event, tables } = await eventSetup();
    await book(event.id, tables[0].id, GUEST);
    vi.setSystemTime(new Date(Date.parse(event.bookingClosesAt) - 1));
    await expect(
      transaction(async (s) => {
        vi.setSystemTime(new Date(event.bookingClosesAt));
        return s.eventService.update(OWNER, event.id, {
          ...eventInput(),
          name: "Invalid late title",
          version: event.version,
          removedTableIds: [],
          tables: [],
        });
      }),
    ).rejects.toMatchObject({ status: 409, code: "EVENT_CLOSED" });
    expect((await services().events.find(event.id))?.name).toBe(event.name);
    vi.setSystemTime(new Date("2030-06-01T10:00:00.000Z"));
    await transaction((s) => s.eventService.cancel(OWNER, event.id));
    expect((await services().eventService.list(OWNER, { limit: 1 }, org.id)).items).toHaveLength(0);
    expect(await services().matches.findById(tables[0].matchId!)).toBeNull();
    expect((await services().events.bookingForUser(tables[0].id, GUEST))?.status).toBe("CANCELLED");
    await transaction((s) => s.eventService.close(event.id, event.version));
    expect((await services().events.findTable(tables[0].id))?.status).toBe("CANCELLED");
  });
});

describe("unified groups/events on the real MongoDB replica set", () => {
  it("source-pages only eligible friends for Group invitations, excluding accepted/pending, blocks and live group bans", async () => {
    for (const user of [GUEST, OTHER, DEMO, OUTSIDER])
      await transaction((s) => s.relationships.becomeFriends(OWNER, user));
    const group = await transaction((s) =>
      s.unifiedGroupService.save(OWNER, {
        type: "PRIVATE",
        name: "Candidate friends club",
        invitedUserIds: [GUEST, OTHER],
      }),
    );
    const guest = await services().groupRecords.membership(group.id, GUEST),
      other = await services().groupRecords.membership(group.id, OTHER);
    if (!guest || !other) throw new Error("Missing invitations");
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(GUEST, group.id, GUEST, {
        action: "accept",
        version: guest.version,
      }),
    );
    const first = await services().unifiedGroupService.invitationCandidates(OWNER, group.id, {
      limit: 1,
    });
    expect(first.items.map((row) => row.id)).toEqual([DEMO]);
    expect(first.nextCursor).toBe(DEMO);
    const second = await services().unifiedGroupService.invitationCandidates(OWNER, group.id, {
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((row) => row.id)).toEqual([OUTSIDER]);
    expect(second.nextCursor).toBeNull();
    expect(
      (
        await services().unifiedGroupService.invitationCandidates(OWNER, group.id, {
          limit: 20,
          query: "outs",
        })
      ).items.map((row) => row.id),
    ).toEqual([OUTSIDER]);
    expect(
      (
        await services().unifiedGroupService.invitationCandidates(OWNER, group.id, {
          limit: 20,
          query: "outs.*",
        })
      ).items,
    ).toEqual([]);
    await expect(
      services().unifiedGroupService.invitationCandidates(GUEST, group.id, { limit: 20 }),
    ).rejects.toMatchObject({ code: "GROUP_ADMIN_REQUIRED" });
    await transaction((s) => s.relationships.block(OWNER, DEMO));
    await transaction((s) =>
      s.unifiedGroupService.ban(OWNER, group.id, { userId: OUTSIDER, until: null }),
    );
    expect(
      (await services().unifiedGroupService.invitationCandidates(OWNER, group.id, { limit: 20 }))
        .items,
    ).toEqual([]);
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OTHER, group.id, OTHER, {
        action: "decline",
        version: other.version,
      }),
    );
    expect(
      (
        await services().unifiedGroupService.invitationCandidates(OWNER, group.id, { limit: 20 })
      ).items.map((row) => row.id),
    ).toEqual([OTHER]);
  });
  it("lists personal planning seats, accepted waiters and pending invitations with source paging and retained own results", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id),
      secondId = randomUUID();
    input.tables.push({ ...input.tables[0], id: secondId, name: "Second invitation table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId));
    await transaction((s) => s.plannedEventService.register(GUEST, event.id, tableId));
    const waiting = await transaction((s) =>
      s.plannedEventService.register(OTHER, event.id, tableId),
    );
    const invitation = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, secondId, OTHER),
    );
    const first = await services().plannedEventService.personalTables(OTHER, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await services().plannedEventService.personalTables(OTHER, {
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    const rows = [...first.items, ...second.items];
    expect(new Set(rows.map((row) => row.id))).toEqual(new Set([tableId, secondId]));
    expect(rows.find((row) => row.id === tableId)).toMatchObject({
      myPosition: "WAITING",
      myRegistration: { status: "ACCEPTED" },
      groupName: group.name,
      acceptedCount: 3,
      pendingRegistrationCount: 0,
      seatedCount: 2,
      waitingCount: 1,
    });
    expect(rows.find((row) => row.id === secondId)).toMatchObject({
      myRegistration: { status: "PENDING" },
      groupName: group.name,
      acceptedCount: 0,
      pendingRegistrationCount: 1,
    });
    expect(
      (
        await services().plannedEventService.personalTables(OTHER, { limit: 20, query: "first" })
      ).items.map((row) => row.id),
    ).toEqual([tableId]);
    expect(
      (await services().plannedEventService.personalTables(DEMO, { limit: 20 })).items,
    ).toEqual([]);
    await transaction((s) =>
      s.plannedEventService.registrationAction(OTHER, invitation.id, {
        action: "decline",
        version: invitation.version,
      }),
    );
    await transaction((s) =>
      s.plannedEventService.registrationAction(OTHER, waiting.id, {
        action: "cancel",
        version: waiting.version,
      }),
    );
    expect(
      (await services().plannedEventService.personalTables(OTHER, { limit: 20 })).items,
    ).toEqual([]);
    expect(
      await services().plannedEventService.tableDetail(OWNER, event.id, tableId),
    ).toMatchObject({ acceptedCount: 2, pendingRegistrationCount: 0 });
    expect(
      await services().plannedEventService.tableDetail(OWNER, event.id, secondId),
    ).toMatchObject({ acceptedCount: 0, pendingRegistrationCount: 0 });
    for (const user of [OWNER, GUEST]) await voteYes(event.id, user);
    const frozen = await confirm(event.id);
    await transaction((s) =>
      s.plannedEventService.finalize(OWNER, event.id, {
        version: frozen.version,
        results: [
          {
            tableId,
            lowerWins: false,
            entries: [
              { userId: OWNER, score: "2" },
              { userId: GUEST, score: "1" },
            ],
            tieBreaks: [],
          },
        ],
      }),
    );
    expect(
      (await services().plannedEventService.personalTables(OWNER, { limit: 20 })).items,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tableId, eventStatus: "TERMINATED" })]),
    );
  });
  it("persists private date/time and venue votes, freezes the chosen clock and preserves unaffected votes through replanning edits", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id),
      later = randomUUID(),
      newVenue = randomUUID();
    input.tables[0].maxPlayers = 3;
    input.dates = [
      { id: dateId, day: "2030-06-03", startTime: "18:15" },
      { id: later, day: "2030-06-03", startTime: "22:30" },
    ];
    input.locations.push({
      ...location,
      id: newVenue,
      latitude: 40.71,
      longitude: -74.01,
      timeZone: "America/New_York",
    });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    expect((await services().eventRecords.find(event.id))?.dates).toEqual(input.dates);
    for (const user of [OWNER, GUEST]) {
      await transaction((s) => s.plannedEventService.register(user, event.id, tableId));
      // Establish a positive date before rejecting another option.
      await transaction((s) =>
        s.plannedEventService.vote(user, event.id, { kind: "date", optionId: later, vote: "YES" }),
      );
      await transaction((s) =>
        s.plannedEventService.vote(user, event.id, { kind: "date", optionId: dateId, vote: "NO" }),
      );
      await transaction((s) =>
        s.plannedEventService.vote(user, event.id, {
          kind: "location",
          optionId: newVenue,
          vote: "YES",
        }),
      );
      await transaction((s) =>
        s.plannedEventService.vote(user, event.id, {
          kind: "game",
          tableId,
          gameId: 1,
          vote: "YES",
        }),
      );
    }
    const pending = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, tableId, OTHER),
    );
    expect(pending.status).toBe("PENDING");
    const detail = await services().plannedEventService.detail(OWNER, event.id);
    expect(detail.agreement).toMatchObject({ agreed: true, dateId: later, locationId: newVenue });
    expect(detail.voteCounts?.dates[later]).toEqual({ YES: 2, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 });
    expect(detail.voteCounts?.locations[newVenue]).toEqual({
      YES: 2,
      NO: 0,
      IF_NEEDED: 0,
      UNKNOWN: 0,
    });
    expect(
      (await services().plannedEventService.tableDetail(OWNER, event.id, tableId)).gameVoteCounts?.[
        "1"
      ],
    ).toEqual({ YES: 2, NO: 0, IF_NEEDED: 0, UNKNOWN: 0 });
    await expect(
      services().plannedEventService.seats(GUEST, event.id, tableId, { limit: 20 }, true),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    const confirmed = await confirm(event.id);
    expect((await services().eventRecords.table(tableId))?.confirmed?.startsAt).toBe(
      "2030-06-04T02:30:00.000Z",
    );
    const reopened = await transaction((s) =>
      s.plannedEventService.transition(OWNER, event.id, {
        action: "replan",
        version: confirmed.version,
      }),
    );
    const replacement = randomUUID(),
      { groupId: _group, ...fields } = input;
    const edit = {
      ...fields,
      tables: [],
      removedTableIds: [],
      version: reopened.version,
      dates: [input.dates[0], { id: replacement, day: "2030-06-04", startTime: "21:00" }],
    };
    await transaction((s) => s.plannedEventService.update(OWNER, event.id, edit));
    const voter = await services().eventRecords.voter(event.id, GUEST);
    expect(voter?.dateVotes[later]).toBeUndefined();
    expect(voter?.dateVotes[dateId]).toBe("NO");
    expect(voter?.locationVotes[newVenue]).toBe("YES");
    const updated = await services().plannedEventService.detail(GUEST, event.id);
    expect(updated.voteCounts?.dates[replacement]).toEqual({
      YES: 0,
      NO: 0,
      IF_NEEDED: 0,
      UNKNOWN: 2,
    });
    expect(updated.voteCounts?.dates[later]).toBeUndefined();
    expect(updated.voteCounts?.dates[dateId].NO).toBe(2);
    expect((await services().eventRecords.table(tableId))?.games).toEqual(
      expect.arrayContaining([{ gameId: 1, durationMinutes: 60, durationSource: "MANUAL" }]),
    );
    await expect(
      transaction((s) => s.plannedEventService.update(OWNER, event.id, edit)),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    expect((await services().eventRecords.find(event.id))?.dates).toEqual(edit.dates);
    expect(await db.collection(COLLECTIONS.MATCHES).countDocuments()).toBe(0);
  });
  it("atomically deletes a Group with every unified Event state and its complete history, leaving personal and unrelated data intact", async () => {
    const group = await privateGroup();
    const input = plannedInput(group.id);
    input.tables[0].maxPlayers = 3;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST]) {
      await transaction((s) => s.plannedEventService.register(user, event.id, tableId));
      await voteYes(event.id, user);
    }
    const frozen = await confirm(event.id);
    await transaction((s) =>
      s.plannedEventService.finalize(OWNER, event.id, {
        version: frozen.version,
        results: [
          {
            tableId,
            lowerWins: false,
            entries: [
              { userId: OWNER, score: "10" },
              { userId: GUEST, score: "4" },
            ],
            tieBreaks: [],
          },
        ],
      }),
    );
    const planningInput = plannedInput(group.id);
    planningInput.tables[0] = { ...planningInput.tables[0], id: randomUUID(), maxPlayers: 3 };
    const planning = await transaction((s) => s.plannedEventService.create(OWNER, planningInput));
    const confirmedInput = plannedInput(group.id);
    const confirmedTableId = randomUUID();
    confirmedInput.tables[0] = { ...confirmedInput.tables[0], id: confirmedTableId, maxPlayers: 3 };
    const confirmed = await transaction((s) => s.plannedEventService.create(OWNER, confirmedInput));
    for (const user of [OWNER, GUEST]) {
      await transaction((s) =>
        s.plannedEventService.register(user, confirmed.id, confirmedTableId),
      );
      await voteYes(confirmed.id, user, confirmedTableId);
    }
    await confirm(confirmed.id);
    const unrelated = await transaction((s) =>
      s.unifiedGroupService.save(OTHER, {
        type: "PRIVATE",
        name: "Unrelated private club",
        invitedUserIds: [],
      }),
    );
    const standaloneInput = plannedInput();
    standaloneInput.tables[0] = { ...standaloneInput.tables[0], id: randomUUID(), maxPlayers: 3 };
    const standalone = await transaction((s) =>
      s.plannedEventService.create(OWNER, standaloneInput),
    );
    const legacy = {
      id: randomUUID(),
      groupId: group.id,
      status: "DRAFT",
      name: "Legacy document",
    };
    await db.collection(COLLECTIONS.EVENTS).insertOne({ ...legacy });
    await db
      .collection(COLLECTIONS.GROUP_ASSETS)
      .insertOne({ id: randomUUID(), groupId: group.id, chunks: [{ base64: "aGVsbG8=" }] });
    await db
      .collection(COLLECTIONS.GROUP_BANS)
      .insertOne({ id: randomUUID(), groupId: group.id, userId: OUTSIDER, until: null });
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertMany([
        { href: `/groups/${group.id}` },
        { href: `/moderation/${group.id}` },
        { href: `/groups/${group.id}?tab=members` },
        { href: `/events/${event.id}#results` },
        { href: `/events/${event.id}/tables/${tableId}` },
        { href: `/events/${standalone.id}` },
        { href: `/groups/${group.id}-unrelated` },
        { href: `/events/${event.id}-unrelated` },
      ]);
    const preserved = [
      COLLECTIONS.USERS,
      COLLECTIONS.FOLLOWS,
      COLLECTIONS.FRIEND_REQUESTS,
      COLLECTIONS.BLOCKS,
      COLLECTIONS.BOARD_GAMES,
      COLLECTIONS.MATCHES,
    ];
    const snapshots = new Map<string, unknown>();
    for (const collection of preserved)
      snapshots.set(collection, await db.collection(collection).find().toArray());
    const globals = await db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .find({ scope: "GLOBAL" })
      .toArray();
    expect(globals).toHaveLength(2);
    const result = await transaction((s) =>
      s.unifiedGroupService.remove(OWNER, group.id, { version: group.version, deleteEvents: true }),
    );
    expect(new Set(result.eventIds)).toEqual(new Set([event.id, planning.id, confirmed.id]));
    expect(await services().groupRecords.find(group.id)).toBeNull();
    expect(await services().groupRecords.find(unrelated.id)).not.toBeNull();
    expect(await services().eventRecords.find(standalone.id)).not.toBeNull();
    expect(
      await db
        .collection(COLLECTIONS.EVENTS)
        .findOne({ id: legacy.id }, { projection: { _id: 0 } }),
    ).toEqual(legacy);
    for (const collection of [
      COLLECTIONS.TABLE_REGISTRATIONS,
      COLLECTIONS.EVENT_VOTES,
      COLLECTIONS.EVENT_TABLES,
      COLLECTIONS.RATING_EVENTS,
    ])
      expect(
        await db.collection(collection).countDocuments({ eventId: { $in: result.eventIds } }),
      ).toBe(0);
    for (const collection of [
      COLLECTIONS.GROUP_MEMBERSHIPS,
      COLLECTIONS.GROUP_BANS,
      COLLECTIONS.GROUP_ASSETS,
    ])
      expect(await db.collection(collection).countDocuments({ groupId: group.id })).toBe(0);
    expect(
      await db
        .collection(COLLECTIONS.PLAYER_RATINGS)
        .countDocuments({ scope: "GROUP", groupId: group.id }),
    ).toBe(0);
    expect(
      await db.collection(COLLECTIONS.PLAYER_RATINGS).find({ scope: "GLOBAL" }).toArray(),
    ).toEqual(globals);
    expect(
      (await db.collection(COLLECTIONS.NOTIFICATIONS).find().toArray())
        .map((row) => row.href)
        .sort(),
    ).toEqual(
      [
        `/events/${standalone.id}`,
        `/events/${event.id}-unrelated`,
        `/groups/${group.id}-unrelated`,
      ].sort(),
    );
    for (const collection of preserved)
      expect(await db.collection(collection).find().toArray()).toEqual(snapshots.get(collection));
  });
  it("rejects non-owners, moderator substitution, stale versions and missing Groups before any cascade", async () => {
    const group = await privateGroup();
    for (const user of [GUEST, OUTSIDER, "moderator"])
      await expect(
        transaction((s) =>
          s.unifiedGroupService.remove(user, group.id, {
            version: group.version,
            deleteEvents: true,
          }),
        ),
      ).rejects.toMatchObject({ code: "GROUP_ADMIN_REQUIRED" });
    await expect(
      transaction((s) =>
        s.unifiedGroupService.remove(OWNER, group.id, {
          version: group.version + 1,
          deleteEvents: true,
        }),
      ),
    ).rejects.toMatchObject({ code: "GROUP_CHANGED" });
    await expect(
      transaction((s) =>
        s.unifiedGroupService.remove(OWNER, randomUUID(), { version: 1, deleteEvents: true }),
      ),
    ).rejects.toMatchObject({ code: "GROUP_NOT_FOUND" });
    expect(await services().groupRecords.countMembers(group.id)).toBe(2);
    expect(await services().groupRecords.find(group.id)).not.toBeNull();
    const empty = await transaction((s) =>
      s.unifiedGroupService.save(OWNER, {
        type: "PRIVATE",
        name: "Empty private club",
        invitedUserIds: [],
      }),
    );
    expect(
      await transaction((s) =>
        s.unifiedGroupService.remove(OWNER, empty.id, {
          version: empty.version,
          deleteEvents: true,
        }),
      ),
    ).toEqual({ id: empty.id, eventIds: [] });
  });
  it("rolls the entire deletion back after a later transaction failure", async () => {
    const group = await privateGroup();
    const input = plannedInput(group.id);
    input.tables[0].maxPlayers = 3;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const collections = [
      COLLECTIONS.GROUPS,
      COLLECTIONS.GROUP_MEMBERSHIPS,
      COLLECTIONS.EVENTS,
      COLLECTIONS.EVENT_TABLES,
      COLLECTIONS.NOTIFICATIONS,
    ];
    const before = new Map<string, unknown>();
    for (const collection of collections)
      before.set(collection, await db.collection(collection).find().toArray());
    await expect(
      transaction(async (s) => {
        await s.unifiedGroupService.remove(OWNER, group.id, {
          version: group.version,
          deleteEvents: true,
        });
        throw new Error("Abort deletion");
      }),
    ).rejects.toThrow("Abort deletion");
    for (const collection of collections)
      expect(await db.collection(collection).find().toArray()).toEqual(before.get(collection));
    expect(await services().eventRecords.find(event.id)).not.toBeNull();
  });
  it("serializes deletion against concurrent Event creation through the same Group lock", async () => {
    const group = await privateGroup();
    const input = plannedInput(group.id);
    input.tables[0].maxPlayers = 3;
    // Separate transactions/sessions: never parallel operations sharing a session.
    const [creation, deletion] = await Promise.allSettled([
      transaction((s) => s.plannedEventService.create(OWNER, input)),
      transaction((s) =>
        s.unifiedGroupService.remove(OWNER, group.id, {
          version: group.version,
          deleteEvents: true,
        }),
      ),
    ]);
    expect(deletion.status).toBe("fulfilled");
    if (creation.status === "rejected")
      expect(creation.reason).toMatchObject({ code: "GROUP_NOT_FOUND" });
    expect(await services().groupRecords.find(group.id)).toBeNull();
    expect(await db.collection(COLLECTIONS.EVENTS).countDocuments({ groupId: group.id })).toBe(0);
    expect(await db.collection(COLLECTIONS.EVENT_TABLES).countDocuments()).toBe(0);
  });
  it("keeps legacy documents intact and refuses reading/locking them through unified repositories", async () => {
    const group = {
        id: "77777777-7777-4777-8777-777777777777",
        adminUserId: OWNER,
        name: "Legacy group",
        isPublic: false,
        createdAt: new Date().toISOString(),
      },
      event = {
        id: "88888888-8888-4888-8888-888888888888",
        organizerId: OWNER,
        status: "DRAFT",
        name: "Legacy event",
      };
    await db.collection(COLLECTIONS.GROUPS).insertOne({ ...group });
    await db.collection(COLLECTIONS.EVENTS).insertOne({ ...event });
    expect(await services().groupRecords.find(group.id)).toBeNull();
    expect(await services().eventRecords.find(event.id)).toBeNull();
    await transaction(async (s) => {
      expect(await s.groupRecords.lock(group.id)).toBeNull();
      expect(await s.eventRecords.lock(event.id)).toBeNull();
    });
    expect(
      await db.collection(COLLECTIONS.GROUPS).findOne({ id: group.id }, { projection: { _id: 0 } }),
    ).toEqual(group);
    expect(
      await db.collection(COLLECTIONS.EVENTS).findOne({ id: event.id }, { projection: { _id: 0 } }),
    ).toEqual(event);
  });
  const joinChoices = (availability: {
    version: number;
    dateVotes: Record<string, "YES" | "IF_NEEDED" | "NO">;
    locationVotes: Record<string, "YES" | "IF_NEEDED" | "NO">;
  }) => ({ version: availability.version, gameVotes: { "1": "YES" as const }, availability });
  const dateId = "11111111-1111-4111-8111-111111111111";
  const venueId = "22222222-2222-4222-8222-222222222222";
  const tableId = "33333333-3333-4333-8333-333333333333";
  const secondId = "44444444-4444-4444-8444-444444444444";
  function plannedInput(groupId: string | null = null): CreatePlannedEventInput {
    return {
      groupId,
      name: "Unified evening",
      timeZone: "UTC",
      startTime: "18:00",
      dates: [{ id: dateId, day: "2030-06-03" }],
      locations: [{ ...location, id: venueId }],
      tables: [
        {
          id: tableId,
          name: "Unified first table",
          minPlayers: 2,
          maxPlayers: 2,
          games: [{ gameId: 1, manualDurationMinutes: 60 }],
          rankingEnabled: true,
        },
      ],
    };
  }
  async function privateGroup() {
    await transaction((s) => s.relationships.becomeFriends(OWNER, GUEST));
    await transaction((s) => s.relationships.becomeFriends(OWNER, OTHER));
    const group = await transaction((s) =>
      s.unifiedGroupService.save(OWNER, {
        type: "PRIVATE",
        name: "Unified private club",
        invitedUserIds: [GUEST, OTHER],
      }),
    );
    for (const user of [GUEST, OTHER]) {
      const membership = await services().groupRecords.membership(group.id, user);
      await transaction((s) =>
        s.unifiedGroupService.membershipAction(user, group.id, user, {
          action: "accept",
          version: membership!.version,
        }),
      );
    }
    return group;
  }
  async function voteYes(eventId: string, user: string, target = tableId) {
    await transaction((s) =>
      s.plannedEventService.vote(user, eventId, { kind: "date", optionId: dateId, vote: "YES" }),
    );
    await transaction((s) =>
      s.plannedEventService.vote(user, eventId, {
        kind: "location",
        optionId: venueId,
        vote: "YES",
      }),
    );
    await transaction((s) =>
      s.plannedEventService.vote(user, eventId, {
        kind: "game",
        tableId: target,
        gameId: 1,
        vote: "YES",
      }),
    );
  }
  async function confirm(eventId: string) {
    const current = await services().eventRecords.find(eventId);
    return transaction((s) =>
      s.plannedEventService.transition(OWNER, eventId, {
        action: "confirm",
        version: current!.version,
      }),
    );
  }
  it("transactionally deletes planning Event/Table data, rolls both back on failure and preserves unrelated histories", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id),
      siblingId = randomUUID();
    input.tables.push({ ...input.tables[0], id: siblingId, name: "Retained second table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const otherInput = plannedInput();
    otherInput.tables[0].id = randomUUID();
    const unrelated = await transaction((s) => s.plannedEventService.create(OWNER, otherInput));
    const invitation = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, tableId, GUEST),
    );
    await transaction(async (s) =>
      s.plannedEventService.registrationAction(GUEST, invitation.id, {
        action: "accept",
        version: invitation.version,
        participation: await participation(event.id, tableId),
      }),
    );
    await transaction(async (s) =>
      s.plannedEventService.join(
        OWNER,
        event.id,
        siblingId,
        await participation(event.id, siblingId),
      ),
    );
    const current = await services().eventRecords.find(event.id),
      version = current!.version;
    await expect(
      transaction((s) => s.plannedEventService.remove(GUEST, event.id, { version })),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    await expect(
      transaction((s) => s.plannedEventService.removeTable(GUEST, event.id, tableId, { version })),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    await expect(
      transaction((s) =>
        s.plannedEventService.removeTable(OWNER, event.id, tableId, { version: version - 1 }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.removeTable(OWNER, event.id, tableId, { version });
        throw new Error("Rollback table deletion");
      }),
    ).rejects.toThrow("Rollback table deletion");
    expect((await services().eventRecords.table(tableId))?.removedAt).toBeUndefined();
    expect((await services().eventRecords.registration(invitation.id))?.status).toBe("ACCEPTED");
    expect((await services().eventRecords.find(event.id))?.version).toBe(version);
    const saved = await transaction((s) =>
      s.plannedEventService.removeTable(OWNER, event.id, tableId, { version }),
    );
    expect(saved).toMatchObject({ version: version + 1, tableCount: 1, participantCount: 1 });
    expect((await services().eventRecords.registration(invitation.id))?.status).toBe("CANCELLED");
    expect(await services().eventRecords.table(siblingId)).not.toBeNull();
    await expect(
      services().plannedEventService.tableDetail(OWNER, event.id, tableId),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    await expect(
      transaction((s) =>
        s.plannedEventService.removeTable(OWNER, event.id, siblingId, { version: saved.version }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_TABLE_LIMIT" });
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.remove(OWNER, event.id, { version: saved.version });
        throw new Error("Rollback event deletion");
      }),
    ).rejects.toThrow("Rollback event deletion");
    expect(await services().eventRecords.find(event.id)).not.toBeNull();
    expect(await services().eventRecords.table(siblingId)).not.toBeNull();
    expect(
      await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).countDocuments({ eventId: event.id }),
    ).toBe(2);
    const prefixId = randomUUID();
    await db
      .collection(COLLECTIONS.NOTIFICATIONS)
      .insertOne({ id: prefixId, userId: OWNER, href: `/events/${event.id}-unrelated` });
    expect(
      await transaction((s) =>
        s.plannedEventService.remove(OWNER, event.id, { version: saved.version }),
      ),
    ).toEqual({ id: event.id, groupId: group.id });
    expect(await services().eventRecords.find(event.id)).toBeNull();
    for (const collection of [
      COLLECTIONS.EVENT_TABLES,
      COLLECTIONS.TABLE_REGISTRATIONS,
      COLLECTIONS.EVENT_VOTES,
    ])
      expect(await db.collection(collection).countDocuments({ eventId: event.id })).toBe(0);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .countDocuments({ href: { $regex: `^/events/${event.id}(?:[/?#]|$)` } }),
    ).toBe(0);
    expect(await db.collection(COLLECTIONS.NOTIFICATIONS).findOne({ id: prefixId })).not.toBeNull();
    expect(await services().eventRecords.find(unrelated.id)).not.toBeNull();
    expect(await services().eventRecords.table(otherInput.tables[0].id!)).not.toBeNull();
    expect((await services().unifiedGroupService.detail(OWNER, group.id)).eventCount).toBe(0);
  });
  it("commits creation correlation without using it as resource identity, preserves it through edits and rolls back failed Event creation", async () => {
    const groupRequest = randomUUID();
    const group = await transaction((s) =>
      s.unifiedGroupService.save(OWNER, {
        type: "PRIVATE",
        name: "Correlated private club",
        invitedUserIds: [],
        clientRequestId: groupRequest,
      }),
    );
    expect(group.id).not.toBe(groupRequest);
    expect((await services().groupRecords.find(group.id))?.clientRequestId).toBe(groupRequest);
    expect((await services().unifiedGroupService.detail(OWNER, group.id)).clientRequestId).toBe(
      groupRequest,
    );
    expect(
      (await services().unifiedGroupService.list(OWNER, "mine", { limit: 20 })).items.find(
        (row) => row.id === group.id,
      )?.clientRequestId,
    ).toBe(groupRequest);
    const editedGroup = await transaction((s) =>
      s.unifiedGroupService.save(
        OWNER,
        { name: "Edited correlated club", version: group.version },
        group.id,
      ),
    );
    expect(editedGroup.clientRequestId).toBe(groupRequest);
    const request = randomUUID(),
      input = { ...plannedInput(group.id), clientRequestId: request };
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    expect(event.id).not.toBe(request);
    expect((await services().eventRecords.find(event.id))?.clientRequestId).toBe(request);
    expect((await services().plannedEventService.detail(OWNER, event.id)).clientRequestId).toBe(
      request,
    );
    expect(
      (await services().plannedEventService.list(OWNER, { limit: 20 }, group.id)).items.find(
        (row) => row.id === event.id,
      )?.clientRequestId,
    ).toBe(request);
    const { groupId: _group, clientRequestId: _request, ...fields } = input;
    const edited = await transaction((s) =>
      s.plannedEventService.update(OWNER, event.id, {
        ...fields,
        version: event.version,
        name: "Edited correlated evening",
        tables: [],
        removedTableIds: [],
      }),
    );
    expect(edited.clientRequestId).toBe(request);
    expect(
      await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).countDocuments({ eventId: event.id }),
    ).toBe(0);
    const rollbackRequest = randomUUID();
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.create(OWNER, {
          ...plannedInput(group.id),
          clientRequestId: rollbackRequest,
          tables: [{ ...input.tables[0], id: randomUUID() }],
        });
        throw new Error("Rollback correlated creation");
      }),
    ).rejects.toThrow("Rollback correlated creation");
    expect(
      await db.collection(COLLECTIONS.EVENTS).countDocuments({ clientRequestId: rollbackRequest }),
    ).toBe(0);
    expect((await services().eventRecords.find(event.id))?.clientRequestId).toBe(request);
  });
  it.each([false, true])(
    "filters every active Table seat/queue entry before invitation paging (grouped=%s)",
    async (grouped) => {
      const group = grouped ? await privateGroup() : null;
      const names = [
        "a_pending",
        "b_accepted",
        "c_waiting",
        "d_pending_waiting",
        "e_other",
        "f_declined",
        "g_cancelled",
        "h_free",
        "i_pending_member",
        "j_banned",
        "k_blocked",
        "l_unilateral",
        "m_outsider",
        "n_reverse_blocked",
      ];
      for (const userId of names) {
        await services().users.upsertFromClerk({
          id: userId,
          name: userId === "h_free" ? "Visible.* player" : `${userId} player`,
          email: `${userId}@example.test`,
          preferredLanguage: "en",
        });
        if (userId !== "l_unilateral")
          await transaction((s) => s.relationships.becomeFriends(OWNER, userId));
        if (group && !["l_unilateral", "m_outsider"].includes(userId)) {
          await transaction((s) => s.unifiedGroupService.invite(OWNER, group.id, userId));
          if (userId !== "i_pending_member") {
            const membership = await services().groupRecords.membership(group.id, userId);
            await transaction((s) =>
              s.unifiedGroupService.membershipAction(userId, group.id, userId, {
                action: "accept",
                version: membership!.version,
              }),
            );
          }
        }
      }
      await db.collection(COLLECTIONS.FRIEND_REQUESTS).insertOne({
        id: randomUUID(),
        fromUserId: OWNER,
        toUserId: "l_unilateral",
        status: "accepted",
      });
      await transaction((s) => s.relationships.block(OWNER, "k_blocked"));
      await transaction((s) => s.relationships.block("n_reverse_blocked", OWNER));
      if (group)
        await services().groupRecords.saveBan({
          id: randomUUID(),
          groupId: group.id,
          userId: "j_banned",
          adminUserId: OWNER,
          until: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      const input = plannedInput(group?.id ?? null);
      input.tables.push({ ...input.tables[0], id: secondId, name: "Other table" });
      const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
      const invite = (userId: string, target = tableId) =>
        transaction((s) => s.plannedEventService.register(OWNER, event.id, target, userId));
      const accept = async (userId: string) => {
        const row = await invite(userId);
        const choices = await participation(event.id, tableId);
        await transaction((s) =>
          s.plannedEventService.registrationAction(userId, row.id, {
            action: "accept",
            version: row.version,
            participation: choices,
          }),
        );
        return row;
      };
      await invite("a_pending");
      await accept("b_accepted");
      await accept("c_waiting");
      await invite("d_pending_waiting");
      await invite("e_other", secondId);
      const declined = await invite("f_declined");
      await transaction((s) =>
        s.plannedEventService.registrationAction("f_declined", declined.id, {
          action: "decline",
          version: declined.version,
        }),
      );
      const cancelled = await accept("g_cancelled");
      const accepted = await services().eventRecords.registration(cancelled.id);
      await transaction((s) =>
        s.plannedEventService.registrationAction("g_cancelled", cancelled.id, {
          action: "cancel",
          version: accepted!.version,
        }),
      );
      if (group) {
        await invite(GUEST);
        await invite(OTHER);
      }
      const waiting = await services().plannedEventService.seats(OWNER, event.id, tableId, {
        limit: 20,
      });
      expect(waiting.items.find((row) => row.userId === "c_waiting")?.position).toBe("WAITING");
      const expected = grouped
        ? ["e_other", "f_declined", "g_cancelled", "h_free", "k_blocked", "n_reverse_blocked"]
        : [
            "e_other",
            "f_declined",
            "g_cancelled",
            "h_free",
            "i_pending_member",
            "j_banned",
            "m_outsider",
          ];
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await services().plannedEventService.invitationCandidates(
          OWNER,
          event.id,
          tableId,
          { limit: 1, cursor },
        );
        expect(page.items).toHaveLength(1);
        expect(page.items[0]).not.toHaveProperty("presence");
        if (grouped) expect(page.items[0].email).toBeNull();
        ids.push(page.items[0].id);
        cursor = page.nextCursor ?? undefined;
        expect(ids.length).toBeLessThanOrEqual(expected.length);
      } while (cursor);
      expect(ids).toEqual(expected);
      const search = await services().plannedEventService.invitationCandidates(
        OWNER,
        event.id,
        tableId,
        { limit: 20, query: "Visible.*" },
      );
      expect(search.items.map((row) => row.id)).toEqual(["h_free"]);
      expect(
        (
          await services().plannedEventService.invitationCandidates(OWNER, event.id, tableId, {
            limit: 20,
            query: "ZZZ.*",
          })
        ).items,
      ).toEqual([]);
      await expect(invite("a_pending")).rejects.toMatchObject({
        code: "REGISTRATION_ALREADY_ACTIVE",
      });
      await expect(
        services().plannedEventService.invitationCandidates("b_accepted", event.id, tableId, {
          limit: 20,
        }),
      ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
      await invite("f_declined");
      expect(
        (
          await services().plannedEventService.invitationCandidates(OWNER, event.id, tableId, {
            limit: 20,
          })
        ).items.map((row) => row.id),
      ).not.toContain("f_declined");
    },
  );
  it("atomically accepts a pending PRIVATE invitation with all choices and rolls back an intervening storage failure", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.dates.push({ id: secondId, day: "2030-06-04" });
    input.locations.push({ ...input.locations[0], id: secondId, name: "Second venue" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const invite = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, tableId, GUEST),
    );
    const choices = await participation(event.id, tableId);
    expect(invite.eventVersion).toBe(choices.version);
    expect(await services().eventRecords.registration(invite.id)).not.toHaveProperty(
      "eventVersion",
    );
    const count = await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments();
    await expect(
      transaction((s) =>
        s.plannedEventService.registrationAction(GUEST, invite.id, {
          action: "accept",
          version: invite.version,
          participation: { ...choices, gameVotes: { "1": "NO" } },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_JOIN_GAME_VOTES" });
    expect((await services().eventRecords.registration(invite.id))?.status).toBe("PENDING");
    expect(await services().eventRecords.voter(event.id, GUEST)).toBeNull();
    const failure = vi
      .spyOn(EventRecordsRepository.prototype, "saveVoter")
      .mockRejectedValueOnce(new Error("Vote storage failed"));
    try {
      await expect(
        transaction((s) =>
          s.plannedEventService.registrationAction(GUEST, invite.id, {
            action: "accept",
            version: invite.version,
            participation: choices,
          }),
        ),
      ).rejects.toThrow("Vote storage failed");
    } finally {
      failure.mockRestore();
    }
    expect(await services().eventRecords.registration(invite.id)).toMatchObject({
      status: "PENDING",
      version: invite.version,
      gameVotes: {},
    });
    expect((await services().eventRecords.find(event.id))?.version).toBe(choices.version);
    expect(await services().eventRecords.voter(event.id, GUEST)).toBeNull();
    expect(await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments()).toBe(count);
    const accepted = await transaction((s) =>
      s.plannedEventService.registrationAction(GUEST, invite.id, {
        action: "accept",
        version: invite.version,
        participation: choices,
      }),
    );
    expect(accepted).toMatchObject({
      id: invite.id,
      status: "ACCEPTED",
      priorityAt: invite.priorityAt,
      sequence: invite.sequence,
      gameVotes: choices.gameVotes,
    });
    expect(await services().eventRecords.voter(event.id, GUEST)).toMatchObject({
      dateVotes: choices.availability!.dateVotes,
      locationVotes: choices.availability!.locationVotes,
    });
    expect((await services().eventRecords.find(event.id))?.version).toBe(choices.version + 1);
    expect(accepted.eventVersion).toBe(choices.version + 1);
    expect(await services().eventRecords.registration(accepted.id)).not.toHaveProperty(
      "eventVersion",
    );
    const cancelled = await transaction((s) =>
      s.plannedEventService.registrationAction(GUEST, accepted.id, {
        action: "cancel",
        version: accepted.version,
      }),
    );
    expect(cancelled.eventVersion).toBe(accepted.eventVersion + 1);
    expect((await services().eventRecords.find(event.id))?.version).toBe(cancelled.eventVersion);
    expect(await services().eventRecords.registration(cancelled.id)).not.toHaveProperty(
      "eventVersion",
    );
  });
  it("serializes concurrent game rejections and commits explicit join games atomically", async () => {
    const group = await privateGroup();
    await db
      .collection(COLLECTIONS.BOARD_GAMES)
      .insertOne({ id: 2, name: "Second game", isExpansion: false });
    const input = plannedInput(group.id);
    input.tables[0].games.push({ gameId: 2, manualDurationMinutes: 60 });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const choices = {
      version: event.version,
      availability: {
        version: event.version,
        dateVotes: { [dateId]: "YES" as const },
        locationVotes: { [venueId]: "IF_NEEDED" as const },
      },
      gameVotes: { "1": "YES" as const, "2": "IF_NEEDED" as const },
    };
    await expect(
      transaction((s) =>
        s.plannedEventService.join(GUEST, event.id, tableId, {
          ...choices,
          gameVotes: { "1": "YES" },
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_JOIN_GAME_VOTES" });
    expect(await services().eventRecords.userRegistration(tableId, GUEST)).toBeNull();
    expect(await services().eventRecords.voter(event.id, GUEST)).toBeNull();
    await transaction((s) => s.plannedEventService.join(GUEST, event.id, tableId, choices));
    const results = await Promise.allSettled(
      [1, 2].map((gameId) =>
        transaction((s) =>
          s.plannedEventService.vote(GUEST, event.id, {
            kind: "game",
            tableId,
            gameId,
            vote: "NO",
          }),
        ),
      ),
    );
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((row) => row.status === "rejected") as PromiseRejectedResult).reason,
    ).toMatchObject({ code: "GAME_POSITIVE_AVAILABILITY_REQUIRED" });
    const row = await services().eventRecords.userRegistration(tableId, GUEST);
    expect(
      Object.values(row!.gameVotes).filter((v) => v === "YES" || v === "IF_NEEDED"),
    ).toHaveLength(1);
  });
  it("keeps Event availability across additional PRIVATE joins and hides excluded personal Tables", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.dates.push({ id: secondId, day: "2030-06-04" });
    input.locations.push({ ...input.locations[0], id: secondId, name: "Second venue" });
    input.tables.push({ ...input.tables[0], id: secondId, name: "Excluded second table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST]) {
      const latest = await services().eventRecords.find(event.id);
      await transaction((s) =>
        s.plannedEventService.join(
          user,
          event.id,
          tableId,
          joinChoices({
            version: latest!.version,
            dateVotes: { [dateId]: "YES", [secondId]: "YES" },
            locationVotes: { [venueId]: "IF_NEEDED", [secondId]: "YES" },
          }),
        ),
      );
      await transaction((s) =>
        s.plannedEventService.vote(user, event.id, {
          kind: "game",
          tableId,
          gameId: 1,
          vote: "YES",
        }),
      );
    }
    for (const kind of ["date", "location"] as const) {
      const ids = kind === "date" ? [dateId, secondId] : [venueId, secondId];
      const results = await Promise.allSettled(
        ids.map((optionId) =>
          transaction((s) =>
            s.plannedEventService.vote(OWNER, event.id, { kind, optionId, vote: "NO" }),
          ),
        ),
      );
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejection = results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      expect(rejection.reason).toMatchObject({ code: "EVENT_POSITIVE_AVAILABILITY_REQUIRED" });
    }
    const before = await services().eventRecords.voter(event.id, OWNER);
    const joining = await services().eventRecords.find(event.id);
    await transaction((s) =>
      s.plannedEventService.join(OWNER, event.id, secondId, {
        version: joining!.version,
        gameVotes: { "1": "IF_NEEDED" },
      }),
    );
    expect(await services().eventRecords.voter(event.id, OWNER)).toEqual(before);
    expect(
      (await services().plannedEventService.personalTables(OWNER, { limit: 20 })).items,
    ).toHaveLength(2);
    await confirm(event.id);
    const personal = await services().plannedEventService.personalTables(OWNER, { limit: 1 });
    expect(personal.items.map((row) => row.id)).toEqual([tableId]);
    expect(personal.nextCursor).toBeNull();
    const eventTables = await services().plannedEventService.tables(OWNER, event.id, { limit: 20 });
    expect(eventTables.items).toHaveLength(2);
    expect(eventTables.items.find((row) => row.id === secondId)?.confirmed).toBeUndefined();
    const latest = await services().eventRecords.find(event.id);
    await transaction((s) =>
      s.plannedEventService.finalize(OWNER, event.id, {
        version: latest!.version,
        results: [
          {
            tableId,
            lowerWins: false,
            entries: [
              { userId: OWNER, score: "2" },
              { userId: GUEST, score: "1" },
            ],
            tieBreaks: [],
          },
        ],
      }),
    );
    expect(
      (await services().plannedEventService.personalTables(OWNER, { limit: 20 })).items.map(
        (row) => row.id,
      ),
    ).toEqual([tableId]);
    expect(
      (await services().plannedEventService.tables(OWNER, event.id, { limit: 20 })).items,
    ).toHaveLength(2);
  });
  it("atomically enrolls PRIVATE players with initial/repeat availability, rejects stale choices and rolls both writes back", async () => {
    const group = await privateGroup();
    const secondTableId = randomUUID(),
      input = plannedInput(group.id);
    input.tables.push({ ...input.tables[0], id: secondTableId, name: "Second private table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const availability = {
      version: event.version,
      dateVotes: { [dateId]: "YES" as const },
      locationVotes: { [venueId]: "IF_NEEDED" as const },
    };
    await expect(
      transaction((s) => s.plannedEventService.join(GUEST, event.id, tableId)),
    ).rejects.toMatchObject({ code: "EVENT_AVAILABILITY_REQUIRED" });
    await expect(
      transaction((s) =>
        s.plannedEventService.join(
          GUEST,
          event.id,
          tableId,
          joinChoices({
            ...availability,
            locationVotes: { [venueId]: "NO" },
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: "INVALID_JOIN_AVAILABILITY" });
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.join(GUEST, event.id, tableId, joinChoices(availability));
        throw new Error("rollback enrollment");
      }),
    ).rejects.toThrow("rollback enrollment");
    expect(await services().eventRecords.userRegistration(tableId, GUEST)).toBeNull();
    expect(await services().eventRecords.voter(event.id, GUEST)).toBeNull();
    expect((await services().eventRecords.find(event.id))?.version).toBe(event.version);
    const row = await transaction((s) =>
      s.plannedEventService.join(GUEST, event.id, tableId, joinChoices(availability)),
    );
    expect(row).toMatchObject({
      userId: GUEST,
      kind: "SELF",
      status: "ACCEPTED",
      gameVotes: { "1": "YES" },
    });
    expect(await services().eventRecords.voter(event.id, GUEST)).toMatchObject({
      dateVotes: availability.dateVotes,
      locationVotes: availability.locationVotes,
    });
    expect((await services().eventRecords.find(event.id))?.version).toBe(event.version + 1);
    await expect(
      transaction((s) =>
        s.plannedEventService.join(OTHER, event.id, tableId, joinChoices(availability)),
      ),
    ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
    expect(await services().eventRecords.userRegistration(tableId, OTHER)).toBeNull();
    await transaction((s) =>
      s.plannedEventService.vote(GUEST, event.id, {
        kind: "date",
        optionId: dateId,
        vote: "IF_NEEDED",
      }),
    );
    expect((await services().eventRecords.voter(event.id, GUEST))?.dateVotes[dateId]).toBe(
      "IF_NEEDED",
    );
    await expect(
      transaction((s) =>
        s.plannedEventService.vote(GUEST, event.id, {
          kind: "location",
          optionId: venueId,
          vote: "UNKNOWN",
        } as never),
      ),
    ).rejects.toMatchObject({ code: "INVALID_VOTE" });
    await expect(
      transaction((s) =>
        s.plannedEventService.vote(GUEST, event.id, {
          kind: "game",
          tableId,
          gameId: 1,
          vote: "UNKNOWN",
        } as never),
      ),
    ).rejects.toMatchObject({ code: "INVALID_VOTE" });
    expect((await services().eventRecords.userRegistration(tableId, GUEST))?.gameVotes["1"]).toBe(
      "YES",
    );
    const beforeRepeat = (await services().eventRecords.find(event.id))!;
    const updatedAvailability = {
      version: beforeRepeat.version,
      dateVotes: { [dateId]: "YES" as const },
      locationVotes: { [venueId]: "YES" as const },
    };
    const secondInput = {
      ...joinChoices(updatedAvailability),
      gameVotes: { "1": "IF_NEEDED" as const },
    };
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.join(GUEST, event.id, secondTableId, secondInput);
        throw new Error("rollback repeat enrollment");
      }),
    ).rejects.toThrow("rollback repeat enrollment");
    expect(await services().eventRecords.userRegistration(secondTableId, GUEST)).toBeNull();
    expect((await services().eventRecords.voter(event.id, GUEST))?.dateVotes[dateId]).toBe(
      "IF_NEEDED",
    );
    expect((await services().eventRecords.find(event.id))?.version).toBe(beforeRepeat.version);
    await transaction((s) =>
      s.plannedEventService.join(GUEST, event.id, secondTableId, secondInput),
    );
    expect(await services().eventRecords.voter(event.id, GUEST)).toMatchObject({
      dateVotes: updatedAvailability.dateVotes,
      locationVotes: updatedAvailability.locationVotes,
    });
    expect(
      (await services().eventRecords.userRegistration(secondTableId, GUEST))?.gameVotes["1"],
    ).toBe("IF_NEEDED");
    expect((await services().eventRecords.userRegistration(tableId, GUEST))?.gameVotes["1"]).toBe(
      "YES",
    );
    expect(await db.collection(COLLECTIONS.MATCHES).countDocuments()).toBe(0);
  });
  it("reserves a pending seat without a vote or phantom participant; records no synthetic Match", async () => {
    await transaction((s) => s.relationships.becomeFriends(OWNER, GUEST));
    await transaction((s) => s.relationships.becomeFriends(OWNER, OTHER));
    const event = await transaction((s) => s.plannedEventService.create(OWNER, plannedInput()));
    expect(event.participantCount).toBe(0);
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId));
    const invitation = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, tableId, GUEST),
    );
    const waiting = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, tableId, OTHER),
    );
    const choices = await participation(event.id, tableId);
    await transaction((s) =>
      s.plannedEventService.registrationAction(OTHER, waiting.id, {
        action: "accept",
        version: waiting.version,
        participation: choices,
      }),
    );
    await expect(
      transaction((s) =>
        s.plannedEventService.vote(GUEST, event.id, {
          kind: "date",
          optionId: dateId,
          vote: "YES",
        }),
      ),
    ).rejects.toMatchObject({ code: "ACCEPTED_REGISTRATION_REQUIRED" });
    await voteYes(event.id, OWNER);
    await voteYes(event.id, OTHER);
    expect((await services().plannedEventService.detail(OWNER, event.id)).agreement?.agreed).toBe(
      false,
    );
    await expect(confirm(event.id)).rejects.toMatchObject({ code: "EVENT_NO_AGREEMENT" });
    await transaction((s) =>
      s.plannedEventService.registrationAction(GUEST, invitation.id, {
        action: "decline",
        version: invitation.version,
      }),
    );
    await confirm(event.id);
    expect((await services().eventRecords.table(tableId))?.confirmed?.playerIds).toEqual([
      OWNER,
      OTHER,
    ]);
    expect(await db.collection(COLLECTIONS.MATCHES).countDocuments()).toBe(0);
    expect(await db.collection(COLLECTIONS.MATCH_INVITATIONS).countDocuments()).toBe(0);
  });
  it("serializes concurrent last-seat enrollments, preserves request-time priority and queues the third person", async () => {
    const group = await privateGroup();
    const event = await transaction((s) =>
      s.plannedEventService.create(OWNER, plannedInput(group.id)),
    );
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId));
    const registrations = await Promise.all(
      [GUEST, OTHER].map((user) =>
        transaction((s) => s.plannedEventService.register(user, event.id, tableId)),
      ),
    );
    expect(registrations.every((row) => row.status === "ACCEPTED")).toBe(true);
    expect(registrations.map((row) => row.sequence).sort()).toEqual([1, 2]);
    expect(new Set(registrations.map((row) => row.priorityAt)).size).toBe(1);
    expect(
      await services().plannedEventService.tableDetail(OWNER, event.id, tableId),
    ).toMatchObject({ seatedCount: 2, pendingCount: 0, waitingCount: 1 });
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await services().plannedEventService.seats(OWNER, event.id, tableId, {
        limit: 1,
        cursor,
      });
      seen.push(...page.items.map((row) => row.sequence));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([0, 1, 2]);
    await Promise.all([OWNER, GUEST, OTHER].map((user) => voteYes(event.id, user)));
    await confirm(event.id);
    const selected = await services().eventRecords.table(tableId);
    expect(selected?.confirmed?.playerIds).toHaveLength(2);
    expect(selected?.confirmed?.playerIds).toContain(
      registrations.find((row) => row.sequence === 1)!.userId,
    );
    const before = await services().eventRecords.allRegistrations(event.id);
    const current = await services().eventRecords.find(event.id);
    await transaction((s) =>
      s.plannedEventService.transition(OWNER, event.id, {
        action: "replan",
        version: current!.version,
      }),
    );
    expect(await services().eventRecords.allRegistrations(event.id)).toEqual(before);
  });
  it("rolls back earlier table results/ratings when a later table is invalid; commits all-ND without statistics", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.tables.push({ ...input.tables[0], id: secondId, name: "Unified second table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const table of [tableId, secondId])
      for (const user of [OWNER, GUEST]) {
        await transaction((s) => s.plannedEventService.register(user, event.id, table));
        await voteYes(event.id, user, table);
      }
    const confirmed = await confirm(event.id);
    const beforeRanking = await services().plannedEventService.tableLeaderboard(
      OWNER,
      event.id,
      tableId,
      { limit: 20 },
    );
    expect(beforeRanking).toMatchObject({ gameId: 1, scope: "GROUP", nextCursor: null });
    expect(new Set(beforeRanking.items.map((row) => row.userId))).toEqual(new Set([OWNER, GUEST]));
    expect(beforeRanking.items.every((row) => row.gamesPlayed === 0)).toBe(true);
    const first = {
      tableId,
      lowerWins: false,
      entries: [
        { userId: OWNER, score: "9" },
        { userId: GUEST, score: "3" },
      ],
      tieBreaks: [],
    };
    await expect(
      transaction((s) =>
        s.plannedEventService.finalize(OWNER, event.id, {
          version: confirmed.version,
          results: [
            first,
            {
              ...first,
              tableId: secondId,
              entries: [
                { userId: OWNER, score: "invalid" },
                { userId: GUEST, score: "3" },
              ],
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: "RESULTS_REQUIRE_EVERY_PLAYER_ONCE" });
    expect((await services().eventRecords.table(tableId))?.results).toBeUndefined();
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
    expect(await db.collection(COLLECTIONS.PLAYER_RATINGS).countDocuments()).toBe(0);
    const done = await transaction((s) =>
      s.plannedEventService.finalize(OWNER, event.id, {
        version: confirmed.version,
        results: [
          first,
          {
            ...first,
            tableId: secondId,
            entries: [
              { userId: OWNER, score: null },
              { userId: GUEST, score: null },
            ],
          },
        ],
      }),
    );
    expect(done.status).toBe("TERMINATED");
    const current = await services().plannedEventService.tableLeaderboard(
      OWNER,
      event.id,
      tableId,
      { limit: 1 },
    );
    expect(current).toMatchObject({
      gameId: 1,
      scope: "GROUP",
      nextCursor: "1",
      items: [{ userId: OWNER, gamesPlayed: 1, gamesWon: 1, nd: 0 }],
    });
    const tail = await services().plannedEventService.tableLeaderboard(GUEST, event.id, tableId, {
      limit: 1,
      cursor: "1",
    });
    expect(tail).toMatchObject({
      nextCursor: null,
      items: [{ userId: GUEST, gamesPlayed: 1, gamesWon: 0, nd: 0 }],
    });
    expect(current.items[0].score).toBeGreaterThan(tail.items[0].score);
    // A Table with all-ND outcomes adds no statistics, yet its current game ranking reflects other rated Tables.
    const ndCurrent = await services().plannedEventService.tableLeaderboard(
      OWNER,
      event.id,
      secondId,
      { limit: 20 },
    );
    expect(ndCurrent.items).toEqual([...current.items, ...tail.items]);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ tableId })).toBe(4);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ tableId: secondId }),
    ).toBe(0);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: { $exists: true } }),
    ).toBe(0);
    expect((await services().ratings.tableStats([OWNER, GUEST], 1, group.id)).get(OWNER)).toEqual({
      gamesPlayed: 1,
      gamesWon: 1,
      nd: 0,
    });
    expect((await services().ratings.tableStats([OWNER, GUEST], 1, null)).get(GUEST)).toEqual({
      gamesPlayed: 1,
      gamesWon: 0,
      nd: 0,
    });
    const rankedGames = await services().unifiedGroupService.rankings(OWNER, group.id, {
      cursor: 0,
      limit: 1,
    });
    expect(rankedGames.games.map((row) => row.id)).toEqual([1]);
    const ranked = await services().unifiedGroupService.rankings(OWNER, group.id, {
      gameId: 1,
      cursor: 0,
      limit: 1,
    });
    expect(ranked.players[0]).toMatchObject({
      userId: OWNER,
      gamesPlayed: 1,
      gamesWon: 1,
      nd: 0,
      provisional: true,
      left: false,
    });
    expect(ranked.nextCursor).toBe(1);
    const next = await services().unifiedGroupService.rankings(GUEST, group.id, {
      gameId: 1,
      cursor: 1,
      limit: 1,
    });
    expect(next.players[0]).toMatchObject({ userId: GUEST, gamesPlayed: 1, gamesWon: 0 });
    const resultDetail = await services().plannedEventService.tableDetail(OWNER, event.id, tableId);
    expect(resultDetail.ratingChanges).toHaveLength(2);
    expect(resultDetail.groupRatingChanges).toHaveLength(2);
    expect(resultDetail.resultProfiles?.map((row) => row.userId).sort()).toEqual(
      [OWNER, GUEST].sort(),
    );
    const repeat = await Promise.allSettled([
      transaction((s) =>
        s.plannedEventService.finalize(OWNER, event.id, {
          version: done.version,
          results: [first],
        }),
      ),
      transaction((s) =>
        s.plannedEventService.transition(OWNER, event.id, {
          action: "replan",
          version: done.version,
        }),
      ),
    ]);
    expect(repeat.every((result) => result.status === "rejected")).toBe(true);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(4);
  });
  it("source-searches accepted, pending and excluded people without injecting an unrelated owner", async () => {
    await db
      .collection(COLLECTIONS.USERS)
      .updateOne({ clerkId: GUEST }, { $set: { name: "Searchable Guest" } });
    await db
      .collection(COLLECTIONS.USERS)
      .updateOne({ clerkId: OTHER }, { $set: { name: "Unrelated Person" } });
    await db.collection(COLLECTIONS.FRIEND_REQUESTS).insertMany(
      [GUEST, OTHER].flatMap((target) => [
        {
          fromUserId: OWNER,
          toUserId: target,
          status: "accepted",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          fromUserId: target,
          toUserId: OWNER,
          status: "accepted",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    );
    const group = await transaction((s) =>
      s.unifiedGroupService.save(OWNER, {
        type: "PRIVATE",
        name: "Searchable group",
        invitedUserIds: [GUEST, OTHER],
      }),
    );
    const invitation = (await services().groupRecords.membership(group.id, GUEST))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(GUEST, group.id, GUEST, {
        action: "accept",
        version: invitation.version,
      }),
    );
    expect(
      (
        await services().unifiedGroupService.members(OWNER, group.id, "accepted", {
          limit: 1,
          query: "Searchable",
        })
      ).items.map((row) => row.userId),
    ).toEqual([GUEST]);
    expect(
      (
        await services().unifiedGroupService.members(OWNER, group.id, "accepted", {
          limit: 1,
          query: "Absent person",
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await services().unifiedGroupService.members(OWNER, group.id, "accepted", {
          limit: 1,
          query: "Searchable.*",
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await services().unifiedGroupService.members(OWNER, group.id, "accepted", {
          limit: 1,
          query: OWNER,
        })
      ).items.map((row) => row.userId),
    ).toEqual([OWNER]);
    expect(
      (
        await services().unifiedGroupService.members(OWNER, group.id, "pending", {
          limit: 1,
          query: "Unrelated",
        })
      ).items.map((row) => row.userId),
    ).toEqual([OTHER]);
    await transaction((s) =>
      s.unifiedGroupService.ban(OWNER, group.id, { userId: OTHER, until: null }),
    );
    expect(
      (
        await services().unifiedGroupService.members(OWNER, group.id, "banned", {
          limit: 1,
          query: "Unrelated",
        })
      ).items.map((row) => row.userId),
    ).toEqual([OTHER]);
    expect(
      (
        await services().unifiedGroupService.members(OWNER, group.id, "banned", {
          limit: 1,
          query: "Absent person",
        })
      ).items,
    ).toEqual([]);
  });

  it("refuses a target's frozen public ban atomically, then permits a timed ban only after termination without reviving membership", async () => {
    const bytes = await sharp({
      create: {
        width: 32,
        height: 16,
        channels: 4,
        background: { r: 80, g: 120, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const group = await transaction(async (s) => {
      const asset = await s.groupAssetService.start(OWNER, {
        mimeType: "image/png",
        byteLength: bytes.length,
      });
      await s.groupAssetService.append(OWNER, asset.id, {
        offset: 0,
        base64: bytes.toString("base64"),
      });
      await s.groupAssetService.complete(OWNER, asset.id);
      return s.unifiedGroupService.save(OWNER, {
        type: "PUBLIC",
        name: "Unified public club",
        logoAssetId: asset.id,
        location,
        invitedUserIds: [],
      });
    });
    await transaction((s) =>
      s.unifiedGroupService.review("moderator", group.id, {
        version: group.version,
        decision: "approve",
      }),
    );
    const outsider = await services().unifiedGroupService.detail(GUEST, group.id);
    expect(outsider).toMatchObject({
      role: "none",
      canViewMembers: true,
      canSocialInteract: false,
      canViewEvents: false,
      canViewRankings: false,
    });
    const publicRoster = await services().unifiedGroupService.members(GUEST, group.id, "accepted", {
      limit: 1,
    });
    expect(publicRoster.items.map((row) => row.userId)).toEqual([OWNER]);
    expect(publicRoster.items.every((row) => row.social === undefined)).toBe(true);
    for (const mode of ["pending", "banned"] as const)
      await expect(
        services().unifiedGroupService.members(GUEST, group.id, mode, { limit: 1 }),
      ).rejects.toMatchObject({ code: "GROUP_MEMBER_REQUIRED" });
    await expect(
      services().unifiedGroupService.rankings(GUEST, group.id, { cursor: 0, limit: 20 }),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_REQUIRED" });
    const request = await transaction((s) => s.unifiedGroupService.request(GUEST, group.id));
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "approve",
        version: request.version,
      }),
    );
    const input = {
      ...plannedInput(group.id),
      endsAt: "2030-06-03T21:00:00Z",
      bookingClosesAt: "2030-06-02T12:00:00Z",
    };
    input.tables[0].maxPlayers = input.tables[0].minPlayers;
    for (const bookingClosesAt of ["2030-06-03T12:00:00Z", "2030-06-02T22:30:00Z"])
      await expect(
        transaction((s) => s.plannedEventService.create(OWNER, { ...input, bookingClosesAt })),
      ).rejects.toMatchObject({ code: "EVENT_CUTOFF_BEFORE_START_REQUIRED" });
    await expect(
      transaction((s) =>
        s.plannedEventService.create(OWNER, { ...input, endsAt: "2030-06-03T23:30:00Z" }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_END_SAME_DAY_REQUIRED" });
    expect(
      (await services().plannedEventService.list(OWNER, { limit: 5 }, group.id)).items,
    ).toEqual([]);
    const demonstrationTableId = randomUUID();
    input.tables.push({
      ...input.tables[0],
      id: demonstrationTableId,
      name: "Overlapping demonstration",
      startsAt: "2030-06-03T16:30:00Z",
      demonstratorUserId: GUEST,
    });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const candidates = await services().plannedEventService.invitationCandidates(
      OWNER,
      event.id,
      tableId,
      { limit: 20 },
    );
    expect(candidates.items.find((row) => row.id === GUEST)?.invitationBlockReason).toBe(
      "TABLE_TIME_CONFLICT",
    );
    expect(
      await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).countDocuments({ eventId: event.id }),
    ).toBe(0);
    await expect(
      transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId, GUEST)),
    ).rejects.toMatchObject({ code: "TABLE_TIME_CONFLICT" });
    expect((await services().eventRecords.table(tableId))?.startsAt).toBe(
      "2030-06-03T16:00:00.000Z",
    );
    const { groupId: _groupId, ...editable } = input;
    await expect(
      transaction((s) =>
        s.plannedEventService.update(OWNER, event.id, {
          ...editable,
          version: event.version,
          tables: [],
          removedTableIds: [],
          endsAt: "2030-06-03T23:30:00Z",
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_END_SAME_DAY_REQUIRED" });
    expect((await services().eventRecords.find(event.id))?.version).toBe(event.version);
    await transaction((s) =>
      s.plannedEventService.update(OWNER, event.id, {
        ...editable,
        version: event.version,
        tables: [],
        removedTableIds: [demonstrationTableId],
      }),
    );
    const afterRemoval = await services().plannedEventService.invitationCandidates(
      OWNER,
      event.id,
      tableId,
      { limit: 20 },
    );
    expect(afterRemoval.items.find((row) => row.id === GUEST)?.invitationBlockReason).toBeNull();
    expect(
      (
        await services().plannedEventService.list(
          OWNER,
          { limit: 5, periods: ["future"] },
          group.id,
        )
      ).items.map((row) => row.id),
    ).toEqual([event.id]);
    expect(
      (await services().plannedEventService.list(OWNER, { limit: 5, periods: ["past"] }, group.id))
        .items,
    ).toEqual([]);
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId));
    await transaction((s) => s.plannedEventService.register(GUEST, event.id, tableId));
    const frozen = await confirm(event.id);
    vi.setSystemTime(new Date(input.bookingClosesAt));
    await expect(
      transaction((s) =>
        s.unifiedGroupService.ban(OWNER, group.id, { userId: GUEST, until: null }),
      ),
    ).rejects.toMatchObject({ code: "BAN_FROZEN_PARTICIPATION" });
    expect(await db.collection(COLLECTIONS.GROUP_BANS).countDocuments()).toBe(0);
    expect((await services().groupRecords.membership(group.id, GUEST))?.status).toBe("ACCEPTED");
    expect((await services().eventRecords.table(tableId))?.confirmed?.playerIds).toEqual([
      OWNER,
      GUEST,
    ]);
    await transaction((s) =>
      s.plannedEventService.finalize(OWNER, event.id, {
        version: frozen.version,
        results: [
          {
            tableId,
            lowerWins: false,
            entries: [
              { userId: OWNER, score: null },
              { userId: GUEST, score: null },
            ],
            tieBreaks: [],
          },
        ],
      }),
    );
    const terminated = await services().eventRecords.table(tableId);
    const until = "2030-06-02T13:00:00Z";
    await transaction((s) => s.unifiedGroupService.ban(OWNER, group.id, { userId: GUEST, until }));
    expect((await services().groupRecords.membership(group.id, GUEST))?.status).toBe("LEFT");
    await expect(
      services().unifiedGroupService.members(GUEST, group.id, "accepted", { limit: 20 }),
    ).rejects.toMatchObject({ code: "GROUP_NOT_FOUND" });
    expect(await services().eventRecords.table(tableId)).toEqual(terminated);
    vi.setSystemTime(new Date(until));
    expect((await services().groupRecords.membership(group.id, GUEST))?.status).toBe("LEFT");
    await expect(services().plannedEventService.detail(GUEST, event.id)).rejects.toMatchObject({
      code: "GROUP_MEMBER_REQUIRED",
    });
    const renewed = await transaction((s) => s.unifiedGroupService.request(GUEST, group.id));
    expect(renewed.status).toBe("PENDING");
    expect(renewed.kind).toBe("REQUEST");
    vi.setSystemTime(new Date("2030-06-04T00:00:00Z"));
    expect(
      (
        await services().plannedEventService.list(OWNER, { limit: 5, periods: ["past"] }, group.id)
      ).items.map((row) => row.id),
    ).toEqual([event.id]);
    expect(
      (
        await services().plannedEventService.list(
          OWNER,
          { limit: 5, periods: ["future"] },
          group.id,
        )
      ).items,
    ).toEqual([]);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
  });
});
