import { randomUUID } from "node:crypto";
import type { EventRecord } from "@board-game-organizer/schemas";
import { type Db, MongoClient } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { RelationshipRepository } from "../../src/app/lib/contacts/relationship.repository";
import { COLLECTIONS as C } from "../../src/app/lib/db";
import { EventRecordsRepository } from "../../src/app/lib/events/event-records.repository";
import { migrate } from "../../src/app/lib/migrate";
import { ProfileRepository } from "../../src/app/lib/profile/profile.repository";
import { ProfileService } from "../../src/app/lib/profile/profile.service";
import { ProfileActivitiesRepository } from "../../src/app/lib/profile/profile-activities.repository";

let container: StartedTestContainer,
  client: MongoClient,
  db: Db,
  number = 0;
const at = "2030-06-03T12:00:00.000Z",
  subject = "subject",
  viewer = "viewer";
beforeAll(async () => {
  container = await new GenericContainer("mongo:7")
    .withCommand(["--replSet", "rs0", "--bind_ip_all"])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .start();
  const uri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?directConnection=true`,
    bootstrap = new MongoClient(uri);
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
beforeEach(async () => {
  db = client.db(`integration-profile-${number++}`);
  await migrate(db);
  await db.collection(C.USERS).insertMany(
    [subject, viewer, "other", "third"].map((clerkId) => ({
      clerkId,
      name: clerkId,
      username: clerkId,
      email: `${clerkId}@private.test`,
      preferredLanguage: "en",
    })),
  );
});
it("counts canonical rated/unrated physical results, excluding ND, insufficient finishers, removed/unconfirmed resources and off-roster rows", async () => {
  const eventId = randomUUID(),
    planningId = randomUUID();
  await db.collection(C.EVENTS).insertMany([
    { id: eventId, status: "TERMINATED" },
    { id: planningId, status: "PLANNING" },
  ]);
  const entries = (score: string | null, other: string | null = "2") => [
    { userId: subject, score, rank: score === null ? null : score === "2" ? 1 : 2 },
    { userId: "other", score: other, rank: other === null ? null : 1 },
  ];
  const row = (values = {}) => ({
    id: randomUUID(),
    eventId,
    rankingEnabled: true,
    confirmed: { gameId: 7, playerIds: [subject, "other", "third"] },
    results: { entries: entries("2") },
    ...values,
  });
  await db
    .collection(C.EVENT_TABLES)
    .insertMany([
      row(),
      row({ rankingEnabled: false, results: { entries: entries("-0.25") } }),
      row({ results: { entries: [...entries(null), { userId: "third", score: "2", rank: 1 }] } }),
      row({ results: { entries: entries("2", null) } }),
      row({ results: { entries: entries(null, null) } }),
      row({ confirmed: { gameId: 7, playerIds: ["other", "third"] } }),
      row({ removedAt: at }),
      row({ confirmed: undefined }),
      row({ confirmed: { gameId: 7 } }),
      row({ confirmed: { gameId: 7, playerIds: subject } }),
      row({ results: undefined }),
      row({ results: { entries: null } }),
      row({ results: { entries: { userId: subject, score: "2", rank: 1 } } }),
      row({ eventId: planningId }),
    ]);
  const repo = new ProfileRepository(db);
  expect(await repo.player(subject)).toEqual({ gamesPlayed: 2, gamesWon: 1, winRate: 50 });
  expect(await repo.player(subject, 7)).toEqual({ gamesPlayed: 2, gamesWon: 1, winRate: 50 });
  expect(await repo.player(subject, 8)).toEqual({ gamesPlayed: 0, gamesWon: 0, winRate: null });
  expect((await new ProfileService(db).profile(viewer, subject)).player).toEqual({
    gamesPlayed: 2,
    gamesWon: 1,
    winRate: 50,
  });
});
it("filters current private/Event parent access before a visible page, denies either block direction and returns no hidden-source cursors", async () => {
  const groupId = randomUUID(),
    publicId = randomUUID(),
    eventId = randomUUID(),
    activities = new ProfileActivitiesRepository(db),
    profiles = new ProfileService(db);
  await db.collection(C.GROUPS).insertMany([
    {
      id: groupId,
      type: "PRIVATE",
      adminUserId: subject,
      approved: { name: "Private source" },
      createdAt: at,
      updatedAt: at,
      version: 1,
    },
    {
      id: publicId,
      type: "PUBLIC",
      adminUserId: subject,
      approved: { name: "Public source" },
      createdAt: at,
      updatedAt: at,
      version: 1,
    },
  ]);
  await db.collection(C.EVENTS).insertOne({
    id: eventId,
    groupId: publicId,
    adminUserId: subject,
    status: "PLANNING",
    name: "Not discoverable from a public Group",
  });
  for (let i = 0; i < 60; i++)
    await activities.record({
      source: `private:${i}`,
      userId: subject,
      kind: "group_join",
      groupId,
      occurredAt: new Date(Date.parse(at) - i * 1000).toISOString(),
    });
  await activities.record({
    source: "public-event",
    userId: subject,
    kind: "event_join",
    eventId,
    occurredAt: at,
  });
  for (let i = 0; i < 11; i++)
    await activities.record({
      source: `visible:${i}`,
      userId: subject,
      kind: "friendship",
      otherUserId: "other",
      occurredAt: new Date(Date.parse(at) - (100 + i) * 1000).toISOString(),
    });
  const first = await profiles.feed(viewer, subject, { limit: 10 });
  expect(first.items).toHaveLength(10);
  expect(first.items.every((row) => row.kind === "friendship")).toBe(true);
  expect(first.nextCursor).not.toBeNull();
  const second = await profiles.feed(viewer, subject, {
    limit: 10,
    cursor: first.nextCursor ?? undefined,
  });
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(JSON.stringify(first)).not.toContain("Private source");
  await db.collection(C.GROUP_MEMBERSHIPS).insertOne({
    id: randomUUID(),
    groupId,
    userId: viewer,
    status: "ACCEPTED",
    kind: "INVITATION",
    version: 1,
    createdAt: at,
    updatedAt: at,
  });
  expect(
    (await profiles.feed(viewer, subject, { limit: 5 })).items.every(
      (row) => row.context === "Private source" && row.groupId === groupId,
    ),
  ).toBe(true);
  await db
    .collection(C.GROUP_MEMBERSHIPS)
    .updateOne({ groupId, userId: viewer }, { $set: { status: "LEFT" } });
  expect(
    (await profiles.feed(viewer, subject, { limit: 5 })).items.every(
      (row) => row.kind === "friendship",
    ),
  ).toBe(true);
  const relationships = new RelationshipRepository(db);
  for (const [from, to] of [
    [subject, viewer],
    [viewer, subject],
  ]) {
    await relationships.block(from, to);
    await expect(profiles.profile(viewer, subject)).rejects.toMatchObject({ status: 404 });
    await expect(profiles.feed(viewer, subject, { limit: 5 })).rejects.toMatchObject({
      status: 404,
    });
    await relationships.unblock(from, to);
  }
});
it("deduplicates actual social receipts and rolls source/activity writes back in the same transaction", async () => {
  const repo = new RelationshipRepository(db);
  await repo.follow(viewer, subject);
  await repo.follow(viewer, subject);
  await repo.becomeFriends(viewer, subject);
  await repo.becomeFriends(viewer, subject);
  expect(await db.collection(C.PROFILE_ACTIVITIES).countDocuments({ kind: "follower" })).toBe(2);
  expect(await db.collection(C.PROFILE_ACTIVITIES).countDocuments({ kind: "friendship" })).toBe(2);
  expect(await new ProfileRepository(db).social(viewer)).toEqual({
    friends: 1,
    followers: 1,
    following: 1,
  });
  const session = client.startSession();
  try {
    await expect(
      session.withTransaction(async () => {
        await new RelationshipRepository(db, session).follow(viewer, "third");
        throw new Error("abort owned fixture");
      }),
    ).rejects.toThrow("abort owned fixture");
  } finally {
    await session.endSession();
  }
  expect(
    await db.collection(C.FOLLOWS).countDocuments({ fromUserId: viewer, toUserId: "third" }),
  ).toBe(0);
  expect(await db.collection(C.PROFILE_ACTIVITIES).countDocuments({ userId: "third" })).toBe(0);
});
it("does not miss a milestone when independent unrated Events finalize concurrently", async () => {
  const oldId = randomUUID(),
    nextIds = [randomUUID(), randomUUID()];
  await db
    .collection(C.EVENTS)
    .insertMany([
      { id: oldId, status: "TERMINATED" },
      ...nextIds.map((id) => ({ id, status: "CONFIRMED" })),
    ]);
  const physical = (eventId: string) => ({
    id: randomUUID(),
    eventId,
    order: 0,
    rankingEnabled: false,
    confirmed: { playerIds: [subject, "other"], gameId: 7, startsAt: at },
    results: {
      finalizedAt: at,
      entries: [
        { userId: subject, score: "1", rank: 1 },
        { userId: "other", score: "0", rank: 2 },
      ],
    },
  });
  const current = nextIds.map(physical);
  await db
    .collection(C.EVENT_TABLES)
    .insertMany([
      ...Array.from({ length: 8 }, (_, order) => ({ ...physical(oldId), order })),
      ...current,
    ]);
  // Deliberately independent sessions: never parallel operations on one MongoDB session.
  await Promise.all(
    nextIds.map(async (id) => {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await new EventRecordsRepository(db, session).save({
            id,
            groupId: null,
            status: "TERMINATED",
            updatedAt: at,
          } as EventRecord);
        });
      } finally {
        await session.endSession();
      }
    }),
  );
  expect((await new ProfileRepository(db).player(subject)).gamesWon).toBe(10);
  const milestones = await db
    .collection(C.PROFILE_ACTIVITIES)
    .find({ userId: subject, kind: "milestone" })
    .toArray();
  expect(milestones).toHaveLength(1);
  expect(milestones[0].milestone).toBe(10);
  expect(current.map((table) => table.id)).toContain(milestones[0].tableId);
});
it("orders GLOBAL history by authoritative gamesPlayed, not clock or GROUP duplicates, exposing ordinal points only", async () => {
  const before = { mu: 25, sigma: 25 / 3, gamesPlayed: 0 },
    first = { mu: 30, sigma: 8, gamesPlayed: 1 },
    after = { mu: 31, sigma: 7, gamesPlayed: 2 },
    base = {
      userId: subject,
      gameId: 7,
      scope: "GLOBAL",
      groupId: null,
      algorithm: "openskill-v1",
      rank: 1,
      didNotFinish: false,
      eventId: randomUUID(),
    };
  await db.collection(C.BOARD_GAMES).insertOne({
    id: 7,
    name: "[Chess]",
    image: "https://example.test/game.png",
    isExpansion: false,
  });
  await db.collection(C.RATING_EVENTS).insertMany([
    {
      ...base,
      tableId: randomUUID(),
      before,
      after: first,
      finalizedAt: "2030-06-04T12:00:00.000Z",
    },
    { ...base, tableId: randomUUID(), before: first, after, finalizedAt: at },
    {
      ...base,
      scope: "GROUP",
      groupId: randomUUID(),
      tableId: randomUUID(),
      before,
      after: { ...after, mu: 999 },
      finalizedAt: at,
    },
  ]);
  await db
    .collection(C.PLAYER_RATINGS)
    .insertOne({ userId: subject, gameId: 7, scope: "GLOBAL", groupId: null, ...after });
  const repo = new ProfileRepository(db),
    history = await repo.history(subject, 7);
  expect(history.rating).toBe(510);
  expect(history.delta).toBe(4);
  expect(history.points.map((point) => [point.ordinal, point.rating])).toEqual([
    [1, 506],
    [2, 510],
  ]);
  expect(
    history.points.every((point) => Object.keys(point).sort().join() === "delta,ordinal,rating"),
  ).toBe(true);
  expect((await repo.games(subject, 0, "[")).items.map((game) => game.id)).toEqual([7]);
  expect((await repo.games(subject, 0, ".*")).items).toEqual([]);
  await db.collection(C.RATING_EVENTS).deleteMany({ userId: subject });
  expect((await repo.games(subject, 0, "[")).items.map((game) => game.id)).toEqual([7]);
  expect(await repo.history(subject, 7)).toMatchObject({ rating: 510, delta: null, points: [] });
});
