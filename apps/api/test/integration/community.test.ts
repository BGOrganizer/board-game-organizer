import { randomUUID } from "node:crypto";
import type {
  CreatePlannedEventInput,
  EventProposalResponse,
  GroupMembership,
  JoinTableInput,
} from "@board-game-organizer/schemas";
import {
  bggPickerQuerySchema,
  groupRecordMemberRoles,
  groupRecordSchema,
  notificationItemId,
  registerMatchResultsSchema,
  type SaveEventInput,
  saveEventSchema,
  updateEventSchema,
} from "@board-game-organizer/schemas";
import { eventParticipation, normalizeMatchScore } from "@board-game-organizer/shared";
import { type ClientSession, type Db, MongoClient } from "mongodb";
import sharp from "sharp";
import { type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { recordServices } from "../../src/app/lib/community/record-services";
import { RelationshipRepository } from "../../src/app/lib/contacts/relationship.repository";
import { COLLECTIONS } from "../../src/app/lib/db";
import { deadlineServiceConfigured } from "../../src/app/lib/events/event-deadlines";
import {
  type EventRecordPage,
  EventRecordsRepository,
} from "../../src/app/lib/events/event-records.repository";
import { EventsRepository } from "../../src/app/lib/events/events.repository";
import { EventsService } from "../../src/app/lib/events/events.service";
import { bggPickerPage } from "../../src/app/lib/games/bgg-picker";
import { BoardGamesRepository } from "../../src/app/lib/games/boardGames.repository";
import { GroupRecordsRepository } from "../../src/app/lib/groups/group-records.repository";
import { MatchService } from "../../src/app/lib/matches/match.service";
import { MatchInvitationsRepository } from "../../src/app/lib/matches/match-invitations.repository";
import { MatchesRepository } from "../../src/app/lib/matches/matches.repository";
import { migrate } from "../../src/app/lib/migrate";
import { NotificationAttentionRepository } from "../../src/app/lib/notifications/notification-attention.repository";
import { NotificationsRepository } from "../../src/app/lib/notifications/notifications.repository";
import { OrganizationAssetsRepository } from "../../src/app/lib/organizations/organization-assets.repository";
import { OrganizationAssetsService } from "../../src/app/lib/organizations/organization-assets.service";
import { OrganizationsRepository } from "../../src/app/lib/organizations/organizations.repository";
import { OrganizationsService } from "../../src/app/lib/organizations/organizations.service";
import { ProfileService } from "../../src/app/lib/profile/profile.service";
import { ProfileActivitiesRepository } from "../../src/app/lib/profile/profile-activities.repository";
import { RatingsRepository } from "../../src/app/lib/ratings/ratings.repository";
import { UsersRepository } from "../../src/app/lib/users/users.repository";
import { mongodbContainer } from "../../testing/mongodb-container";

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
    gameVotes: Object.fromEntries(
      table.games.length > 1
        ? table.games.map((game) => [String(game.gameId), "YES" as const])
        : [],
    ),
    ...(group?.type !== "PUBLIC"
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
  container = await mongodbContainer()
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
  it("keeps owner-only actionable Group requests complete, independent of unread state and source pages, excluding live bans", async () => {
    const group = groupRecordSchema.parse({
      id: randomUUID(),
      type: "PUBLIC",
      adminUserId: OWNER,
      approved: { name: "Request review club", location, logoAssetId: randomUUID() },
      reservedNames: ["request review club"],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.collection(COLLECTIONS.GROUPS).insertOne(group);
    const requests: GroupMembership[] = [];
    for (const actor of [GUEST, OTHER, OUTSIDER])
      requests.push(await transaction((s) => s.unifiedGroupService.request(actor, group.id)));
    const detail = () => services().unifiedGroupService.detail(OWNER, group.id);
    expect((await detail()).pendingRequestCount).toBe(3);
    const firstPage = await services().unifiedGroupService.members(OWNER, group.id, "pending", {
      limit: 1,
    });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    await services().notifications.markAllRead(OWNER);
    expect((await detail()).pendingRequestCount).toBe(3);
    expect(
      (await services().unifiedGroupService.detail(GUEST, group.id)).pendingRequestCount,
    ).toBeNull();
    expect(
      (await services().unifiedGroupService.moderationDetail("moderator", group.id))
        .pendingRequestCount,
    ).toBeNull();
    const ban = {
      id: randomUUID(),
      groupId: group.id,
      userId: OUTSIDER,
      adminUserId: OWNER,
      until: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // A historical pending row may survive a ban: it must not create an actionable request.
    await services().groupRecords.saveBan(ban);
    expect((await detail()).pendingRequestCount).toBe(2);
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "approve",
        version: requests[0].version,
      }),
    );
    expect((await detail()).pendingRequestCount).toBe(1);
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, OTHER, {
        action: "reject",
        version: requests[1].version,
      }),
    );
    expect((await detail()).pendingRequestCount).toBe(0);
    await services().groupRecords.saveBan({ ...ban, revokedAt: new Date().toISOString() });
    expect((await detail()).pendingRequestCount).toBe(1);
    await services().groupRecords.saveBan({
      ...ban,
      until: new Date(Date.now() - 1).toISOString(),
    });
    expect((await detail()).pendingRequestCount).toBe(1);
    expect(await db.collection(COLLECTIONS.GROUPS).findOne({ id: group.id })).not.toHaveProperty(
      "pendingRequestCount",
    );
  });
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
    const first = await services().plannedEventService.personalTables(OTHER, {
      limit: 1,
      section: "waiting",
    });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await services().plannedEventService.personalTables(OTHER, {
      limit: 1,
      section: "waiting",
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
        await services().plannedEventService.personalTables(OTHER, {
          limit: 20,
          query: "first",
          section: "waiting",
        })
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
    // New choices without catalog timing use the automatic fallback, not the old manual hint.
    expect((await services().eventRecords.table(tableId))?.games).toEqual([
      { gameId: 1, durationMinutes: 120, durationSource: "DEFAULT" },
    ]);
    // Simulate a valid historical record; editing it without a manual-duration control retains it.
    const historical = await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .updateOne(
        { id: tableId, eventId: event.id },
        { $set: { games: [{ gameId: 1, durationMinutes: 60, durationSource: "MANUAL" }] } },
      );
    expect(historical.modifiedCount).toBe(1);
    {
      const { groupId: _context, ...fields } = input;
      await transaction((s) =>
        s.plannedEventService.update(OWNER, event.id, {
          ...fields,
          version: event.version,
          removedTableIds: [],
          tables: input.tables.map((row) => ({
            ...row,
            games: row.games.map(({ gameId }) => ({ gameId })),
          })),
        }),
      );
    }
    expect((await services().eventRecords.table(tableId))?.games).toEqual([
      { gameId: 1, durationMinutes: 60, durationSource: "MANUAL" },
    ]);
    expect((await services().eventRecords.find(event.id))?.dates).toEqual(input.dates);
    expect(
      (await services().plannedEventService.tables(OWNER, event.id, { limit: 1 })).items[0]
        .eventSchedule,
    ).toMatchObject({
      localStartsAt: "2030-06-03T18:15",
      location: { id: input.locations[0].id },
      dateCount: 2,
      locationCount: 2,
    });
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
      await expect(
        transaction((s) =>
          s.plannedEventService.vote(user, event.id, {
            kind: "game",
            tableId,
            gameId: 1,
            vote: "YES",
          }),
        ),
      ).rejects.toMatchObject({ code: "FIXED_OPTION" });
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
    ).toEqual({ YES: 0, NO: 0, IF_NEEDED: 0, UNKNOWN: 2 });
    await expect(
      services().plannedEventService.seats(GUEST, event.id, tableId, { limit: 20 }, true),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    const confirmed = await confirm(event.id);
    expect((await services().eventRecords.table(tableId))?.confirmed?.startsAt).toBe(
      "2030-06-04T02:30:00.000Z",
    );
    expect(
      (await services().plannedEventService.tableDetail(OWNER, event.id, tableId)).eventSchedule,
    ).toMatchObject({
      localStartsAt: "2030-06-03T22:30",
      location: { id: newVenue },
      dateCount: 1,
      locationCount: 1,
    });
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
  it("source-pages Available only for unregistered accepted Group members and a strictly open planning cutoff", async () => {
    const group = await privateGroup();
    const event = await transaction((s) =>
      s.plannedEventService.create(OWNER, plannedInput(group.id)),
    );
    const base = await services().eventRecords.find(event.id);
    if (!base) throw new Error("Missing Event fixture");
    await db.collection(COLLECTIONS.EVENTS).deleteOne({ id: event.id });
    const publicId = randomUUID();
    const rawGroup = await db.collection(COLLECTIONS.GROUPS).findOne({ id: group.id });
    if (!rawGroup) throw new Error("Missing Group fixture");
    const { _id: _rawId, ...publicGroup } = rawGroup;
    await db.collection(COLLECTIONS.GROUPS).insertOne({
      ...publicGroup,
      id: publicId,
      type: "PUBLIC",
      approved: { name: "Public fixture", location },
    });
    const membership = await services().groupRecords.membership(group.id, GUEST);
    if (!membership) throw new Error("Missing membership fixture");
    const publicMembership = { ...membership, id: randomUUID(), groupId: publicId };
    await services().groupRecords.saveMembership(publicMembership);
    const now = new Date();
    const candidates = [
      { name: "Eligible private" },
      {
        name: "Eligible public",
        groupId: publicId,
        bookingClosesAt: new Date(now.getTime() + 60_000).toISOString(),
      },
      { name: "Confirmed", status: "CONFIRMED" },
      { name: "Terminated", status: "TERMINATED" },
      { name: "Standalone", groupId: null, adminUserId: GUEST },
      { name: "Exact cutoff", groupId: publicId, bookingClosesAt: now.toISOString() },
      { name: "Invalid cutoff", groupId: publicId, bookingClosesAt: "invalid" },
    ].map((changes, i) => ({
      ...base,
      ...changes,
      id: randomUUID(),
      createdAt: new Date(now.getTime() + i).toISOString(),
    }));
    await db.collection(COLLECTIONS.EVENTS).insertMany(candidates);
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const rows = await services().eventRecords.list(GUEST, {
        section: "available",
        limit: 1,
        cursor,
      });
      const row = rows[0];
      if (!row) break;
      names.push(row.name);
      cursor = `${row.createdAt}|${row.id}`;
    } while (names.length < 10);
    expect(names).toEqual(["Eligible public", "Eligible private"]);
    expect(
      await services().eventRecords.list(OUTSIDER, { section: "available", limit: 1 }),
    ).toEqual([]);
    await services().groupRecords.saveMembership({
      ...publicMembership,
      status: "PENDING",
    });
    expect(
      (await services().eventRecords.list(GUEST, { section: "available", limit: 1 })).map(
        (row) => row.name,
      ),
    ).toEqual(["Eligible private"]);
    await services().groupRecords.saveMembership({ ...membership, role: "MODERATOR" });
    expect(await services().eventRecords.list(GUEST, { section: "available", limit: 1 })).toEqual(
      [],
    );
    expect(
      (await services().eventRecords.list(GUEST, { section: "mine", limit: 20 })).map(
        (row) => row.name,
      ),
    ).toEqual(
      expect.arrayContaining(["Eligible private", "Confirmed", "Terminated", "Standalone"]),
    );
  });
  it("source-pages main Tables by frozen player membership, excluding planning, queue and demonstrator-only duty", async () => {
    const group = await privateGroup();
    const event = await transaction((s) =>
      s.plannedEventService.create(OWNER, plannedInput(group.id)),
    );
    const base = await services().eventRecords.find(event.id),
      table = await services().eventRecords.table(tableId);
    if (!base || !table) throw new Error("Missing planning fixture");
    const states = ["PLANNING", "CONFIRMED", "CONFIRMED", "CONFIRMED", "TERMINATED"] as const;
    const ids: string[] = [];
    for (const [i, status] of states.entries()) {
      const eventId = randomUUID(),
        id = randomUUID();
      ids.push(id);
      const at = new Date(Date.now() + i).toISOString();
      await db
        .collection(COLLECTIONS.EVENTS)
        .insertOne({ ...base, id: eventId, status, createdAt: at });
      await db.collection(COLLECTIONS.EVENT_TABLES).insertOne({
        ...table,
        id,
        eventId,
        createdAt: at,
        ...(i === 2 ? { demonstratorUserId: GUEST } : {}),
        ...(i > 0
          ? {
              confirmed: {
                gameId: 1,
                startsAt: "2030-06-03T18:00:00.000Z",
                playerIds: i >= 3 ? [GUEST, OTHER] : [OWNER, OTHER],
              },
            }
          : {}),
      });
      await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).insertOne({
        id: randomUUID(),
        eventId,
        tableId: id,
        userId: GUEST,
        status: i === 0 ? "PENDING" : "ACCEPTED",
      });
    }
    const first = await services().eventRecords.personalTables(GUEST, { limit: 1 });
    expect(first.map((row) => row.id)).toEqual([ids[4], ids[3]]);
    const page = await services().eventRecords.personalTables(GUEST, {
      limit: 1,
      cursor: `${first[0].createdAt}|${first[0].id}`,
    });
    expect(page.map((row) => row.id)).toEqual([ids[3]]);
    expect(
      await services().eventRecords.personalTables(GUEST, { limit: 1, statuses: ["PLANNING"] }),
    ).toEqual([]);
  });
  it("routes list attention by current participation eligibility without dropping direct Table notices", async () => {
    const group = await privateGroup();
    const event = await transaction((s) =>
      s.plannedEventService.create(OWNER, plannedInput(group.id)),
    );
    for (const tableNotice of [false, true])
      await services().notifications.notify({
        kind: "event_updated",
        recipientUserId: GUEST,
        actorUserId: OWNER,
        resourceName: "Changed fixture",
        resourceHref: tableNotice ? `/events/${event.id}/tables/${tableId}` : `/events/${event.id}`,
      });
    const targets = [
      { kind: "table", id: tableId },
      { kind: "event-list", id: "available" },
      { kind: "event-list", id: "mine" },
    ] as const;
    const read = async () =>
      (await new NotificationAttentionRepository(db).snapshot(GUEST, targets)).snapshot;
    const count = (snapshot: Awaited<ReturnType<typeof read>>, id: string) =>
      snapshot.targets.find((row) => row.target.kind === "event-list" && row.target.id === id)
        ?.count ?? 0;
    const planning = await read();
    expect(planning.summary.tables).toBe(0);
    expect(count(planning, "available")).toBeGreaterThan(0);
    expect(planning.targets.find((row) => row.target.kind === "table")?.count).toBeGreaterThan(0);
    const membership = await services().groupRecords.membership(group.id, GUEST);
    if (!membership) throw new Error("Missing member fixture");
    await services().groupRecords.saveMembership({ ...membership, role: "MODERATOR" });
    const managed = await read();
    expect(count(managed, "available")).toBe(0);
    expect(count(managed, "mine")).toBeGreaterThan(0);
    await db
      .collection(COLLECTIONS.EVENTS)
      .updateOne({ id: event.id }, { $set: { status: "CONFIRMED" } });
    await db.collection(COLLECTIONS.EVENT_TABLES).updateOne(
      { id: tableId },
      {
        $set: {
          confirmed: {
            gameId: 1,
            startsAt: "2030-06-03T18:00:00.000Z",
            playerIds: [GUEST, OWNER],
          },
        },
      },
    );
    expect((await read()).summary.tables).toBeGreaterThan(0);
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .updateOne({ id: tableId }, { $set: { "confirmed.playerIds": [OWNER, OTHER] } });
    const dutyOnly = await read();
    expect(dutyOnly.summary.tables).toBe(0);
    expect(dutyOnly.targets.find((row) => row.target.kind === "table")?.count).toBeGreaterThan(0);
    expect(dutyOnly.unreadCount).toBe(planning.unreadCount);
  });
  it("persists a reduced Assisted allocation when switching to Manual and saves a free-seat promotion", async () => {
    const group = await privateGroup();
    await db.collection(COLLECTIONS.BOARD_GAMES).updateOne(
      { id: 1 },
      {
        $set: {
          minPlayers: 2,
          maxPlayers: 3,
          suggestedPlayers: {
            totalVotes: 10,
            fetchedAt: new Date().toISOString(),
            rows: [
              {
                players: 2,
                orMore: false,
                best: 10,
                recommended: 0,
                notRecommended: 0,
                sampleCount: 10,
              },
              {
                players: 3,
                orMore: false,
                best: 0,
                recommended: 10,
                notRecommended: 0,
                sampleCount: 10,
              },
            ],
          },
        },
      },
    );
    const input = plannedInput(group.id);
    input.tables[0].maxPlayers = 3;
    input.planningMode = "ASSISTED";
    input.playerPreference = "BEST";
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    expect(event.allowBestReduction).toBe(true);
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId));
    for (const userId of [GUEST, OTHER]) {
      const invitation = await transaction((s) =>
        s.plannedEventService.register(OWNER, event.id, tableId, userId),
      );
      const choices = await participation(event.id, tableId);
      await transaction((s) =>
        s.plannedEventService.registrationAction(userId, invitation.id, {
          action: "accept",
          version: invitation.version,
          participation: choices,
        }),
      );
    }
    const assisted = await transaction((s) =>
      s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId),
    );
    expect(assisted.seatedCount).toBe(2);
    const { groupId: _group, tables: _tables, ...fields } = input;
    await transaction((s) =>
      s.plannedEventService.update(OWNER, event.id, {
        ...fields,
        planningMode: "MANUAL",
        version: assisted.version,
        tables: [],
        removedTableIds: [],
      }),
    );
    const manual = await transaction((s) =>
      s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId),
    );
    expect(manual.seatedCount).toBe(2);
    expect((await services().eventRecords.table(tableId))?.seatedCapacity).toBe(2);
    expect(manual.registrations.map((row) => row.id)).toEqual(
      assisted.registrations.map((row) => row.id),
    );
    await transaction((s) =>
      s.plannedEventService.reorderSeats(OWNER, event.id, tableId, {
        version: manual.version,
        allocationKey: manual.allocationKey,
        seatedCount: 3,
        registrations: manual.registrations.map((row) => ({
          id: row.id,
          version: row.version,
          locked: false,
        })),
      }),
    );
    expect(
      (await transaction((s) => s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId)))
        .seatedCount,
    ).toBe(3);
  });
  it("rejects a transactional capacity shrink below an exact locked slot under Best reduction", async () => {
    const group = await privateGroup();
    const input = plannedInput(group.id);
    input.tables[0].maxPlayers = 3;
    input.planningMode = "ASSISTED";
    input.playerPreference = "BEST";
    input.allowBestReduction = true;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId));
    for (const userId of [GUEST, OTHER]) {
      const invitation = await transaction((s) =>
        s.plannedEventService.register(OWNER, event.id, tableId, userId),
      );
      const choices = await participation(event.id, tableId);
      await transaction((s) =>
        s.plannedEventService.registrationAction(userId, invitation.id, {
          action: "accept",
          version: invitation.version,
          participation: choices,
        }),
      );
    }
    const snapshot = await transaction((s) =>
      s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId),
    );
    const saved = await transaction((s) =>
      s.plannedEventService.reorderSeats(OWNER, event.id, tableId, {
        version: snapshot.version,
        allocationKey: snapshot.allocationKey,
        seatedCount: 3,
        registrations: snapshot.registrations.map((row, index) => ({
          id: row.id,
          version: row.version,
          locked: index === 2,
        })),
      }),
    );
    await db.collection(COLLECTIONS.BOARD_GAMES).updateOne(
      { id: 1 },
      {
        $set: {
          minPlayers: 2,
          maxPlayers: 3,
          suggestedPlayers: {
            totalVotes: 10,
            fetchedAt: new Date().toISOString(),
            rows: [2, 3].map((players) => ({
              players,
              orMore: false,
              best: players === 2 ? 10 : 0,
              recommended: players === 3 ? 10 : 0,
              notRecommended: 0,
              sampleCount: 10,
            })),
          },
        },
      },
    );
    const { groupId: _group, ...fields } = input;
    await expect(
      transaction((s) =>
        s.plannedEventService.update(OWNER, event.id, {
          ...fields,
          version: saved.version,
          tables: [{ ...input.tables[0], maxPlayers: 2 }],
          removedTableIds: [],
        }),
      ),
    ).rejects.toMatchObject({ message: "LOCKED_SEAT_PROTECTED" });
    expect((await services().eventRecords.table(tableId))?.maxPlayers).toBe(3);
    const after = await transaction((s) =>
      s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId),
    );
    expect(after.seatedCount).toBe(3);
    expect(after.registrations[2]).toMatchObject({ id: saved.registrations[2].id, locked: true });
  });
  it("serializes seat order writes, rejects stale races and compacts locks after departure", async () => {
    const group = await privateGroup();
    const input = plannedInput(group.id);
    input.planningMode = "MANUAL";
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, tableId, undefined));
    for (const userId of [GUEST, OTHER]) {
      const invitation = await transaction((s) =>
        s.plannedEventService.register(OWNER, event.id, tableId, userId),
      );
      const choices = await participation(event.id, tableId);
      await transaction((s) =>
        s.plannedEventService.registrationAction(userId, invitation.id, {
          action: "accept",
          version: invitation.version,
          participation: choices,
        }),
      );
    }
    const snapshot = await transaction((s) =>
      s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId),
    );
    const request = {
      version: snapshot.version,
      allocationKey: snapshot.allocationKey,
      registrations: snapshot.registrations.map((row, index) => ({
        id: row.id,
        version: row.version,
        locked: index === 1,
      })),
    };
    const raced = await Promise.allSettled([
      transaction((s) => s.plannedEventService.reorderSeats(OWNER, event.id, tableId, request)),
      transaction((s) => s.plannedEventService.reorderSeats(OWNER, event.id, tableId, request)),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = await transaction((s) =>
      s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId),
    );
    expect(saved.registrations[1]).toMatchObject({ userId: GUEST, locked: true });
    const first = saved.registrations[0];
    await transaction((s) =>
      s.plannedEventService.registrationAction(OWNER, first.id, {
        action: "cancel",
        version: first.version,
      }),
    );
    const compacted = await transaction((s) =>
      s.plannedEventService.seatOrderSnapshot(OWNER, event.id, tableId),
    );
    expect(compacted.registrations.map((row) => row.userId)).toEqual([GUEST, OTHER]);
    expect(compacted.registrations[0].locked).toBe(true);
    await expect(
      transaction((s) => s.plannedEventService.reorderSeats(GUEST, event.id, tableId, request)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("persists standalone flexible proposals with sole-admin authority, source paging, fresh seats and atomic rollback", async () => {
    await transaction((s) => s.relationships.becomeFriends(OWNER, GUEST));
    await transaction((s) => s.relationships.becomeFriends(OWNER, OTHER));
    const input = plannedInput();
    input.allowParticipantDates = true;
    input.allowParticipantLocations = true;
    input.dates.push({ id: secondId, day: "2030-06-04", startTime: "19:00" });
    input.tables[0].allowParticipantGames = true;
    input.tables.push({ ...input.tables[0], id: secondId, name: "Retained table" });
    await db
      .collection(COLLECTIONS.BOARD_GAMES)
      .insertOne({ id: 2, name: "Proposal base game", isExpansion: false });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    expect(event).toMatchObject({ groupId: null, groupType: null, visibility: "PRIVATE" });
    for (const userId of [GUEST, OTHER]) {
      const invitation = await transaction((s) =>
        s.plannedEventService.register(OWNER, event.id, tableId, userId),
      );
      const choices = await participation(event.id, tableId);
      await transaction((s) =>
        s.plannedEventService.registrationAction(userId, invitation.id, {
          action: "accept",
          version: invitation.version,
          participation: choices,
        }),
      );
    }
    const current = (await services().eventRecords.find(event.id))!;
    const payloads = [
      { kind: "date" as const, day: "2030-06-05", startTime: "20:00" },
      {
        kind: "location" as const,
        location: {
          ...location,
          id: randomUUID(),
          address: "Verified address 20",
          latitude: 41.91,
        },
      },
      { kind: "game" as const, tableId, gameId: 2 },
    ];
    const rows: EventProposalResponse[] = [];
    for (const payload of payloads) {
      const row = await transaction((s) =>
        s.plannedEventService.submitProposal(GUEST, event.id, {
          eventVersion: current.version,
          clientRequestId: randomUUID(),
          payload,
        }),
      );
      expect(row.groupId).toBeNull();
      expect((await services().eventRecords.proposal(row.id))?.groupId).toBeNull();
      rows.push(row);
    }
    for (const [from, to] of [
      [OWNER, GUEST],
      [GUEST, OWNER],
    ]) {
      await transaction((s) => s.relationships.block(from, to));
      expect((await services().plannedEventService.list(GUEST, { limit: 1 })).items).toEqual([]);
      expect(
        (await services().plannedEventService.personalTables(GUEST, { limit: 1 })).items,
      ).toEqual([]);
      await expect(services().plannedEventService.detail(GUEST, event.id)).rejects.toMatchObject({
        code: "EVENT_NOT_FOUND",
      });
      await expect(
        services().plannedEventService.proposalDetail(GUEST, event.id, rows[0].id),
      ).rejects.toMatchObject({
        code: "EVENT_NOT_FOUND",
      });
      expect(
        (await services().plannedEventService.list(OTHER, { limit: 1 })).items.map((row) => row.id),
      ).toEqual([event.id]);
      expect((await services().plannedEventService.detail(OWNER, event.id)).canEdit).toBe(true);
      await transaction((s) => s.relationships.unblock(from, to));
    }
    await transaction((s) =>
      s.plannedEventService.submitProposal(GUEST, event.id, {
        eventVersion: current.version,
        clientRequestId: randomUUID(),
        payload: { kind: "date", day: "2030-06-06", startTime: "20:00" },
      }),
    );
    const page = await transaction((s) =>
      s.plannedEventService.proposals(GUEST, event.id, { mode: "mine", kind: "date", limit: 1 }),
    );
    expect(page.groupId).toBeNull();
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    const next = await transaction((s) =>
      s.plannedEventService.proposals(GUEST, event.id, {
        mode: "mine",
        kind: "date",
        limit: 1,
        cursor: page.nextCursor!,
      }),
    );
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).not.toBe(page.items[0].id);
    await expect(
      transaction((s) =>
        s.plannedEventService.proposals(OTHER, event.id, {
          mode: "review",
          kind: "date",
          limit: 1,
        }),
      ),
    ).rejects.toMatchObject({ message: "EVENT_ADMIN_REQUIRED" });
    const beforeNotices = await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({});
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.reviewProposal(OWNER, event.id, rows[0].id, {
          action: "accept",
          eventVersion: current.version,
          version: 1,
        });
        throw new Error("standalone proposal rollback");
      }),
    ).rejects.toThrow("standalone proposal rollback");
    expect(await services().eventRecords.find(event.id)).toEqual(current);
    expect((await services().eventRecords.proposal(rows[0].id))?.status).toBe("PENDING");
    expect(await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({})).toBe(beforeNotices);
    for (const row of rows) {
      const latest = (await services().eventRecords.find(event.id))!;
      const receipt = await transaction((s) =>
        s.plannedEventService.reviewProposal(OWNER, event.id, row.id, {
          action: "accept",
          eventVersion: latest.version,
          version: 1,
        }),
      );
      expect(receipt.proposal).toMatchObject({ groupId: null, status: "ACCEPTED" });
      expect(
        (await transaction((s) => s.plannedEventService.proposalDetail(GUEST, event.id, row.id)))
          .proposal.id,
      ).toBe(row.id);
    }
    const latest = (await services().eventRecords.find(event.id))!;
    expect(latest.dates).toHaveLength(3);
    expect(latest.locations).toHaveLength(2);
    expect((await services().eventRecords.table(tableId))?.games.map((g) => g.gameId)).toEqual([
      1, 2,
    ]);
    expect(await db.collection(COLLECTIONS.GROUPS).countDocuments({})).toBe(0);
    const pending = (
      await transaction((s) =>
        s.plannedEventService.proposals(GUEST, event.id, { mode: "mine", kind: "date", limit: 5 }),
      )
    ).items.find((row) => row.status === "PENDING")!;
    const own = (await services().eventRecords.userRegistration(tableId, GUEST))!;
    await transaction((s) =>
      s.plannedEventService.registrationAction(GUEST, own.id, {
        action: "cancel",
        version: own.version,
      }),
    );
    const afterLeave = (await services().eventRecords.find(event.id))!;
    await expect(
      transaction((s) =>
        s.plannedEventService.reviewProposal(OWNER, event.id, pending.id, {
          action: "accept",
          eventVersion: afterLeave.version,
          version: 1,
        }),
      ),
    ).rejects.toMatchObject({ message: "PROPOSAL_SEAT_REQUIRED" });
    await transaction((s) =>
      s.plannedEventService.reviewProposal(OWNER, event.id, pending.id, {
        action: "reject",
        eventVersion: afterLeave.version,
        version: 1,
      }),
    );
    await transaction((s) =>
      s.plannedEventService.removeTable(OWNER, event.id, tableId, { version: afterLeave.version }),
    );
    const beforeDelete = (await services().eventRecords.find(event.id))!;
    await transaction((s) =>
      s.plannedEventService.remove(OWNER, event.id, { version: beforeDelete.version }),
    );
    expect(await services().eventRecords.find(event.id)).toBeNull();
  });
  it("rejects changed Event visibility before domain writes and preserves same/omitted historical normalization", async () => {
    const groupId = randomUUID(),
      at = new Date().toISOString();
    await db.collection(COLLECTIONS.GROUPS).insertOne({
      id: groupId,
      type: "PUBLIC",
      adminUserId: OWNER,
      version: 1,
      createdAt: at,
      updatedAt: at,
      approved: { name: "Public visibility fixture", location, logoAssetId: randomUUID() },
    });
    const input = {
      ...plannedInput(groupId),
      visibility: "PRIVATE" as const,
      endsAt: "2030-06-03T21:00:00Z",
      bookingClosesAt: "2030-06-02T08:00:00Z",
    };
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const edit = { ...input, version: event.version, tables: [], removedTableIds: [] };
    const { groupId: _groupId, ...fields } = edit;
    const beforeNotices = await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({});
    await expect(
      transaction((s) =>
        s.plannedEventService.update(OWNER, event.id, { ...fields, visibility: "PUBLIC" }),
      ),
    ).rejects.toMatchObject({ message: "EVENT_VISIBILITY_IMMUTABLE" });
    expect((await services().eventRecords.find(event.id))?.version).toBe(event.version);
    expect(await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({})).toBe(beforeNotices);
    const same = await transaction((s) => s.plannedEventService.update(OWNER, event.id, fields));
    const { visibility: _visibility, ...omitted } = fields;
    const saved = await transaction((s) =>
      s.plannedEventService.update(OWNER, event.id, { ...omitted, version: same.version }),
    );
    expect(saved.visibility).toBe("PRIVATE");
    await db
      .collection(COLLECTIONS.EVENTS)
      .updateOne({ id: event.id }, { $unset: { visibility: "" } });
    const historical = await transaction((s) =>
      s.plannedEventService.update(OWNER, event.id, { ...omitted, version: saved.version }),
    );
    expect(historical.visibility).toBe("PUBLIC");
  });
  it("event access expansion: source-deduplicates accepted participant collection unions before paging, including queue but not pending invites", async () => {
    const group = await privateGroup(),
      event = await transaction((s) => s.plannedEventService.create(OWNER, plannedInput(group.id)));
    for (const user of [GUEST, OTHER, OWNER]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    const at = new Date().toISOString();
    await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).insertOne({
      id: randomUUID(),
      eventId: event.id,
      tableId,
      userId: DEMO,
      invitedBy: OWNER,
      kind: "INVITATION",
      status: "PENDING",
      priorityAt: at,
      sequence: 4,
      version: 1,
      gameVotes: {},
      createdAt: at,
      updatedAt: at,
    });
    for (const [userId, ids] of [
      [OWNER, [1, 2]],
      [GUEST, [1, 3]],
      [OTHER, [3, 4]],
      [DEMO, [5]],
    ] as const) {
      await db
        .collection(COLLECTIONS.BGG_ACCOUNTS)
        .insertOne({ userId, active: { snapshot: `active-${userId}` } });
      for (const gameId of ids)
        await db.collection(COLLECTIONS.BGG_COLLECTION_GAMES).insertOne({
          userId,
          snapshot: `active-${userId}`,
          gameId,
          name: ["", "Alpha", "Beta", "Gamma", "Delta", "Pending-only"][gameId],
          isExpansion: false,
          subtype: "boardgame",
          year: 2020,
          imageUrl: null,
        });
    }
    for (let id = 1; id <= 6; id++)
      await db.collection(COLLECTIONS.BOARD_GAMES).updateOne(
        { id },
        {
          $set: {
            name: ["", "Alpha", "Beta", "Gamma", "Delta", "Pending-only", "Catalog-only"][id],
            isExpansion: false,
            image: null,
            imageCheckedAt: at,
            minPlayMinutes: 60,
            maxPlayMinutes: 60,
            durationCheckedAt: at,
            minPlayers: 2,
            maxPlayers: 4,
            playerCountsCheckedAt: at,
          },
        },
        { upsert: true },
      );
    const input = bggPickerQuerySchema.parse({
      participants: "1",
      participantEventId: event.id,
      participantTableId: tableId,
      limit: 1,
    });
    const found: number[] = [];
    let cursor: string | undefined;
    do {
      const page = await bggPickerPage(db, OWNER, { ...input, cursor });
      expect(page.items.every((game) => game.source === "collection")).toBe(true);
      found.push(...page.items.map((game) => game.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(found).toEqual([1, 2, 4, 3]);
    const first = await bggPickerPage(db, OWNER, input);
    expect(
      (
        await bggPickerPage(db, OWNER, bggPickerQuerySchema.parse({ collection: "1", limit: 50 }))
      ).items.map((game) => game.id),
    ).toEqual([1, 2]);
    expect(
      (await bggPickerPage(db, OWNER, { ...input, collection: "1", limit: 50 })).items.map(
        (game) => game.id,
      ),
    ).toEqual(found);
    expect(
      (await bggPickerPage(db, OWNER, bggPickerQuerySchema.parse({ query: "Catalog" }))).items.map(
        (game) => game.id,
      ),
    ).toEqual([6]);
    await db
      .collection(COLLECTIONS.BGG_ACCOUNTS)
      .updateOne({ userId: GUEST }, { $set: { "active.snapshot": "new-publication" } });
    await expect(
      bggPickerPage(db, OWNER, { ...input, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "BGG_PICKER_CHANGED" });
    await db
      .collection(COLLECTIONS.BLOCKS)
      .insertOne({ fromUserId: OWNER, toUserId: OTHER, createdAt: at });
    expect(
      (await bggPickerPage(db, OWNER, { ...input, limit: 50 })).items.map((game) => game.id),
    ).toEqual([1, 2]);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId: group.id, userId: GUEST }, { $set: { role: "MODERATOR" } });
    await bggPickerPage(db, GUEST, input);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId: group.id, userId: GUEST }, { $set: { role: "MEMBER" } });
    await expect(bggPickerPage(db, GUEST, input)).rejects.toMatchObject({
      code: "EVENT_ADMIN_REQUIRED",
    });
  });
  it("event access expansion: public outsider enrollment reaches registered Event/Table source pages without Group membership, private visibility keeps public scheduling", async () => {
    const groupId = randomUUID(),
      at = new Date().toISOString();
    await db.collection(COLLECTIONS.GROUPS).insertOne({
      id: groupId,
      type: "PUBLIC",
      adminUserId: OWNER,
      version: 1,
      createdAt: at,
      updatedAt: at,
      approved: { name: "Public club", location, logoAssetId: randomUUID() },
    });
    const input = {
      ...plannedInput(groupId),
      visibility: "PUBLIC" as const,
      endsAt: "2030-06-03T21:00:00.000Z",
      bookingClosesAt: "2030-06-02T10:00:00.000Z",
    };
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OUTSIDER, DEMO, GUEST]) {
      const choices = await participation(event.id, tableId);
      expect(
        await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices)),
      ).toMatchObject({ status: "ACCEPTED", kind: "SELF" });
      expect(await services().groupRecords.membership(groupId, user)).toBeNull();
      expect(
        (await services().plannedEventService.list(user, { limit: 1, section: "mine" })).items.map(
          (row) => row.id,
        ),
      ).toEqual([event.id]);
      expect(
        (await services().plannedEventService.personalTables(user, { limit: 1 })).items.map(
          (row) => row.id,
        ),
      ).toEqual([]);
    }
    const version = (await services().eventRecords.find(event.id))!.version;
    await expect(
      transaction((s) =>
        s.plannedEventService.update(OWNER, event.id, {
          ...input,
          visibility: "PRIVATE",
          version,
          tables: [],
          removedTableIds: [],
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_VISIBILITY_IMMUTABLE" });
    await transaction((s) =>
      s.plannedEventService.transition(OWNER, event.id, { version, action: "confirm" }),
    );
    expect((await services().eventRecords.table(tableId))?.confirmed?.playerIds).toEqual([
      OUTSIDER,
      DEMO,
    ]);
    await db
      .collection(COLLECTIONS.GROUP_BANS)
      .insertOne({ groupId, userId: OUTSIDER, until: null });
    expect(
      (await services().plannedEventService.list(OUTSIDER, { limit: 1, section: "mine" })).items,
    ).toEqual([]);
    expect(
      (await services().plannedEventService.personalTables(OUTSIDER, { limit: 1 })).items,
    ).toEqual([]);
    await expect(services().plannedEventService.detail(OUTSIDER, event.id)).rejects.toMatchObject({
      code: "GROUP_BANNED",
    });
    const privateInput = {
      ...input,
      visibility: "PRIVATE" as const,
      tables: [{ ...input.tables[0], id: randomUUID() }],
    };
    const hidden = await transaction((s) => s.plannedEventService.create(OWNER, privateInput));
    await expect(services().plannedEventService.detail(GUEST, hidden.id)).rejects.toMatchObject({
      code: "GROUP_MEMBER_REQUIRED",
    });
    await expect(
      transaction((s) =>
        s.plannedEventService.create(OWNER, {
          ...privateInput,
          dates: [...input.dates, { id: randomUUID(), day: "2030-06-04" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_FIXED_SCHEDULE_REQUIRED" });
  });
  it("event access expansion: atomically shares final physical results with ND-player friends, never admin/queue/follower-only grants or Group information", async () => {
    const group = await privateGroup();
    await transaction((s) => s.relationships.becomeFriends(OWNER, DEMO));
    const invitation = await transaction((s) =>
      s.unifiedGroupService.invite(OWNER, group.id, DEMO),
    );
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(DEMO, group.id, DEMO, {
        action: "accept",
        version: invitation.version,
      }),
    );
    const input = plannedInput(group.id);
    input.tables[0].maxPlayers = 3;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [GUEST, OTHER, DEMO, OWNER]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    const frozen = await transaction(async (s) =>
      s.plannedEventService.transition(OWNER, event.id, {
        version: (await s.eventRecords.find(event.id))!.version,
        action: "confirm",
      }),
    );
    expect((await services().eventRecords.table(tableId))?.confirmed?.playerIds).toEqual([
      GUEST,
      OTHER,
      DEMO,
    ]);
    const saved = await transaction((s) =>
      s.plannedEventService.saveResult(OWNER, event.id, tableId, {
        version: frozen.version,
        lowerWins: false,
        entries: [
          { userId: GUEST, score: "3" },
          { userId: OTHER, score: "2" },
          { userId: DEMO, score: null },
        ],
        tieBreaks: [],
      }),
    );
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.finalize(OWNER, event.id, {
          version: saved.event.version,
          shareResultsWithFriends: true,
        });
        throw new Error("ROLLBACK_SHARING");
      }),
    ).rejects.toThrow("ROLLBACK_SHARING");
    expect((await services().eventRecords.find(event.id))?.shareResultsWithFriends).not.toBe(true);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
    expect(
      await db.collection(COLLECTIONS.PROFILE_ACTIVITIES).countDocuments({ kind: "played" }),
    ).toBe(0);
    const done = await transaction((s) =>
      s.plannedEventService.finalize(OWNER, event.id, {
        version: saved.event.version,
        shareResultsWithFriends: true,
      }),
    );
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(6);
    await transaction((s) => s.relationships.follow(OUTSIDER, GUEST));
    await expect(services().plannedEventService.detail(OUTSIDER, event.id)).rejects.toMatchObject({
      status: 403,
    });
    await transaction((s) => s.relationships.becomeFriends(OUTSIDER, OWNER));
    await expect(services().plannedEventService.detail(OUTSIDER, event.id)).rejects.toMatchObject({
      status: 403,
    });
    await transaction((s) => s.relationships.becomeFriends(OUTSIDER, DEMO));
    const view = await services().plannedEventService.detail(OUTSIDER, event.id);
    expect(view).toMatchObject({
      sharedResultsOnly: true,
      groupId: null,
      groupName: null,
      groupType: null,
      canRegister: false,
      canManage: false,
    });
    expect(JSON.stringify(view)).not.toContain(group.id);
    const table = await services().plannedEventService.tableDetail(OUTSIDER, event.id, tableId);
    expect(table.results?.entries.find((row) => row.userId === DEMO)?.score).toBeNull();
    expect(table.resultProfiles?.every((profile) => profile.email === null)).toBe(true);
    expect(JSON.stringify(table)).not.toContain(group.id);
    expect(table).not.toHaveProperty("groupRatingChanges");
    const activities = new ProfileActivitiesRepository(db),
      profile = new ProfileService(db);
    for (let i = 0; i < 60; i++)
      await activities.record({
        source: `non-result:${i}`,
        userId: GUEST,
        kind: "event_join",
        eventId: event.id,
        groupId: group.id,
        occurredAt: new Date(Date.now() + 1000 * (i + 1)).toISOString(),
      });
    const feed = await profile.feed(OUTSIDER, GUEST, { limit: 10 });
    expect(feed.items.filter((row) => row.kind === "played")).toHaveLength(1);
    expect(
      feed.items.some(
        (row) =>
          row.kind === "event_join" || row.kind === "table_join" || row.kind === "group_join",
      ),
    ).toBe(false);
    expect(feed.nextCursor).toBeNull();
    expect(JSON.stringify(feed)).not.toContain(group.id);
    expect(
      (
        await profile.networkFeed(OUTSIDER, { network: "following", kind: "played", limit: 10 })
      ).items.map((row) => row.author.id),
    ).toEqual([GUEST]);
    await transaction((s) => s.relationships.unfriend(OUTSIDER, DEMO));
    await expect(services().plannedEventService.detail(OUTSIDER, event.id)).rejects.toMatchObject({
      status: 403,
    });
    expect((await profile.feed(OUTSIDER, GUEST, { kind: "played", limit: 1 })).items).toEqual([]);
    await expect(
      transaction((s) =>
        s.plannedEventService.finalize(OWNER, event.id, {
          version: done.version,
          shareResultsWithFriends: false,
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_NOT_CONFIRMED" });
  });
  it("source-pages private participant proposals, isolates authors and atomically cascades Event requests", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.allowParticipantDates = true;
    input.allowParticipantLocations = true;
    input.tables[0] = { ...input.tables[0], maxPlayers: 4, allowParticipantGames: true };
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST, OTHER]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    const version = (await services().eventRecords.find(event.id))!.version;
    for (const user of [GUEST, OTHER])
      for (let day = 4; day <= 15; day++)
        await transaction((s) =>
          s.plannedEventService.submitProposal(user, event.id, {
            eventVersion: version,
            clientRequestId: randomUUID(),
            payload: {
              kind: "date",
              day: `2030-06-${String(day).padStart(2, "0")}`,
              startTime: "19:00",
            },
          }),
        );
    const own: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await transaction((s) =>
        s.plannedEventService.proposals(GUEST, event.id, {
          mode: "mine",
          kind: "date",
          limit: 5,
          cursor,
        }),
      );
      expect(page.items.every((p) => p.userId === GUEST)).toBe(true);
      expect(JSON.stringify(page)).not.toMatch(/requestHash|payloadKey|email|gameVotes/);
      own.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(own).size).toBe(12);
    expect(own).toHaveLength(12);
    const reviewed: string[] = [];
    let reviewCursor: string | undefined;
    do {
      const page = await transaction((s) =>
        s.plannedEventService.proposals(OWNER, event.id, {
          mode: "review",
          kind: "date",
          limit: 5,
          cursor: reviewCursor,
        }),
      );
      expect(page.items.length).toBeLessThanOrEqual(5);
      for (const proposal of page.items) {
        expect(proposal.suggestions).toHaveLength(2);
        expect(new Set(proposal.suggestions?.map((row) => row.id)).size).toBe(2);
        expect(proposal.groupRevision).toBeTruthy();
      }
      reviewed.push(...page.items.map((row) => row.id));
      reviewCursor = page.nextCursor ?? undefined;
    } while (reviewCursor);
    expect(reviewed).toHaveLength(12);
    expect(new Set(reviewed).size).toBe(12);
    await expect(
      transaction((s) =>
        s.plannedEventService.proposals(GUEST, event.id, {
          mode: "review",
          kind: "date",
          limit: 20,
        }),
      ),
    ).rejects.toMatchObject({ message: "EVENT_ADMIN_REQUIRED" });
    await expect(
      transaction((s) =>
        s.plannedEventService.proposals(OUTSIDER, event.id, {
          mode: "mine",
          kind: "date",
          limit: 20,
        }),
      ),
    ).rejects.toMatchObject({ message: "GROUP_MEMBER_REQUIRED" });
    const target = (
      await transaction((s) =>
        s.plannedEventService.proposals(OWNER, event.id, {
          mode: "review",
          kind: "date",
          limit: 1,
        }),
      )
    ).items[0];
    const decision = {
      eventVersion: version,
      version: target.version,
      groupRevision: target.groupRevision,
      action: "reject" as const,
    };
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.reviewProposal(OWNER, event.id, target.id, decision);
        throw new Error("date group rollback");
      }),
    ).rejects.toThrow("date group rollback");
    expect(
      await db
        .collection(COLLECTIONS.EVENT_PROPOSALS)
        .countDocuments({ eventId: event.id, status: "PENDING" }),
    ).toBe(24);
    const [reviewedDate, replayedDate] = await Promise.all(
      [0, 1].map(() =>
        transaction((s) =>
          s.plannedEventService.reviewProposal(OWNER, event.id, target.id, decision),
        ),
      ),
    );
    expect(reviewedDate.proposals).toHaveLength(2);
    expect(replayedDate.proposals).toEqual(reviewedDate.proposals);
    expect(
      await db
        .collection(COLLECTIONS.EVENT_PROPOSALS)
        .countDocuments({ eventId: event.id, status: "REJECTED" }),
    ).toBe(2);
    const membership = await services().groupRecords.membership(group.id, GUEST);
    await transaction((s) =>
      s.plannedEventService.remove(OWNER, event.id, { version: reviewedDate.event.version }),
    );
    expect(
      await db.collection(COLLECTIONS.EVENT_PROPOSALS).countDocuments({ eventId: event.id }),
    ).toBe(0);
    expect(await services().groupRecords.membership(group.id, GUEST)).toEqual(membership);
  });
  it("source-groups game suggestions before paging and atomically reviews every pending proposer with rollback and private readback", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.tables[0].allowParticipantGames = true;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OTHER, GUEST])
      await transaction(async (s) =>
        s.plannedEventService.join(user, event.id, tableId, await participation(event.id, tableId)),
      );
    await db.collection(COLLECTIONS.BOARD_GAMES).insertMany(
      Array.from({ length: 6 }, (_, i) => ({
        id: 200 + i,
        name: `Proposed game ${i}`,
        isExpansion: false,
        minPlayMinutes: 60,
        maxPlayMinutes: 60,
        image: "https://image.test/game.png",
      })),
    );
    const version = (await services().eventRecords.find(event.id))!.version;
    for (let i = 0; i < 6; i++)
      for (const user of [OTHER, GUEST])
        await transaction((s) =>
          s.plannedEventService.submitProposal(user, event.id, {
            eventVersion: version,
            clientRequestId: randomUUID(),
            payload: { kind: "game", tableId, gameId: 200 + i },
          }),
        );
    const all: import("@board-game-organizer/schemas").EventProposalResponse[] = [];
    let cursor: string | undefined;
    do {
      const page = await transaction((s) =>
        s.plannedEventService.proposals(OWNER, event.id, {
          mode: "review",
          kind: "game",
          tableId,
          limit: 2,
          cursor,
        }),
      );
      expect(page.items.length).toBeLessThanOrEqual(2);
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(all).toHaveLength(6);
    expect(new Set(all.map((p) => (p.payload.kind === "game" ? p.payload.gameId : 0))).size).toBe(
      6,
    );
    expect(all.every((p) => p.gameSuggestions?.length === 2)).toBe(true);
    const target = all[0],
      decision = {
        eventVersion: version,
        version: target.version,
        action: "accept" as const,
        groupRevision: target.groupRevision,
      };
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.reviewProposal(OWNER, event.id, target.id, {
          ...decision,
          action: "reject",
        });
        throw new Error("group rollback");
      }),
    ).rejects.toThrow("group rollback");
    expect(
      await db
        .collection(COLLECTIONS.EVENT_PROPOSALS)
        .countDocuments({ eventId: event.id, status: "PENDING" }),
    ).toBe(12);
    const results = await Promise.all(
      [0, 1].map(() =>
        transaction((s) =>
          s.plannedEventService.reviewProposal(OWNER, event.id, target.id, decision),
        ),
      ),
    );
    expect(results[0].proposals).toHaveLength(2);
    expect(results[1].proposals).toEqual(results[0].proposals);
    expect(
      await db
        .collection(COLLECTIONS.EVENT_PROPOSALS)
        .countDocuments({ eventId: event.id, status: "ACCEPTED" }),
    ).toBe(2);
    expect((await services().eventRecords.find(event.id))!.version).toBe(version + 1);
    expect(
      (await services().eventRecords.table(tableId))!.games.filter(
        (g) => g.gameId === (target.payload.kind === "game" ? target.payload.gameId : 0),
      ),
    ).toHaveLength(1);
    const guest = target.gameSuggestions!.find((p) => p.userId === GUEST)!;
    expect(
      (await transaction((s) => s.plannedEventService.proposalDetail(GUEST, event.id, guest.id)))
        .proposals,
    ).toBeUndefined();
    expect(
      (await transaction((s) => s.plannedEventService.proposalDetail(OWNER, event.id, target.id)))
        .proposals,
    ).toHaveLength(2);
    expect(
      await transaction((s) =>
        s.plannedEventService.proposalPickerExclusions(GUEST, event.id, tableId),
      ),
    ).toEqual(expect.arrayContaining([200, 201, 202, 203, 204, 205]));
  });
  it("serializes proposal submit/accept races, retains singleton consent and rolls private/configuration/notices back together", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.allowParticipantDates = true;
    input.allowParticipantLocations = true;
    input.tables[0].allowParticipantGames = true;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    const version = (await services().eventRecords.find(event.id))!.version;
    const submission = {
      eventVersion: version,
      clientRequestId: randomUUID(),
      payload: { kind: "date" as const, day: "2030-06-04", startTime: "19:00" },
    };
    const submitted = await Promise.all([
      transaction((s) => s.plannedEventService.submitProposal(GUEST, event.id, submission)),
      transaction((s) => s.plannedEventService.submitProposal(GUEST, event.id, submission)),
    ]);
    expect(submitted[0].id).toBe(submitted[1].id);
    expect(
      await db.collection(COLLECTIONS.EVENT_PROPOSALS).countDocuments({ eventId: event.id }),
    ).toBe(1);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .countDocuments({ kind: "event_proposal_created" }),
    ).toBe(1);
    const registrations = await services().eventRecords.allRegistrations(event.id),
      ballots = await services().eventRecords.allVotes(event.id);
    const decisions = await Promise.all([
      transaction((s) =>
        s.plannedEventService.reviewProposal(OWNER, event.id, submitted[0].id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        }),
      ),
      transaction((s) =>
        s.plannedEventService.reviewProposal(OWNER, event.id, submitted[0].id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        }),
      ),
    ]);
    expect(decisions[0].proposal).toEqual(decisions[1].proposal);
    let current = (await services().eventRecords.find(event.id))!;
    expect(current.version).toBe(version + 1);
    expect(current.dates).toHaveLength(2);
    expect(current.dates[0].id).toBe(dateId);
    expect(await services().eventRecords.allRegistrations(event.id)).toEqual(registrations);
    expect(await services().eventRecords.allVotes(event.id)).toEqual(ballots);
    expect(
      ballots.every(
        (v) => !Object.keys(v.dateVotes).length && !Object.keys(v.locationVotes).length,
      ),
    ).toBe(true);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .countDocuments({ kind: "event_proposal_accepted" }),
    ).toBe(1);
    const proposal = await transaction((s) =>
      s.plannedEventService.submitProposal(GUEST, event.id, {
        eventVersion: current.version,
        clientRequestId: randomUUID(),
        payload: {
          kind: "location",
          location: {
            ...location,
            id: randomUUID(),
            address: "Another verified street",
            longitude: 13,
            timeZone: "Europe/Rome",
          },
        },
      }),
    );
    current = (await services().eventRecords.find(event.id))!;
    const notices = await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({});
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.reviewProposal(OWNER, event.id, proposal.id, {
          eventVersion: current.version,
          version: 1,
          action: "accept",
        });
        throw new Error("proposal rollback");
      }),
    ).rejects.toThrow("proposal rollback");
    expect(await services().eventRecords.find(event.id)).toEqual(current);
    expect((await services().eventRecords.proposal(proposal.id))?.status).toBe("PENDING");
    expect(await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({})).toBe(notices);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({})).toBe(0);
  });
  it("serializes proposal approval against confirmation and current-role revocation without rewriting frozen state", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.allowParticipantDates = true;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    let version = (await services().eventRecords.find(event.id))!.version;
    const proposal = await transaction((s) =>
      s.plannedEventService.submitProposal(GUEST, event.id, {
        eventVersion: version,
        clientRequestId: randomUUID(),
        payload: { kind: "date", day: "2030-06-05", startTime: "20:00" },
      }),
    );
    const raced = await Promise.allSettled([
      transaction((s) =>
        s.plannedEventService.transition(OWNER, event.id, { action: "confirm", version }),
      ),
      transaction((s) =>
        s.plannedEventService.reviewProposal(OWNER, event.id, proposal.id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        }),
      ),
    ]);
    expect(raced.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    let current = (await services().eventRecords.find(event.id))!;
    if (current.status === "CONFIRMED") {
      expect(current.dates).toHaveLength(1);
      expect((await services().eventRecords.proposal(proposal.id))?.status).toBe("PENDING");
      await transaction((s) =>
        s.plannedEventService.transition(OWNER, event.id, {
          action: "replan",
          version: current.version,
        }),
      );
    } else {
      expect(current.status).toBe("PLANNING");
      expect(current.dates).toHaveLength(2);
    }
    const member = (await services().groupRecords.membership(group.id, OTHER))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, OTHER, {
        action: "promote",
        version: member.version,
      }),
    );
    current = (await services().eventRecords.find(event.id))!;
    const next = await transaction((s) =>
      s.plannedEventService.submitProposal(GUEST, event.id, {
        eventVersion: current.version,
        clientRequestId: randomUUID(),
        payload: { kind: "date", day: "2030-06-06", startTime: "20:00" },
      }),
    );
    const moderator = (await services().groupRecords.membership(group.id, OTHER))!;
    version = (await services().eventRecords.find(event.id))!.version;
    await Promise.allSettled([
      transaction((s) =>
        s.unifiedGroupService.membershipAction(OWNER, group.id, OTHER, {
          action: "demote",
          version: moderator.version,
        }),
      ),
      transaction((s) =>
        s.plannedEventService.reviewProposal(OTHER, event.id, next.id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        }),
      ),
    ]);
    expect((await services().groupRecords.membership(group.id, OTHER))?.role).not.toBe("MODERATOR");
    await expect(
      transaction((s) =>
        s.plannedEventService.proposals(OTHER, event.id, {
          kind: "date",
          mode: "review",
          limit: 20,
        }),
      ),
    ).rejects.toMatchObject({ message: "EVENT_ADMIN_REQUIRED" });
    expect((await services().eventRecords.proposal(next.id))?.status).toMatch(
      /^(PENDING|ACCEPTED)$/,
    );
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
  });
  it("rechecks proposal games against real own seats/current catalog and preserves pending history for removed Tables", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.tables[0].allowParticipantGames = true;
    input.tables.push({ ...input.tables[0], id: secondId, name: "Another game table" });
    await db.collection(COLLECTIONS.BOARD_GAMES).insertMany([
      { id: 2, name: "New base game", isExpansion: false },
      { id: 3, name: "Expansion", isExpansion: true },
    ]);
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST, OTHER]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    let version = (await services().eventRecords.find(event.id))!.version;
    for (const [userId, target] of [
      [GUEST, secondId],
      [OTHER, tableId],
    ])
      await expect(
        transaction((s) =>
          s.plannedEventService.submitProposal(userId, event.id, {
            eventVersion: version,
            clientRequestId: randomUUID(),
            payload: { kind: "game", tableId: target, gameId: 2 },
          }),
        ),
      ).rejects.toMatchObject({ message: "PROPOSAL_SEAT_REQUIRED" });
    await expect(
      transaction((s) =>
        s.plannedEventService.submitProposal(GUEST, event.id, {
          eventVersion: version,
          clientRequestId: randomUUID(),
          payload: { kind: "game", tableId, gameId: 3 },
        }),
      ),
    ).rejects.toMatchObject({ message: "GAME_NOT_FOUND" });
    const row = await transaction((s) =>
      s.plannedEventService.submitProposal(GUEST, event.id, {
        eventVersion: version,
        clientRequestId: randomUUID(),
        payload: { kind: "game", tableId, gameId: 2 },
      }),
    );
    await db
      .collection(COLLECTIONS.BOARD_GAMES)
      .updateOne({ id: 2 }, { $set: { isExpansion: true } });
    await expect(
      transaction((s) =>
        s.plannedEventService.reviewProposal(OWNER, event.id, row.id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        }),
      ),
    ).rejects.toMatchObject({ message: "GAME_NOT_FOUND" });
    expect((await services().eventRecords.proposal(row.id))?.status).toBe("PENDING");
    expect((await services().eventRecords.find(event.id))?.version).toBe(version);
    await db
      .collection(COLLECTIONS.BOARD_GAMES)
      .updateOne({ id: 2 }, { $set: { isExpansion: false } });
    await transaction((s) =>
      s.plannedEventService.reviewProposal(OWNER, event.id, row.id, {
        eventVersion: version,
        version: 1,
        action: "accept",
      }),
    );
    expect(
      (await services().eventRecords.table(tableId))?.games.map((game) => game.gameId),
    ).toEqual([1, 2]);
    expect((await services().eventRecords.userRegistration(tableId, GUEST))?.gameVotes).toEqual({});
    await db
      .collection(COLLECTIONS.BOARD_GAMES)
      .insertOne({ id: 4, name: "Another base game", isExpansion: false });
    version = (await services().eventRecords.find(event.id))!.version;
    const pending = await transaction((s) =>
      s.plannedEventService.submitProposal(GUEST, event.id, {
        eventVersion: version,
        clientRequestId: randomUUID(),
        payload: { kind: "game", tableId, gameId: 4 },
      }),
    );
    await transaction((s) =>
      s.plannedEventService.removeTable(OWNER, event.id, tableId, { version }),
    );
    version = (await services().eventRecords.find(event.id))!.version;
    await expect(
      transaction((s) =>
        s.plannedEventService.reviewProposal(OWNER, event.id, pending.id, {
          eventVersion: version,
          version: 1,
          action: "accept",
        }),
      ),
    ).rejects.toMatchObject({ message: "TABLE_NOT_FOUND" });
    expect((await services().eventRecords.proposal(pending.id))?.status).toBe("PENDING");
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
  });
  it("verifies lost proposal receipts with private serialized reads and current manager authority", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.allowParticipantDates = true;
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const choices = await participation(event.id, tableId);
    await transaction((s) => s.plannedEventService.join(GUEST, event.id, tableId, choices));
    const version = (await services().eventRecords.find(event.id))!.version;
    const proposed = await transaction((s) =>
      s.plannedEventService.submitProposal(GUEST, event.id, {
        eventVersion: version,
        clientRequestId: randomUUID(),
        payload: { kind: "date", day: "2030-06-07", startTime: "20:00" },
      }),
    );
    const correlation = await transaction((s) =>
      s.plannedEventService.proposals(GUEST, event.id, {
        mode: "mine",
        kind: "date",
        limit: 1,
        clientRequestId: proposed.clientRequestId,
      }),
    );
    expect(correlation.items.map((row) => row.id)).toEqual([proposed.id]);
    const receipt = await transaction((s) =>
      s.plannedEventService.reviewProposal(OWNER, event.id, proposed.id, {
        eventVersion: version,
        version: 1,
        action: "accept",
      }),
    );
    expect(
      (await transaction((s) => s.plannedEventService.proposalDetail(GUEST, event.id, proposed.id)))
        .proposal,
    ).toEqual(receipt.proposal);
    await expect(
      transaction((s) => s.plannedEventService.proposalDetail(OTHER, event.id, proposed.id)),
    ).rejects.toMatchObject({ message: "PROPOSAL_NOT_FOUND" });
    const membership = (await services().groupRecords.membership(group.id, OTHER))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, OTHER, {
        action: "promote",
        version: membership.version,
      }),
    );
    expect(
      (await transaction((s) => s.plannedEventService.proposalDetail(OTHER, event.id, proposed.id)))
        .proposal.status,
    ).toBe("ACCEPTED");
    const moderator = (await services().groupRecords.membership(group.id, OTHER))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, OTHER, {
        action: "demote",
        version: moderator.version,
      }),
    );
    await expect(
      transaction((s) => s.plannedEventService.proposalDetail(OTHER, event.id, proposed.id)),
    ).rejects.toMatchObject({ message: "PROPOSAL_NOT_FOUND" });
  });
  it("pages Event participants at source and removes only Event attendance atomically under competing versions", async () => {
    const group = await privateGroup();
    const input = plannedInput(group.id);
    input.tables.push({ ...input.tables[0], id: secondId, name: "Second participant table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST, OTHER]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    const secondChoices = await participation(event.id, secondId);
    await transaction((s) => s.plannedEventService.join(GUEST, event.id, secondId, secondChoices));
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await transaction((s) =>
        s.plannedEventService.participants(OWNER, event.id, { limit: 1, cursor }),
      );
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).not.toHaveProperty("email");
      expect(page.items[0]).not.toHaveProperty("gameVotes");
      if (page.items[0].userId === OTHER) expect(page.items[0].position).toBe("WAITING");
      expect(page.items[0].managementRole).toBe(page.items[0].userId === OWNER ? "admin" : null);
      seen.push(page.items[0].userId);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen)).toEqual(new Set([OWNER, GUEST, OTHER]));
    expect(seen).toHaveLength(3);
    await expect(
      transaction((s) => s.plannedEventService.participants(OUTSIDER, event.id, { limit: 20 })),
    ).rejects.toMatchObject({ status: 403 });
    const membership = await services().groupRecords.membership(group.id, GUEST);
    const version = (await services().eventRecords.find(event.id))!.version;
    const raced = await Promise.allSettled([
      transaction((s) =>
        s.plannedEventService.removeParticipant(OWNER, event.id, GUEST, { version }),
      ),
      transaction((s) =>
        s.plannedEventService.removeParticipant(OWNER, event.id, GUEST, { version }),
      ),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(raced.find((result) => result.status === "rejected")).toMatchObject({
      reason: { message: "EVENT_CHANGED" },
    });
    expect(await services().eventRecords.userRegistrations(event.id, GUEST)).toEqual([]);
    expect(await services().groupRecords.membership(group.id, GUEST)).toEqual(membership);
    expect(
      await db
        .collection(COLLECTIONS.GROUP_BANS)
        .countDocuments({ groupId: group.id, userId: GUEST }),
    ).toBe(0);
    const choices = await participation(event.id, tableId);
    await transaction((s) => s.plannedEventService.join(GUEST, event.id, tableId, choices));
    const before = await services().eventRecords.find(event.id);
    const notices = await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({});
    await expect(
      transaction(async (s) => {
        await s.plannedEventService.removeParticipant(OWNER, event.id, GUEST, {
          version: before!.version,
        });
        throw new Error("participant rollback");
      }),
    ).rejects.toThrow("participant rollback");
    expect(await services().eventRecords.find(event.id)).toEqual(before);
    expect(await services().eventRecords.userRegistrations(event.id, GUEST)).toHaveLength(1);
    expect(await db.collection(COLLECTIONS.NOTIFICATIONS).countDocuments({})).toBe(notices);
  });
  it("reads current Group participant roles from MongoDB, not historical Event authorship or reader permissions", async () => {
    const group = await privateGroup();
    const member = (await services().groupRecords.membership(group.id, GUEST))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "promote",
        version: member.version,
      }),
    );
    const event = await transaction((s) =>
      s.plannedEventService.create(GUEST, plannedInput(group.id)),
    );
    for (const user of [OWNER, GUEST, OTHER]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    const page = await transaction((s) =>
      s.plannedEventService.participants(OTHER, event.id, { limit: 20 }),
    );
    expect(page.items.find((row) => row.userId === OWNER)?.managementRole).toBe("admin");
    expect(page.items.find((row) => row.userId === GUEST)?.managementRole).toBe("moderator");
    expect(page.items.find((row) => row.userId === OTHER)?.managementRole).toBeNull();
    expect(page.items.every((row) => !row.canRemove && !row.canBanGroup)).toBe(true);
    const moderator = (await services().groupRecords.membership(group.id, GUEST))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "demote",
        version: moderator.version,
      }),
    );
    const updated = await transaction((s) =>
      s.plannedEventService.participants(OTHER, event.id, { limit: 20 }),
    );
    expect(updated.items.find((row) => row.userId === GUEST)?.managementRole).toBeNull();
    expect((await services().eventRecords.find(event.id))?.adminUserId).toBe(GUEST);
  });
  it("keeps frozen Event participants source-complete without mutable rows and refuses immutable removal", async () => {
    const group = await privateGroup();
    const event = await transaction((s) =>
      s.plannedEventService.create(OWNER, plannedInput(group.id)),
    );
    for (const user of [OWNER, GUEST, OTHER]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    const version = (await services().eventRecords.find(event.id))!.version;
    await transaction((s) =>
      s.plannedEventService.transition(OWNER, event.id, { action: "confirm", version }),
    );
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .deleteOne({ eventId: event.id, userId: GUEST });
    const page = await transaction((s) =>
      s.plannedEventService.participants(OWNER, event.id, { limit: 20 }),
    );
    expect(page.items.find((row) => row.userId === GUEST)).toMatchObject({
      position: "FROZEN",
      canRemove: false,
    });
    expect(page.items.find((row) => row.userId === OTHER)).toMatchObject({
      position: "WAITING",
      canRemove: false,
    });
    await expect(
      transaction((s) =>
        s.plannedEventService.removeParticipant(OWNER, event.id, GUEST, {
          version: page.eventVersion,
        }),
      ),
    ).rejects.toMatchObject({ message: "EVENT_NOT_PLANNING" });
    expect((await services().eventRecords.table(tableId))!.confirmed!.playerIds).toContain(GUEST);
  });
  it("grants scoped Group moderators, protects creator and peers, preserves ownership and revokes historical Event authorship on demotion", async () => {
    const group = await privateGroup();
    for (const user of [GUEST, OTHER]) {
      const membership = (await services().groupRecords.membership(group.id, user))!;
      await transaction((s) =>
        s.unifiedGroupService.membershipAction(OWNER, group.id, user, {
          action: "promote",
          version: membership.version,
        }),
      );
    }
    expect(await services().unifiedGroupService.detail(GUEST, group.id)).toMatchObject({
      role: "moderator",
      canEdit: true,
      canInvite: true,
      adminUserId: OWNER,
    });
    expect(
      (
        await services().unifiedGroupService.list(GUEST, "mine", { roles: ["admin"], limit: 5 })
      ).items.map((g) => g.id),
    ).toContain(group.id);
    for (const action of ["promote", "demote", "remove"] as const) {
      const peer = (await services().groupRecords.membership(group.id, OTHER))!;
      await expect(
        transaction((s) =>
          s.unifiedGroupService.membershipAction(GUEST, group.id, OTHER, {
            action,
            version: peer.version,
          }),
        ),
      ).rejects.toMatchObject({
        code: action === "remove" ? "GROUP_MANAGER_PROTECTED" : "GROUP_ADMIN_REQUIRED",
      });
    }
    await expect(
      transaction((s) =>
        s.unifiedGroupService.ban(GUEST, group.id, { userId: OWNER, until: null }),
      ),
    ).rejects.toMatchObject({ code: "GROUP_ADMIN_CANNOT_LEAVE" });
    await expect(
      transaction((s) =>
        s.unifiedGroupService.ban(GUEST, group.id, { userId: OTHER, until: null }),
      ),
    ).rejects.toMatchObject({ code: "GROUP_MANAGER_PROTECTED" });
    await expect(
      transaction((s) =>
        s.unifiedGroupService.remove(GUEST, group.id, {
          version: group.version,
          deleteEvents: true,
        }),
      ),
    ).rejects.toMatchObject({ code: "GROUP_ADMIN_REQUIRED" });
    const edited = await transaction((s) =>
      s.unifiedGroupService.save(
        GUEST,
        { name: "Managed private club", version: group.version },
        group.id,
      ),
    );
    expect(edited.adminUserId).toBe(OWNER);
    await transaction((s) => s.relationships.becomeFriends(GUEST, OUTSIDER));
    const invite = await transaction((s) =>
      s.unifiedGroupService.invite(GUEST, group.id, OUTSIDER),
    );
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OUTSIDER, group.id, OUTSIDER, {
        action: "accept",
        version: invite.version,
      }),
    );
    const event = await transaction((s) =>
      s.plannedEventService.create(GUEST, plannedInput(group.id)),
    );
    expect(event).toMatchObject({ canManage: true, participantCount: 0, adminUserId: GUEST });
    const membership = (await services().groupRecords.membership(group.id, GUEST))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "demote",
        version: membership.version,
      }),
    );
    expect(await services().plannedEventService.detail(GUEST, event.id)).toMatchObject({
      canManage: false,
      canEdit: false,
      canConfirm: false,
      role: "member",
    });
    expect(await services().plannedEventService.detail(OWNER, event.id)).toMatchObject({
      canManage: true,
      canEdit: true,
    });
    await expect(
      transaction((s) => s.plannedEventService.remove(GUEST, event.id, { version: event.version })),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    await expect(
      services().plannedEventService.seats(GUEST, event.id, tableId, { limit: 5 }, true),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    expect((await services().groupRecords.find(group.id))?.adminUserId).toBe(OWNER);
  });
  it("delegates confirmation and immutable Event results without seating the moderator or changing ratings before finalization", async () => {
    const group = await privateGroup(),
      membership = (await services().groupRecords.membership(group.id, GUEST))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "promote",
        version: membership.version,
      }),
    );
    const event = await transaction((s) =>
      s.plannedEventService.create(OWNER, plannedInput(group.id)),
    );
    for (const user of [OWNER, OTHER]) {
      await transaction((s) => s.plannedEventService.register(user, event.id, tableId));
      await voteYes(event.id, user, tableId);
    }
    const version = (await services().eventRecords.find(event.id))!.version;
    const frozen = await transaction((s) =>
      s.plannedEventService.transition(GUEST, event.id, { action: "confirm", version }),
    );
    expect((await services().eventRecords.table(tableId))?.confirmed?.playerIds).toEqual([
      OWNER,
      OTHER,
    ]);
    const saved = await transaction((s) =>
      s.plannedEventService.saveResult(GUEST, event.id, tableId, {
        version: frozen.version,
        lowerWins: false,
        entries: [
          { userId: OWNER, score: "5" },
          { userId: OTHER, score: "3" },
        ],
        tieBreaks: [],
      }),
    );
    expect(saved.table.resultDraft).toBeDefined();
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
    const done = await transaction((s) =>
      s.plannedEventService.finalize(GUEST, event.id, { version: saved.event.version }),
    );
    expect(done.status).toBe("TERMINATED");
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ userId: GUEST })).toBe(
      0,
    );
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(4);
    expect(
      await db
        .collection(COLLECTIONS.PROFILE_ACTIVITIES)
        .countDocuments({ eventId: event.id, userId: GUEST }),
    ).toBe(0);
  });
  it("serializes moderator demotion against Event edits through the existing Group transaction lock", async () => {
    const group = await privateGroup(),
      member = (await services().groupRecords.membership(group.id, GUEST))!;
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "promote",
        version: member.version,
      }),
    );
    const event = await transaction((s) =>
      s.plannedEventService.create(GUEST, plannedInput(group.id)),
    );
    const current = (await services().groupRecords.membership(group.id, GUEST))!;
    const { groupId: _groupId, ...input } = plannedInput(group.id);
    const results = await Promise.allSettled([
      transaction((s) =>
        s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
          action: "demote",
          version: current.version,
        }),
      ),
      transaction((s) =>
        s.plannedEventService.update(GUEST, event.id, {
          ...input,
          version: event.version,
          removedTableIds: [],
          name: "Concurrent moderator edit",
        }),
      ),
    ]);
    expect(results[0].status).toBe("fulfilled");
    if (results[1].status === "rejected")
      expect(results[1].reason).toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    expect((await services().groupRecords.membership(group.id, GUEST))?.role).toBe("MEMBER");
    const next = (await services().eventRecords.find(event.id))!;
    expect(next.adminUserId).toBe(GUEST);
    await expect(
      transaction((s) =>
        s.plannedEventService.update(GUEST, event.id, {
          ...input,
          version: next.version,
          removedTableIds: [],
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    expect(await services().plannedEventService.detail(OWNER, event.id)).toMatchObject({
      canManage: true,
    });
  });
  it("saves admin-only provisional Table results without ratings or activities, excludes unconfirmed Tables and finalizes saved scores only", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id),
      includedId = input.tables[0].id!,
      excludedId = randomUUID();
    input.tables.push({ ...input.tables[0], id: excludedId, name: "Excluded empty Table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST]) {
      await transaction((s) => s.plannedEventService.register(user, event.id, includedId));
      await voteYes(event.id, user, includedId);
    }
    let current = await confirm(event.id);
    const scores = {
      lowerWins: false,
      entries: [
        { userId: OWNER, score: "2" },
        { userId: GUEST, score: "1" },
      ],
      tieBreaks: [],
    };
    const beforeActivities = await db
      .collection(COLLECTIONS.PROFILE_ACTIVITIES)
      .countDocuments({ eventId: event.id });
    await expect(
      transaction((s) =>
        s.plannedEventService.saveResult(GUEST, event.id, includedId, {
          ...scores,
          version: current.version,
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_ADMIN_REQUIRED" });
    await expect(
      transaction((s) =>
        s.plannedEventService.saveResult(OWNER, event.id, excludedId, {
          ...scores,
          version: current.version,
        }),
      ),
    ).rejects.toMatchObject({ code: "TABLE_NOT_CONFIRMED" });
    let saved = await transaction((s) =>
      s.plannedEventService.saveResult(OWNER, event.id, includedId, {
        ...scores,
        version: current.version,
      }),
    );
    expect(saved.event).toMatchObject({ status: "CONFIRMED", resultsReady: true });
    expect(
      (await services().plannedEventService.tableDetail(OWNER, event.id, includedId)).resultDraft,
    ).toEqual(scores);
    expect(
      (await services().plannedEventService.tableDetail(GUEST, event.id, includedId)).resultDraft,
    ).toBeUndefined();
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ eventId: event.id }),
    ).toBe(0);
    expect(
      await db.collection(COLLECTIONS.PROFILE_ACTIVITIES).countDocuments({ eventId: event.id }),
    ).toBe(beforeActivities);
    expect(
      await db.collection(COLLECTIONS.EVENT_TABLES).findOne({ id: includedId }),
    ).not.toHaveProperty("results");
    await transaction((s) =>
      s.plannedEventService.transition(OWNER, event.id, {
        action: "replan",
        version: saved.event.version,
      }),
    );
    current = await confirm(event.id);
    expect(
      (await services().plannedEventService.tableDetail(OWNER, event.id, includedId)).resultDraft,
    ).toBeUndefined();
    await expect(
      transaction((s) =>
        s.plannedEventService.finalize(OWNER, event.id, { version: current.version }),
      ),
    ).rejects.toMatchObject({ code: "EVERY_INCLUDED_TABLE_RESULT_REQUIRED" });
    saved = await transaction((s) =>
      s.plannedEventService.saveResult(OWNER, event.id, includedId, {
        ...scores,
        version: current.version,
      }),
    );
    const ended = await transaction((s) =>
      s.plannedEventService.finalize(OWNER, event.id, { version: saved.event.version }),
    );
    expect(ended.status).toBe("TERMINATED");
    const table = await db.collection(COLLECTIONS.EVENT_TABLES).findOne({ id: includedId });
    expect(table).toHaveProperty("results");
    expect(table).not.toHaveProperty("resultDraft");
    expect(
      await db.collection(COLLECTIONS.EVENT_TABLES).findOne({ id: excludedId }),
    ).not.toHaveProperty("results");
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ eventId: event.id }),
    ).toBeGreaterThan(0);
    expect(
      await db.collection(COLLECTIONS.PROFILE_ACTIVITIES).countDocuments({ eventId: event.id }),
    ).toBeGreaterThan(beforeActivities);
    await expect(
      transaction((s) =>
        s.plannedEventService.saveResult(OWNER, event.id, includedId, {
          ...scores,
          version: ended.version,
        }),
      ),
    ).rejects.toMatchObject({ code: "EVENT_NOT_CONFIRMED" });
  });
  it("source-filters lifecycle chips together with literal names before Event/Table cursors without granting Group access", async () => {
    const group = await privateGroup(),
      cases = [
        ["PLANNING", "Beta planning"],
        ["CONFIRMED", "Alpha .* confirmed"],
        ["CONFIRMED", "Alpha confirmed second"],
        ["TERMINATED", "Alpha terminated"],
      ] as const;
    const sources: Array<{ eventId: string; tableId: string; status: (typeof cases)[number][0] }> =
      [];
    for (const [status, name] of cases) {
      const input = plannedInput(group.id),
        id = randomUUID();
      input.name = name;
      input.tables[0] = { ...input.tables[0], id, name };
      const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
      for (const user of [OWNER, GUEST]) {
        await transaction((s) => s.plannedEventService.register(user, event.id, id));
        await voteYes(event.id, user, id);
      }
      if (status !== "PLANNING") {
        const frozen = await confirm(event.id);
        if (status === "TERMINATED")
          await transaction((s) =>
            s.plannedEventService.finalize(OWNER, event.id, {
              version: frozen.version,
              results: [
                {
                  tableId: id,
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
      }
      sources.push({ eventId: event.id, tableId: id, status });
    }
    const adminInput = plannedInput(group.id);
    adminInput.name = "Alpha administration only";
    adminInput.tables[0].id = randomUUID();
    const adminOnly = await transaction((s) => s.plannedEventService.create(OWNER, adminInput));
    const readers = [
      (page: EventRecordPage) => services().plannedEventService.list(GUEST, page),
      (page: EventRecordPage) => services().plannedEventService.personalTables(GUEST, page),
      (page: EventRecordPage) => services().plannedEventService.list(GUEST, page, group.id),
    ];
    for (const [index, read] of readers.entries()) {
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await read({
          limit: 1,
          statuses: ["CONFIRMED", "TERMINATED"],
          query: "Alpha",
          cursor,
        });
        expect(page.items).toHaveLength(1);
        seen.push(...page.items.map((row) => row.id));
        expect(seen.length).toBeLessThanOrEqual(3);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(new Set(seen)).toEqual(
        new Set(
          sources
            .filter((row) => row.status !== "PLANNING")
            .map((row) => (index === 1 ? row.tableId : row.eventId)),
        ),
      );
      expect(await read({ limit: 1, statuses: [], query: "Alpha" })).toEqual({
        items: [],
        nextCursor: null,
      });
      expect((await read({ limit: 20, statuses: ["PLANNING"] })).items).toHaveLength(
        index === 2 ? 2 : index === 1 ? 0 : 1,
      );
      expect((await read({ limit: 20, statuses: ["CONFIRMED"], query: ".*" })).items).toHaveLength(
        1,
      );
    }
    expect(
      (
        await services().plannedEventService.list(GUEST, {
          limit: 20,
          section: "available",
          statuses: ["PLANNING"],
          query: "Alpha",
        })
      ).items.map((row) => row.id),
    ).toEqual([adminOnly.id]);
    expect(
      (
        await services().plannedEventService.list(GUEST, {
          limit: 20,
          section: "available",
          statuses: ["CONFIRMED"],
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await services().plannedEventService.personalTables(OUTSIDER, {
          limit: 20,
          statuses: ["PLANNING", "CONFIRMED", "TERMINATED"],
        })
      ).items,
    ).toEqual([]);
    await expect(
      services().plannedEventService.list(OUTSIDER, { limit: 1, statuses: [] }, group.id),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_REQUIRED" });
  });
  it("partitions Events before paging by accepted Group access and actual registrations/demonstrations, including current management and standalone creation", async () => {
    const privateClub = await privateGroup();
    const make = async (groupId: string | null, name: string, demonstratorUserId?: string) => {
      const input = plannedInput(groupId);
      input.name = name;
      input.tables[0].id = randomUUID();
      if (demonstratorUserId) input.tables[0].demonstratorUserId = demonstratorUserId;
      if (groupId === publicClub.id) {
        input.endsAt = "2030-06-03T20:00:00Z";
        input.bookingClosesAt = "2030-06-02T18:00:00Z";
      }
      const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
      return { event, tableId: input.tables[0].id! };
    };
    const at = new Date().toISOString();
    const publicClub = groupRecordSchema.parse({
      id: randomUUID(),
      type: "PUBLIC",
      adminUserId: OWNER,
      approved: { name: "Public member club", logoAssetId: randomUUID(), location },
      reservedNames: ["public member club"],
      version: 1,
      createdAt: at,
      updatedAt: at,
    });
    await db.collection(COLLECTIONS.GROUPS).insertOne(publicClub);
    for (const [userId, kind, status] of [
      [GUEST, "REQUEST", "ACCEPTED"],
      [OTHER, "INVITATION", "PENDING"],
      [DEMO, "REQUEST", "PENDING"],
    ] as const)
      await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).insertOne({
        id: randomUUID(),
        groupId: publicClub.id,
        userId,
        invitedBy: OWNER,
        kind,
        status,
        version: 1,
        createdAt: at,
        updatedAt: at,
      });
    const available = await make(privateClub.id, "Alpha available");
    const active = await make(privateClub.id, "Beta participating");
    const invited = await make(privateClub.id, "Gamma invitation");
    const standalone = await make(null, "Standalone administration");
    const demonstration = await make(publicClub.id, "Public demonstration", GUEST);
    const ownerDemo = await make(publicClub.id, "Public owner demonstration", OWNER);
    await transaction((s) =>
      s.plannedEventService.register(GUEST, active.event.id, active.tableId),
    );
    const invitation = await transaction((s) =>
      s.plannedEventService.register(OWNER, invited.event.id, invited.tableId, GUEST),
    );
    const list = async (user: string, section: "mine" | "available", query?: string) =>
      (await services().plannedEventService.list(user, { limit: 20, section, query })).items;
    expect((await list(GUEST, "mine")).map((r) => r.id).sort()).toEqual(
      [active.event.id, invited.event.id, demonstration.event.id].sort(),
    );
    expect((await list(GUEST, "available")).map((r) => r.id).sort()).toEqual(
      [available.event.id, ownerDemo.event.id].sort(),
    );
    expect((await list(OWNER, "mine")).map((r) => r.id).sort()).toEqual(
      [
        available.event.id,
        active.event.id,
        invited.event.id,
        standalone.event.id,
        demonstration.event.id,
        ownerDemo.event.id,
      ].sort(),
    );
    expect(await list(OWNER, "available")).toEqual([]);
    expect((await list(OWNER, "mine")).find((row) => row.id === ownerDemo.event.id)).toMatchObject({
      role: "admin",
      myDemonstrator: true,
    });
    expect(
      (await services().plannedEventService.personalTables(OWNER, { limit: 20 })).items.map(
        (r) => r.id,
      ),
    ).toEqual([]);
    expect(
      (await services().plannedEventService.personalTables(GUEST, { limit: 20 })).items.some(
        (r) => r.id === demonstration.tableId,
      ),
    ).toBe(false);
    for (const user of [OTHER, DEMO, OUTSIDER])
      for (const section of ["mine", "available"] as const)
        expect((await list(user, section)).some((r) => r.groupId === publicClub.id)).toBe(false);
    for (const user of [OTHER, DEMO, OUTSIDER]) {
      const membership = await services().groupRecords.membership(publicClub.id, user);
      expect(await services().plannedEventService.detail(user, ownerDemo.event.id)).toMatchObject({
        role: "viewer",
        readOnly: true,
        canRegister: true,
        canVote: false,
        canEdit: false,
        canInvite: false,
        canConfirm: false,
        canReplan: false,
        canFinalize: false,
      });
      expect(
        await services().plannedEventService.tableDetail(
          user,
          ownerDemo.event.id,
          ownerDemo.tableId,
        ),
      ).toMatchObject({
        readOnly: true,
        canRegister: true,
        canInvite: false,
        canLeave: false,
        canRespond: false,
      });
      expect(
        await transaction((s) =>
          s.plannedEventService.register(user, ownerDemo.event.id, ownerDemo.tableId),
        ),
      ).toMatchObject({ userId: user, kind: "SELF", status: "ACCEPTED" });
      expect(await services().groupRecords.membership(publicClub.id, user)).toEqual(membership);
      expect((await list(user, "mine")).some((row) => row.id === ownerDemo.event.id)).toBe(true);
      expect(
        (await services().plannedEventService.personalTables(user, { limit: 20 })).items.some(
          (row) => row.id === ownerDemo.tableId,
        ),
      ).toBe(false);
    }
    expect(
      await services().plannedEventService.tableDetail(
        OUTSIDER,
        ownerDemo.event.id,
        ownerDemo.tableId,
      ),
    ).toMatchObject({ myPosition: "WAITING", myRegistration: { status: "ACCEPTED" } });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await services().plannedEventService.list(GUEST, {
        limit: 1,
        section: "mine",
        query: "a",
        cursor,
      });
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.sort()).toEqual([active.event.id, invited.event.id, demonstration.event.id].sort());
    expect(await list(GUEST, "mine", ".*")).toEqual([]);
    await transaction((s) =>
      s.plannedEventService.registrationAction(GUEST, invitation.id, {
        action: "decline",
        version: invitation.version,
      }),
    );
    expect((await list(GUEST, "mine")).some((r) => r.id === invited.event.id)).toBe(false);
    expect((await list(GUEST, "available")).some((r) => r.id === invited.event.id)).toBe(true);
    expect(
      (
        await services().unifiedGroupService.list(GUEST, "mine", {
          limit: 20,
          query: "n",
          roles: ["accepted"],
        })
      ).items.map((r) => r.id),
    ).toEqual([privateClub.id]);
    await transaction((s) =>
      s.unifiedGroupService.ban(OWNER, publicClub.id, { userId: GUEST, until: null }),
    );
    for (const section of ["mine", "available"] as const)
      expect((await list(GUEST, section)).some((r) => r.groupId === publicClub.id)).toBe(false);
  });

  it("source-pages the combined personal Table list and legacy sections without gaps, duplicate rows, admin seats or guessed agreement positions", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.tables = Array.from({ length: 6 }, (_, i) => ({
      ...input.tables[0],
      id: randomUUID(),
      name: i === 1 ? "Seat .* alpha" : `Seat ${i}`,
    }));
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const ids = input.tables.map((r) => r.id!);
    expect(
      (await services().plannedEventService.personalTables(OWNER, { limit: 1 })).items,
    ).toEqual([]);
    for (const [i, id] of ids.entries()) {
      await db
        .collection(COLLECTIONS.EVENT_TABLES)
        .updateOne(
          { id },
          { $set: { createdAt: new Date(Date.now() - 100000 + i * 1000).toISOString() } },
        );
      if (i < 3) await transaction((s) => s.plannedEventService.register(GUEST, event.id, id));
    }
    for (const user of [OWNER, OTHER, GUEST])
      await transaction((s) => s.plannedEventService.register(user, event.id, ids[3]));
    await transaction((s) => s.plannedEventService.register(OWNER, event.id, ids[4], GUEST));
    const historical = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, ids[5], GUEST),
    );
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .updateOne({ id: historical.id }, { $set: { kind: "SELF" } });
    expect(
      (await services().plannedEventService.personalTables(GUEST, { limit: 1 })).items,
    ).toEqual([]);
    for (const [section, expected] of [
      ["mine", ids.slice(0, 3)],
      ["waiting", ids.slice(3)],
    ] as const) {
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await services().plannedEventService.personalTables(GUEST, {
          limit: 1,
          section,
          cursor,
        });
        expect(page.items).toHaveLength(1);
        seen.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toHaveLength(expected.length);
      expect(new Set(seen)).toEqual(new Set(expected));
    }
    expect(
      (
        await services().plannedEventService.personalTables(GUEST, { limit: 1, query: ".*" })
      ).items.map((r) => r.id),
    ).toEqual([]);
    expect(
      (await services().plannedEventService.tables(OWNER, event.id, { limit: 20 })).items,
    ).toHaveLength(6);
    const waiting = await services().plannedEventService.personalTables(GUEST, {
      limit: 20,
      section: "waiting",
    });
    expect(waiting.items.find((r) => r.id === ids[3])).toMatchObject({
      myPosition: "WAITING",
      myRegistration: { status: "ACCEPTED" },
    });
    expect(waiting.items.find((r) => r.id === ids[4])).toMatchObject({
      myRegistration: { kind: "INVITATION", status: "PENDING" },
    });
    expect(waiting.items.find((r) => r.id === ids[5])).toMatchObject({
      myRegistration: { kind: "SELF", status: "PENDING" },
    });
    expect(
      (await services().plannedEventService.personalTables(OTHER, { limit: 20 })).items.map(
        (r) => r.id,
      ),
    ).toEqual([]);
  });

  async function voteYes(eventId: string, user: string, target = tableId) {
    const event = (await services().eventRecords.find(eventId))!;
    const table = (await services().eventRecords.table(target))!;
    if (event.dates.length > 1)
      await transaction((s) =>
        s.plannedEventService.vote(user, eventId, { kind: "date", optionId: dateId, vote: "YES" }),
      );
    if (event.locations.length > 1)
      await transaction((s) =>
        s.plannedEventService.vote(user, eventId, {
          kind: "location",
          optionId: venueId,
          vote: "YES",
        }),
      );
    if (table.games.length > 1)
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
  it("returns complete own Event positions for a truthful aggregate without client paging or organizer seats", async () => {
    const group = await privateGroup(),
      input = plannedInput(group.id);
    input.tables.push({ ...input.tables[0], id: secondId, name: "Invitation table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    expect(event.myRegistrations).toEqual([]);
    expect(eventParticipation(event.myRegistrations)).toBeNull();
    for (const user of [OWNER, GUEST, OTHER])
      await transaction((s) => s.plannedEventService.register(user, event.id, tableId));
    let detail = await services().plannedEventService.detail(OTHER, event.id);
    expect(detail.myRegistrations).toHaveLength(1);
    expect(detail.myRegistrations[0]).toMatchObject({ userId: OTHER, position: "WAITING" });
    expect(eventParticipation(detail.myRegistrations)).toBe("waiting");
    const invitation = await transaction((s) =>
      s.plannedEventService.register(OWNER, event.id, secondId, OTHER),
    );
    const page = await services().plannedEventService.list(OTHER, { limit: 1 }, group.id);
    expect(page.items[0].myRegistrations).toHaveLength(2);
    expect(page.items[0].myRegistrations.every((row) => row.userId === OTHER)).toBe(true);
    expect(eventParticipation(page.items[0].myRegistrations)).toBe("invitation");
    const choices = await participation(event.id, secondId);
    await transaction((s) =>
      s.plannedEventService.registrationAction(OTHER, invitation.id, {
        action: "accept",
        version: invitation.version,
        participation: choices,
      }),
    );
    detail = await services().plannedEventService.detail(OTHER, event.id);
    expect(detail.myRegistrations.find((row) => row.tableId === secondId)?.position).toBe("SEATED");
    expect(eventParticipation(detail.myRegistrations)).toBe("confirmed");
    for (const user of [OWNER, GUEST]) await voteYes(event.id, user);
    await confirm(event.id);
    detail = await services().plannedEventService.detail(OTHER, event.id);
    expect(eventParticipation(detail.myRegistrations)).toBe("waiting");
    expect(
      eventParticipation(
        (await services().plannedEventService.detail(GUEST, event.id)).myRegistrations,
      ),
    ).toBe("confirmed");
    expect(
      await db
        .collection(COLLECTIONS.TABLE_REGISTRATIONS)
        .countDocuments({ position: { $exists: true } }),
    ).toBe(0);
    await expect(services().plannedEventService.detail(OUTSIDER, event.id)).rejects.toMatchObject({
      code: "GROUP_MEMBER_REQUIRED",
    });
  });

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
      const beforeRemoval = await services().plannedEventService.invitationCandidates(
        OWNER,
        event.id,
        tableId,
        { limit: 20, query: "b_accepted" },
      );
      expect(beforeRemoval.items).toEqual([]);
      const active = (await services().eventRecords.allRegistrations(event.id)).find(
        (row) => row.userId === "b_accepted" && row.tableId === tableId,
      );
      if (!active) throw new Error("Missing accepted registration");
      const removed = await transaction((s) =>
        s.plannedEventService.registrationAction(OWNER, active.id, {
          action: "remove",
          version: active.version,
        }),
      );
      const released = await services().plannedEventService.invitationCandidates(
        OWNER,
        event.id,
        tableId,
        { limit: 20, query: "b_accepted" },
      );
      expect(released.items.map((row) => row.id)).toEqual(["b_accepted"]);
      expect(released.nextCursor).toBeNull();
      expect(released.eventVersion).toBe(removed.eventVersion);
      expect(beforeRemoval.eventVersion).toBeLessThan(removed.eventVersion);
      const invitedAgain = await invite("b_accepted");
      expect(invitedAgain.status).toBe("PENDING");
      expect(invitedAgain.gameVotes).toEqual({});
      const reservedAgain = await services().plannedEventService.invitationCandidates(
        OWNER,
        event.id,
        tableId,
        { limit: 20, query: "b_accepted" },
      );
      expect(reservedAgain.items).toEqual([]);
      expect(reservedAgain.eventVersion).toBe(invitedAgain.eventVersion);
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
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    "commits explicit singleton consent and mixed ballots without synthetic votes on MongoDB: %s",
    async (mask) => {
      const group = await privateGroup(),
        input = plannedInput(group.id);
      if (mask & 1) input.dates.push({ id: secondId, day: "2030-06-04" });
      if (mask & 2)
        input.locations.push({ ...input.locations[0], id: secondId, name: "Second venue" });
      if (mask & 4) {
        await db
          .collection(COLLECTIONS.BOARD_GAMES)
          .insertOne({ id: 2, name: "Second game", isExpansion: false });
        input.tables[0].games.push({ gameId: 2, manualDurationMinutes: 60 });
      }
      const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
      const ownerChoices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(OWNER, event.id, tableId, ownerChoices));
      const invitation = await transaction((s) =>
        s.plannedEventService.register(OWNER, event.id, tableId, GUEST),
      );
      expect((await services().plannedEventService.detail(OWNER, event.id)).agreement?.agreed).toBe(
        false,
      );
      expect(await services().eventRecords.voter(event.id, GUEST)).toBeNull();
      const choices = await participation(event.id, tableId);
      const failure = vi
        .spyOn(EventRecordsRepository.prototype, "saveVoter")
        .mockRejectedValueOnce(new Error("Consent storage failed"));
      try {
        await expect(
          transaction((s) =>
            s.plannedEventService.registrationAction(GUEST, invitation.id, {
              action: "accept",
              version: invitation.version,
              participation: choices,
            }),
          ),
        ).rejects.toThrow("Consent storage failed");
      } finally {
        failure.mockRestore();
      }
      expect(await services().eventRecords.registration(invitation.id)).toMatchObject({
        status: "PENDING",
        version: invitation.version,
        gameVotes: {},
      });
      expect(await services().eventRecords.voter(event.id, GUEST)).toBeNull();
      expect((await services().eventRecords.find(event.id))?.version).toBe(choices.version);
      await transaction((s) =>
        s.plannedEventService.registrationAction(GUEST, invitation.id, {
          action: "accept",
          version: invitation.version,
          participation: choices,
        }),
      );
      const accepted = (await services().eventRecords.registration(invitation.id))!;
      expect(accepted.gameVotes).toEqual(mask & 4 ? { "1": "YES", "2": "YES" } : {});
      expect(await services().eventRecords.voter(event.id, GUEST)).toMatchObject({
        dateVotes: mask & 1 ? { [dateId]: "YES", [secondId]: "YES" } : {},
        locationVotes: mask & 2 ? { [venueId]: "YES", [secondId]: "YES" } : {},
      });
      const current = (await services().eventRecords.find(event.id))!;
      for (const [kind, bit] of [
        ["date", 1],
        ["location", 2],
        ["game", 4],
      ] as const) {
        if (mask & bit) continue;
        await expect(
          transaction((s) =>
            s.plannedEventService.vote(GUEST, event.id, {
              ...(kind === "game"
                ? { kind, tableId, gameId: 1 }
                : { kind, optionId: kind === "date" ? dateId : venueId }),
              vote: "YES",
            }),
          ),
        ).rejects.toMatchObject({ code: "FIXED_OPTION" });
      }
      expect((await services().eventRecords.find(event.id))?.version).toBe(current.version);
      if (mask === 0) {
        await services().eventRecords.saveRegistration({ ...accepted, gameVotes: { "1": "NO" } });
        await services().eventRecords.saveVoter({
          eventId: event.id,
          userId: GUEST,
          dateVotes: { [dateId]: "NO" },
          locationVotes: { [venueId]: "UNKNOWN" },
          updatedAt: current.updatedAt,
        });
      }
      expect((await services().plannedEventService.detail(OWNER, event.id)).agreement?.agreed).toBe(
        true,
      );
      expect((await services().eventRecords.find(event.id))?.status).toBe("PLANNING");
      await confirm(event.id);
      expect((await services().eventRecords.table(tableId))?.confirmed?.playerIds).toEqual([
        OWNER,
        GUEST,
      ]);
      if (mask === 0)
        expect((await services().eventRecords.registration(invitation.id))?.gameVotes).toEqual({
          "1": "NO",
        });
      expect(await db.collection(COLLECTIONS.MATCHES).countDocuments()).toBe(0);
    },
  );
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
      await expect(
        transaction((s) =>
          s.plannedEventService.vote(user, event.id, {
            kind: "game",
            tableId,
            gameId: 1,
            vote: "YES",
          }),
        ),
      ).rejects.toMatchObject({ code: "FIXED_OPTION" });
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
    ).toHaveLength(0);
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
    input.dates.push({ id: secondId, day: "2030-06-04" });
    input.locations.push({ ...input.locations[0], id: secondId, name: "Second venue" });
    input.tables.push({ ...input.tables[0], id: secondTableId, name: "Second private table" });
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    const availability = {
      version: event.version,
      dateVotes: { [dateId]: "YES" as const, [secondId]: "NO" as const },
      locationVotes: { [venueId]: "IF_NEEDED" as const, [secondId]: "NO" as const },
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
      gameVotes: {},
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
    expect((await services().eventRecords.userRegistration(tableId, GUEST))?.gameVotes).toEqual({});
    const beforeRepeat = (await services().eventRecords.find(event.id))!;
    const updatedAvailability = {
      version: beforeRepeat.version,
      dateVotes: { [dateId]: "YES" as const, [secondId]: "NO" as const },
      locationVotes: { [venueId]: "YES" as const, [secondId]: "NO" as const },
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
      (await services().eventRecords.userRegistration(secondTableId, GUEST))?.gameVotes,
    ).toEqual({});
    expect((await services().eventRecords.userRegistration(tableId, GUEST))?.gameVotes).toEqual({});
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
  it("source-pages private/public admin, member and pending invitation roles, excluding requests/left/banned and legacy Groups", async () => {
    const rows: Array<{
      id: string;
      type: "PRIVATE" | "PUBLIC";
      eligible: boolean;
      createdAt: string;
    }> = [];
    for (const role of [
      "member",
      "invited",
      "admin",
      "requested",
      "left",
      "member",
      "declined",
      "banned",
      "none",
    ]) {
      for (const type of ["PRIVATE", "PUBLIC"] as const) {
        if (role === "requested" && type === "PRIVATE") continue;
        const id = randomUUID(),
          createdAt = new Date(Date.UTC(2030, 0, 1, 0, 0, rows.length)).toISOString();
        const name = `Tabbed ${type} ${role} ${rows.length}`;
        const revision = {
          name,
          ...(type === "PUBLIC"
            ? { logoAssetId: randomUUID(), location: { ...location, timeZone: "Europe/Rome" } }
            : {}),
        };
        await db.collection(COLLECTIONS.GROUPS).insertOne(
          groupRecordSchema.parse({
            id,
            type,
            adminUserId: role === "admin" ? GUEST : OWNER,
            approved: revision,
            reservedNames: type === "PUBLIC" ? [name.toLowerCase()] : [],
            version: 1,
            createdAt,
            updatedAt: createdAt,
          }),
        );
        if (!["admin", "none"].includes(role))
          await db.collection(COLLECTIONS.GROUP_MEMBERSHIPS).insertOne({
            id: randomUUID(),
            groupId: id,
            userId: GUEST,
            kind: role === "requested" ? "REQUEST" : "INVITATION",
            status: ["member", "banned"].includes(role)
              ? "ACCEPTED"
              : role === "left"
                ? "LEFT"
                : role === "declined"
                  ? "DECLINED"
                  : "PENDING",
            version: 1,
            createdAt,
            updatedAt: createdAt,
          });
        if (role === "banned")
          await db.collection(COLLECTIONS.GROUP_BANS).insertOne({
            id: randomUUID(),
            groupId: id,
            userId: GUEST,
            adminUserId: OWNER,
            until: null,
            createdAt,
          });
        rows.push({ id, type, createdAt, eligible: ["admin", "member", "invited"].includes(role) });
      }
    }
    const proposalId = randomUUID(),
      at = "2030-06-01T00:00:00.000Z";
    await db.collection(COLLECTIONS.GROUPS).insertOne(
      groupRecordSchema.parse({
        id: proposalId,
        type: "PUBLIC",
        adminUserId: GUEST,
        proposal: {
          name: "Tabbed public proposal",
          logoAssetId: randomUUID(),
          location: { ...location, timeZone: "Europe/Rome" },
        },
        reviewStatus: "PENDING",
        reservedNames: ["tabbed public proposal"],
        version: 1,
        createdAt: at,
        updatedAt: at,
      }),
    );
    rows.push({ id: proposalId, type: "PUBLIC", createdAt: at, eligible: true });
    await db.collection(COLLECTIONS.GROUPS).insertOne({
      id: randomUUID(),
      name: "Tabbed legacy",
      adminUserId: GUEST,
      isPublic: true,
      createdAt: at,
    });
    for (const type of ["PRIVATE", "PUBLIC"] as const) {
      const expected = rows
        .filter((row) => row.type === type && row.eligible)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((row) => row.id);
      const actual: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await services().unifiedGroupService.list(GUEST, "mine", {
          type,
          roles: groupRecordMemberRoles,
          query: "Tabbed",
          limit: 2,
          cursor,
        });
        expect(page.items).toHaveLength(Math.min(2, expected.length - actual.length));
        expect(
          page.items.every(
            (row) => row.type === type && ["admin", "accepted", "invited"].includes(row.role),
          ),
        ).toBe(true);
        for (const row of page.items.filter((item) => item.role === "invited")) {
          expect(row.myMembership?.status).toBe("PENDING");
          expect(row.canViewEvents).toBe(false);
          expect(row.canViewRankings).toBe(false);
          expect(row.canSocialInteract).toBe(false);
        }
        actual.push(...page.items.map((row) => row.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(actual).toEqual(expected);
      expect(
        (
          await services().unifiedGroupService.list(GUEST, "mine", {
            type,
            roles: groupRecordMemberRoles,
            query: "Absent",
            limit: 2,
          })
        ).items,
      ).toEqual([]);
    }
    const discovery = await services().unifiedGroupService.list(GUEST, "public", {
      query: "Tabbed",
      limit: 50,
    });
    expect(discovery.items.every((row) => row.type === "PUBLIC" && row.approved)).toBe(true);
    expect(discovery.items.some((row) => row.id === proposalId)).toBe(false);
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

  async function frozenAccessFixture(type: "PRIVATE" | "PUBLIC", queuedUser?: string) {
    let group: Awaited<ReturnType<typeof privateGroup>>;
    if (type === "PRIVATE") group = await privateGroup();
    else {
      await transaction((s) => s.relationships.becomeFriends(OWNER, GUEST));
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
      group = await transaction(async (s) => {
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
          type,
          name: "Frozen public club",
          logoAssetId: asset.id,
          location,
          invitedUserIds: [],
        });
      });
      group = await transaction((s) =>
        s.unifiedGroupService.review("moderator", group.id, {
          version: group.version,
          decision: "approve",
        }),
      );
      const request = await transaction((s) => s.unifiedGroupService.request(GUEST, group.id));
      await transaction((s) =>
        s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
          action: "approve",
          version: request.version,
        }),
      );
    }
    const input = plannedInput(group.id);
    if (type === "PUBLIC") {
      input.endsAt = "2030-06-03T21:00:00Z";
      input.bookingClosesAt = "2030-06-02T10:00:00Z";
    }
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
    for (const user of [OWNER, GUEST]) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(user, event.id, tableId, choices));
    }
    if (queuedUser) {
      const choices = await participation(event.id, tableId);
      await transaction((s) => s.plannedEventService.join(queuedUser, event.id, tableId, choices));
    }
    const frozen = await confirm(event.id);
    vi.setSystemTime(new Date("2030-06-01T10:01:00Z"));
    const ban = await transaction((s) =>
      s.unifiedGroupService.ban(OWNER, group.id, { userId: GUEST, until: null }),
    );
    return { group, event: frozen, ban };
  }

  it("keeps personal notification hierarchy inside frozen Tables and outside Group-context targets", async () => {
    const { group, event } = await frozenAccessFixture("PUBLIC");
    const table = await services().eventRecords.table(tableId);
    const own = await services().eventRecords.userRegistration(tableId, GUEST);
    if (!table || !own) throw new Error("Missing personal attention fixture");
    const { confirmed: _confirmed, ...excluded } = table;
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .insertOne({ ...excluded, id: secondId, order: 1 });
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .insertOne({ ...own, id: randomUUID(), tableId: secondId, status: "PENDING", sequence: 3 });
    const notices = await services().notifications.notifyMany([
      {
        kind: "table_invitation",
        recipientUserId: GUEST,
        actorUserId: OWNER,
        resourceName: "Sibling invitation",
        resourceHref: `/events/${event.id}/tables/${secondId}`,
        attentionItems: [
          { id: notificationItemId(secondId, "invitation", undefined, "table"), revision: 1 },
        ],
      },
      {
        kind: "event_updated",
        recipientUserId: GUEST,
        actorUserId: OWNER,
        resourceName: "Personal Event",
        resourceHref: `/events/${event.id}`,
        attentionItems: [{ id: notificationItemId(event.id, "overview"), revision: event.version }],
      },
      {
        kind: "event_updated",
        recipientUserId: GUEST,
        actorUserId: OWNER,
        resourceName: "Frozen Table",
        resourceHref: `/events/${event.id}/tables/${tableId}`,
        attentionItems: [
          {
            id: notificationItemId(tableId, "overview", undefined, "table"),
            revision: event.version,
          },
        ],
      },
      {
        kind: "event_updated",
        recipientUserId: GUEST,
        actorUserId: OWNER,
        resourceName: "Mixed owners",
        resourceHref: `/events/${event.id}`,
        attentionItems: [
          {
            id: notificationItemId(tableId, "overview", undefined, "table"),
            revision: event.version,
          },
          { id: notificationItemId(secondId, "invitation", undefined, "table"), revision: 1 },
          { id: notificationItemId(group.id, "overview", undefined, "group"), revision: 1 },
        ],
      },
      {
        kind: "event_updated",
        recipientUserId: GUEST,
        actorUserId: OWNER,
        resourceName: "Sibling-only Event notice",
        resourceHref: `/events/${event.id}`,
        attentionItems: [
          { id: notificationItemId(secondId, "invitation", undefined, "table"), revision: 1 },
        ],
      },
    ]);
    await expect(
      services().plannedEventService.tableDetail(GUEST, event.id, secondId),
    ).rejects.toMatchObject({ code: "TABLE_NOT_FOUND" });
    const { snapshot, references } = await new NotificationAttentionRepository(db).snapshot(
      GUEST,
      [
        { kind: "table", id: secondId },
        { kind: "event-list", id: group.id },
      ],
      notices.map(String),
    );
    expect(references.has(String(notices[0]))).toBe(false);
    expect(snapshot.targets.map((row) => row.count)).toEqual([0, 0]);
    expect(references.get(String(notices[1]))).not.toHaveProperty("groupId");
    expect(references.get(String(notices[1]))).toMatchObject({
      lists: [{ kind: "event-list", id: "mine" }],
    });
    expect(references.get(String(notices[2]))?.tableIds).toEqual([tableId]);
    expect(references.get(String(notices[3]))?.itemIds).toEqual([
      notificationItemId(tableId, "overview", undefined, "table"),
    ]);
    expect(references.has(String(notices[4]))).toBe(false);
    const ownedItem = notificationItemId(tableId, "overview", undefined, "table");
    const itemScope = await new NotificationAttentionRepository(db).snapshot(GUEST, [
      { kind: "item", id: ownedItem },
    ]);
    // Only the standalone owned notice completes; hidden siblings keep the mixed inbox row unread.
    expect(itemScope.snapshot.targets[0].readEffect?.unread).toBe(1);
    // Expiry/revocation cannot broaden a preserved personal snapshot into sibling routes.
    await transaction((s) => s.unifiedGroupService.revoke(OWNER, group.id, GUEST));
    expect(
      (
        await new NotificationAttentionRepository(db).snapshot(GUEST, [], notices.map(String))
      ).references.has(String(notices[0])),
    ).toBe(false);
    expect(
      (await services().eventRecords.personalTables(GUEST, { limit: 20 })).map((row) => row.id),
    ).toEqual([tableId]);
    // Frozen personal participation still belongs in mine even without an active registration row.
    await db
      .collection(COLLECTIONS.TABLE_REGISTRATIONS)
      .updateOne({ tableId, userId: GUEST }, { $set: { status: "CANCELLED" } });
    const cancelled = await new NotificationAttentionRepository(db).snapshot(
      GUEST,
      [],
      notices.map(String),
    );
    expect(cancelled.references.get(String(notices[1]))?.lists).toEqual([
      { kind: "event-list", id: "mine" },
    ]);
    // Demonstrator-only access uses the same frozen Table scope.
    await db
      .collection(COLLECTIONS.EVENT_TABLES)
      .updateOne(
        { id: tableId },
        { $set: { "confirmed.playerIds": [OWNER, OTHER], demonstratorUserId: GUEST } },
      );
    expect(
      (
        await new NotificationAttentionRepository(db).snapshot(GUEST, [], notices.map(String))
      ).references.get(String(notices[2]))?.tableIds,
    ).toEqual([tableId]);
    // Current accepted, unbanned members retain independent sibling and Group-context authority.
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId: group.id, userId: GUEST }, { $set: { status: "ACCEPTED" } });
    const member = await new NotificationAttentionRepository(db).snapshot(
      GUEST,
      [{ kind: "event-list", id: group.id }],
      notices.map(String),
    );
    expect(member.references.has(String(notices[0]))).toBe(true);
    expect(member.references.get(String(notices[1]))?.groupId).toBe(group.id);
    expect(member.snapshot.targets[0].count).toBeGreaterThan(0);
    await db
      .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
      .updateOne({ groupId: group.id, userId: GUEST }, { $set: { status: "LEFT" } });
    await new NotificationAttentionRepository(db).read(GUEST, {
      target: { kind: "item", id: ownedItem },
      through: new Date().toISOString(),
    });
    const mixed = await db.collection(COLLECTIONS.NOTIFICATIONS).findOne({ _id: notices[3] });
    expect(mixed).not.toHaveProperty("readAt");
    expect(
      mixed?.attentionItems.find((item: { id: string }) => item.id === ownedItem).readAt,
    ).toBeInstanceOf(Date);
    expect(
      mixed?.attentionItems.find(
        (item: { id: string }) =>
          item.id === notificationItemId(secondId, "invitation", undefined, "table"),
      ),
    ).not.toHaveProperty("readAt");
  });

  it("hides queued-author PUBLIC profile activity from a banned personal-only frozen viewer", async () => {
    for (const viewer of [GUEST, OUTSIDER])
      await transaction((s) => s.relationships.follow(viewer, OTHER));
    const { event } = await frozenAccessFixture("PUBLIC", OTHER);
    expect((await services().eventRecords.table(tableId))?.confirmed?.playerIds).toEqual([
      OWNER,
      GUEST,
    ]);
    expect(await services().eventRecords.userRegistration(tableId, OTHER)).toMatchObject({
      status: "ACCEPTED",
    });
    expect(
      await db
        .collection(COLLECTIONS.PROFILE_ACTIVITIES)
        .countDocuments({ userId: OTHER, eventId: event.id, tableId, kind: "table_join" }),
    ).toBe(1);
    const profile = new ProfileService(db);
    expect(
      (await profile.feed(OWNER, OTHER, { kind: "table_join", limit: 10 })).items,
    ).toHaveLength(1);
    expect(
      (await profile.feed(OUTSIDER, OTHER, { kind: "table_join", limit: 10 })).items,
    ).toHaveLength(1);
    expect((await profile.feed(GUEST, OTHER, { kind: "table_join", limit: 10 })).items).toEqual([]);
    const candidates = await new ProfileActivitiesRepository(db).networkPage(
      GUEST,
      "following",
      [],
      undefined,
      "table_join",
    );
    expect(
      candidates.filter((row) => row.userId === OTHER && row.tableId === tableId),
    ).toHaveLength(1);
    expect(
      (await profile.networkFeed(OUTSIDER, { network: "following", kind: "table_join", limit: 10 }))
        .items,
    ).toHaveLength(1);
    expect(
      (await profile.networkFeed(GUEST, { network: "following", kind: "table_join", limit: 10 }))
        .items,
    ).toEqual([]);
    expect(
      await services().plannedEventService.activityResource(GUEST, event.id, tableId),
    ).toMatchObject({ href: `/events/${event.id}/tables/${tableId}` });
  });

  it.each(["PRIVATE", "PUBLIC"] as const)(
    "matches detail, aggregate, personal list and hierarchy authorization for %s frozen access",
    async (type) => {
      const { group, event, ban } = await frozenAccessFixture(type);
      const assertAccess = async (visible: boolean, role = "participant") => {
        const s = services();
        expect((await s.eventRecords.list(GUEST, { limit: 20 })).map((row) => row.id)).toEqual(
          visible ? [event.id] : [],
        );
        expect(
          (await s.eventRecords.personalTables(GUEST, { limit: 20 })).map((row) => row.id),
        ).toEqual(visible && role === "participant" ? [tableId] : []);
        const hierarchy = await db
          .collection(COLLECTIONS.EVENTS)
          .aggregate([
            { $match: { id: event.id } },
            ...s.eventRecords.visibleGroups(GUEST, new Date().toISOString()),
          ])
          .toArray();
        expect(hierarchy.map((row) => row.id)).toEqual(visible ? [event.id] : []);
        expect(
          (await s.plannedEventService.list(GUEST, { limit: 20 })).items.map((row) => row.id),
        ).toEqual(visible ? [event.id] : []);
        expect(
          (await s.plannedEventService.personalTables(GUEST, { limit: 20 })).items.map(
            (row) => row.id,
          ),
        ).toEqual(visible && role === "participant" ? [tableId] : []);
        if (!visible) {
          await expect(s.plannedEventService.detail(GUEST, event.id)).rejects.toMatchObject({
            code: "GROUP_BANNED",
          });
          await expect(
            s.plannedEventService.tableDetail(GUEST, event.id, tableId),
          ).rejects.toMatchObject({ code: "GROUP_BANNED" });
          return;
        }
        expect(await s.plannedEventService.detail(GUEST, event.id)).toMatchObject({
          personalAccessOnly: true,
          role,
          groupId: null,
          readOnly: true,
          canManage: false,
          accessRevokedGroupId: group.id,
        });
        expect(await s.plannedEventService.tableDetail(GUEST, event.id, tableId)).toMatchObject({
          personalAccessOnly: true,
          groupId: null,
          canInvite: false,
        });
        expect(
          await s.plannedEventService.activityResource(GUEST, event.id, tableId),
        ).not.toHaveProperty("groupId");
        const currentBan = await s.groupRecords.ban(group.id, GUEST);
        if (
          type === "PRIVATE" ||
          (!currentBan?.revokedAt &&
            (!currentBan?.until || Date.parse(currentBan.until) > Date.now()))
        )
          await expect(
            s.unifiedGroupService.members(GUEST, group.id, "accepted", { limit: 20 }),
          ).rejects.toBeDefined();
        else
          expect(await s.unifiedGroupService.detail(GUEST, group.id)).toMatchObject({
            canViewEvents: false,
            canViewRankings: false,
            canSocialInteract: false,
          });
        await expect(
          s.plannedEventService.list(GUEST, { limit: 20 }, group.id),
        ).rejects.toBeDefined();
      };
      await assertAccess(true);
      for (const historical of [
        { ...ban, until: "2030-06-01T10:00:00Z" },
        { ...ban, revokedAt: "2030-06-01T10:01:00Z" },
      ]) {
        await services().groupRecords.saveBan(historical);
        await assertAccess(true);
      }
      await services().groupRecords.saveBan(ban);
      for (const at of ["invalid", "2030-06-01T10:02:00Z"]) {
        await db
          .collection(COLLECTIONS.EVENTS)
          .updateOne({ id: event.id }, { $set: { "confirmed.at": at } });
        await assertAccess(false);
      }
      await db
        .collection(COLLECTIONS.EVENTS)
        .updateOne({ id: event.id }, { $unset: { "confirmed.at": "" } });
      await assertAccess(false);
      await db
        .collection(COLLECTIONS.EVENTS)
        .updateOne({ id: event.id }, { $set: { "confirmed.at": event.confirmed!.at } });
      const { memberAccessThrough: _checkpoint, ...legacyBan } = ban;
      await services().groupRecords.saveBan(legacyBan);
      await assertAccess(type === "PUBLIC");
      await db
        .collection(COLLECTIONS.GROUP_BANS)
        .updateOne({ groupId: group.id, userId: GUEST }, { $unset: { createdAt: "" } });
      await assertAccess(false);
      await services().groupRecords.saveBan({
        ...ban,
        memberAccessThrough: "invalid",
        createdAt: "invalid",
      });
      await assertAccess(false);
      await services().groupRecords.saveBan(legacyBan);
      await db
        .collection(COLLECTIONS.EVENTS)
        .updateOne({ id: event.id }, { $set: { visibility: "PRIVATE" } });
      await assertAccess(false);
      await services().groupRecords.saveBan(ban);
      await assertAccess(true);
      // A demonstrator-only snapshot is personal access, not an invented player seat.
      await db
        .collection(COLLECTIONS.EVENT_TABLES)
        .updateOne(
          { id: tableId },
          { $set: { demonstratorUserId: GUEST, "confirmed.playerIds": [OWNER, OTHER] } },
        );
      await assertAccess(true, "demonstrator");
      expect(
        (await services().plannedEventService.tableDetail(GUEST, event.id, tableId)).myPosition,
      ).toBe("WAITING");
      await db
        .collection(COLLECTIONS.TABLE_REGISTRATIONS)
        .updateOne({ eventId: event.id, userId: GUEST }, { $set: { status: "CANCELLED" } });
      expect(
        (await services().plannedEventService.tableDetail(GUEST, event.id, tableId)).myPosition,
      ).toBeNull();
      await assertAccess(true, "demonstrator");
      await db
        .collection(COLLECTIONS.EVENT_TABLES)
        .updateOne({ id: tableId }, { $unset: { demonstratorUserId: "" } });
      await assertAccess(false);
      await db
        .collection(COLLECTIONS.EVENT_TABLES)
        .updateOne({ id: tableId }, { $set: { "confirmed.playerIds": [OWNER, GUEST] } });
      await transaction((s) => s.relationships.block(OWNER, GUEST));
      expect(await services().eventRecords.list(GUEST, { limit: 20 })).toEqual([]);
      await expect(services().plannedEventService.detail(GUEST, event.id)).rejects.toMatchObject({
        code: "EVENT_NOT_FOUND",
      });
      await transaction((s) => s.relationships.unblock(OWNER, GUEST));
      // Current accepted, unbanned authority wins over historical personal-only evidence.
      await services().groupRecords.saveBan({ ...ban, revokedAt: new Date().toISOString() });
      await db
        .collection(COLLECTIONS.GROUP_MEMBERSHIPS)
        .updateOne({ groupId: group.id, userId: GUEST }, { $set: { status: "ACCEPTED" } });
      expect(await services().plannedEventService.detail(GUEST, event.id)).toMatchObject({
        groupId: group.id,
        readOnly: false,
      });
      expect(
        (await services().plannedEventService.detail(GUEST, event.id)).personalAccessOnly,
      ).not.toBe(true);
      expect(
        (await services().eventRecords.list(GUEST, { limit: 20 })).map((row) => row.id),
      ).toEqual([event.id]);
    },
  );

  it.each(["PRIVATE", "PUBLIC"] as const)(
    "retains the prior membership checkpoint on %s reban and never restores cancelled consent",
    async (type) => {
      const { group, event, ban } = await frozenAccessFixture(type);
      await transaction((s) => s.unifiedGroupService.revoke(OWNER, group.id, GUEST));
      vi.setSystemTime(new Date("2030-06-01T10:03:00Z"));
      const reban = await transaction((s) =>
        s.unifiedGroupService.ban(OWNER, group.id, { userId: GUEST, until: null }),
      );
      expect(reban.memberAccessThrough).toBe(ban.memberAccessThrough);
      expect(reban.createdAt).not.toBe(ban.createdAt);
      await db
        .collection(COLLECTIONS.EVENTS)
        .updateOne({ id: event.id }, { $set: { "confirmed.at": "2030-06-01T10:02:00Z" } });
      expect((await services().eventRecords.list(GUEST, { limit: 20 })).length).toBe(
        type === "PUBLIC" ? 1 : 0,
      );
      if (type === "PRIVATE")
        await expect(services().plannedEventService.detail(GUEST, event.id)).rejects.toMatchObject({
          code: "GROUP_BANNED",
        });
      else
        expect(
          (await services().plannedEventService.detail(GUEST, event.id)).personalAccessOnly,
        ).toBe(true);
      if (type === "PUBLIC") {
        await db
          .collection(COLLECTIONS.EVENTS)
          .updateOne({ id: event.id }, { $set: { visibility: "PRIVATE" } });
        expect(await services().eventRecords.list(GUEST, { limit: 20 })).toEqual([]);
        await expect(services().plannedEventService.detail(GUEST, event.id)).rejects.toMatchObject({
          code: "GROUP_BANNED",
        });
        await db
          .collection(COLLECTIONS.EVENTS)
          .updateOne({ id: event.id }, { $set: { visibility: "PUBLIC" } });
      }
      const before = await services().eventRecords.table(tableId);
      if (!before) throw new Error("Missing frozen Table fixture");
      const guestRow = await services().eventRecords.userRegistration(tableId, GUEST);
      if (!guestRow) throw new Error("Missing frozen registration fixture");
      // Retained invitations, queue places and duties on excluded Tables must also be cleared.
      // These persisted legacy shapes deliberately exercise cleanup independently of new-write guards.
      const queueId = randomUUID(),
        pendingId = randomUUID();
      const { confirmed: _frozen, ...excluded } = before;
      await db.collection(COLLECTIONS.EVENT_TABLES).insertMany([
        { ...excluded, id: queueId, order: 1, demonstratorUserId: GUEST },
        { ...excluded, id: pendingId, order: 2 },
      ]);
      await db.collection(COLLECTIONS.TABLE_REGISTRATIONS).insertMany([
        { ...guestRow, id: randomUUID(), tableId: queueId, status: "ACCEPTED", sequence: 3 },
        { ...guestRow, id: randomUUID(), tableId: pendingId, status: "PENDING", sequence: 4 },
        {
          ...guestRow,
          id: randomUUID(),
          tableId: pendingId,
          userId: OTHER,
          status: "ACCEPTED",
          sequence: 5,
        },
      ]);
      await services().groupRecords.saveBan({
        ...ban,
        id: randomUUID(),
        userId: OTHER,
        until: "2030-06-01T10:00:00Z",
      });
      // A transaction failure after cleanup must restore registrations, duties and the Event epoch.
      const registrations = await services().eventRecords.allRegistrations(event.id);
      await expect(
        transaction(async (s) => {
          await s.plannedEventService.transition(OWNER, event.id, {
            action: "replan",
            version: event.version,
          });
          throw new Error("rollback replan");
        }),
      ).rejects.toThrow("rollback replan");
      expect(await services().eventRecords.table(tableId)).toEqual(before);
      expect(await services().eventRecords.allRegistrations(event.id)).toEqual(registrations);
      expect((await services().eventRecords.table(queueId))?.demonstratorUserId).toBe(GUEST);
      expect((await services().eventRecords.find(event.id))?.status).toBe("CONFIRMED");
      await expect(
        transaction((s) =>
          s.plannedEventService.transition(OWNER, event.id, {
            action: "replan",
            version: event.version - 1,
          }),
        ),
      ).rejects.toMatchObject({ code: "EVENT_CHANGED" });
      const next = await transaction((s) =>
        s.plannedEventService.transition(OWNER, event.id, {
          action: "replan",
          version: event.version,
        }),
      );
      expect(next).toMatchObject({
        status: "PLANNING",
        version: event.version + 1,
        planningGeneration: event.planningGeneration + 1,
      });
      expect(await services().eventRecords.userRegistration(tableId, GUEST)).toMatchObject({
        status: "CANCELLED",
        version: registrations.find((row) => row.userId === GUEST)!.version + 1,
      });
      for (const table of [queueId, pendingId])
        expect(await services().eventRecords.userRegistration(table, GUEST)).toMatchObject({
          status: "CANCELLED",
          version: guestRow.version + 1,
        });
      expect((await services().eventRecords.table(queueId))?.demonstratorUserId).toBeUndefined();
      expect((await services().eventRecords.userRegistration(pendingId, OTHER))?.status).toBe(
        "ACCEPTED",
      );
      expect((await services().eventRecords.userRegistration(tableId, OWNER))?.status).toBe(
        "ACCEPTED",
      );
      expect((await services().eventRecords.table(tableId))?.confirmed).toEqual(before.confirmed);
      expect(next.agreement?.agreed).toBe(false);
      await expect(services().plannedEventService.detail(GUEST, event.id)).rejects.toMatchObject({
        code: "GROUP_BANNED",
      });
      await transaction((s) => s.unifiedGroupService.revoke(OWNER, group.id, GUEST));
      expect((await services().eventRecords.userRegistration(tableId, GUEST))?.status).toBe(
        "CANCELLED",
      );
      expect(await services().eventRecords.personalTables(GUEST, { limit: 20 })).toEqual([]);
    },
  );

  it("preserves frozen public participation through bans and termination without reviving membership", async () => {
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
    await transaction((s) =>
      s.unifiedGroupService.ban(OWNER, group.id, { userId: GUEST, until: null }),
    );
    expect(await db.collection(COLLECTIONS.GROUP_BANS).countDocuments()).toBe(1);
    expect((await services().groupRecords.membership(group.id, GUEST))?.status).toBe("LEFT");
    expect(await services().plannedEventService.detail(GUEST, event.id)).toMatchObject({
      personalAccessOnly: true,
      readOnly: true,
      groupId: null,
    });
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
    const terminatedRegistrations = await services().eventRecords.allRegistrations(event.id);
    const until = "2030-06-02T13:00:00Z";
    await transaction((s) => s.unifiedGroupService.ban(OWNER, group.id, { userId: GUEST, until }));
    expect((await services().groupRecords.membership(group.id, GUEST))?.status).toBe("LEFT");
    await expect(
      services().unifiedGroupService.members(GUEST, group.id, "accepted", { limit: 20 }),
    ).rejects.toMatchObject({ code: "GROUP_NOT_FOUND" });
    expect(await services().eventRecords.table(tableId)).toEqual(terminated);
    expect(await services().plannedEventService.detail(GUEST, event.id)).toMatchObject({
      personalAccessOnly: true,
      readOnly: true,
      groupId: null,
    });
    vi.setSystemTime(new Date(until));
    expect((await services().groupRecords.membership(group.id, GUEST))?.status).toBe("LEFT");
    expect(await services().eventRecords.allRegistrations(event.id)).toEqual(
      terminatedRegistrations,
    );
    expect(await services().eventRecords.table(tableId)).toEqual(terminated);
    expect(await services().plannedEventService.detail(GUEST, event.id)).toMatchObject({
      role: "participant",
      readOnly: true,
      personalAccessOnly: true,
      canRegister: false,
      canVote: false,
      canEdit: false,
      canInvite: false,
      canConfirm: false,
      canReplan: false,
      canFinalize: false,
    });
    await expect(
      transaction((s) => s.plannedEventService.register(GUEST, event.id, tableId)),
    ).rejects.toMatchObject({ code: "GROUP_MEMBER_REQUIRED" });
    expect(
      (
        await services().plannedEventService.tableDetail(GUEST, event.id, tableId)
      ).resultProfiles?.every((profile) => profile.email === null),
    ).toBe(true);
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
