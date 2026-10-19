import { randomUUID } from "node:crypto";
import type { CreatePlannedEventInput } from "@board-game-organizer/schemas";
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
    await transaction((s) =>
      s.plannedEventService.registrationAction(OTHER, waiting.id, {
        action: "accept",
        version: waiting.version,
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
    const request = await transaction((s) => s.unifiedGroupService.request(GUEST, group.id));
    await transaction((s) =>
      s.unifiedGroupService.membershipAction(OWNER, group.id, GUEST, {
        action: "approve",
        version: request.version,
      }),
    );
    const input = {
      ...plannedInput(group.id),
      endsAt: "2030-06-03T23:00:00Z",
      bookingClosesAt: "2030-06-02T12:00:00Z",
    };
    const event = await transaction((s) => s.plannedEventService.create(OWNER, input));
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
