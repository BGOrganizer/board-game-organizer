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
    name: "Public event activity",
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
  expect(first.items[0]).toMatchObject({ kind: "event_join", context: "Public event activity" });
  expect(first.items.slice(1).every((row) => row.kind === "friendship")).toBe(true);
  expect(first.nextCursor).not.toBeNull();
  const second = await profiles.feed(viewer, subject, {
    limit: 10,
    cursor: first.nextCursor ?? undefined,
  });
  expect(second.items).toHaveLength(2);
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
      (row) => row.groupId !== groupId,
    ),
  ).toBe(true);
  await db
    .collection(C.GROUP_MEMBERSHIPS)
    .updateOne({ groupId, userId: viewer }, { $set: { status: "LEFT" } });
  expect(
    (await profiles.feed(viewer, subject, { limit: 5 })).items.every(
      (row) => row.groupId !== groupId,
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
it("source-pages the current network since its live edge, deduplicates friendship/initial joins and excludes private activities even for members/owners", async () => {
  const publicId = randomUUID(),
    privateId = randomUUID(),
    eventId = randomUUID(),
    tableId = randomUUID(),
    activities = new ProfileActivitiesRepository(db),
    profiles = new ProfileService(db);
  await db.collection(C.GROUPS).insertMany([
    {
      id: publicId,
      type: "PUBLIC",
      adminUserId: subject,
      approved: { name: "Public network" },
      version: 1,
      createdAt: at,
      updatedAt: at,
    },
    {
      id: privateId,
      type: "PRIVATE",
      adminUserId: subject,
      approved: { name: "NEVER PRIVATE" },
      version: 1,
      createdAt: at,
      updatedAt: at,
    },
  ]);
  await db.collection(C.FOLLOWS).insertMany([
    { fromUserId: viewer, toUserId: subject, createdAt: new Date(at) },
    { fromUserId: "third", toUserId: viewer, createdAt: new Date(at) },
  ]);
  await db.collection(C.FRIEND_REQUESTS).insertMany(
    [
      [viewer, "other"],
      ["other", viewer],
    ].map(([fromUserId, toUserId]) => ({
      fromUserId,
      toUserId,
      status: "accepted",
      createdAt: new Date(at),
      updatedAt: new Date(at),
      respondedAt: new Date(at),
    })),
  );
  for (const [i, who] of Array.from({ length: 12 }, (_, i) => [i, subject] as const))
    await activities.record({
      userId: who,
      kind: "group_join",
      groupId: publicId,
      source: `public:${i}`,
      occurredAt: new Date(Date.parse(at) + i * 1000).toISOString(),
    });
  await activities.record({
    userId: subject,
    kind: "group_join",
    groupId: publicId,
    source: "before-follow",
    occurredAt: "2030-06-03T11:59:59.999Z",
  });
  await activities.record({
    userId: "third",
    kind: "group_join",
    groupId: publicId,
    source: "incoming-only",
    occurredAt: at,
  });
  const friendship = `friendship:${randomUUID()}`;
  for (const [userId, otherUserId] of [
    [subject, "other"],
    ["other", subject],
  ])
    await activities.record({
      userId,
      otherUserId,
      source: friendship,
      kind: "friendship",
      occurredAt: "2030-06-03T12:00:20.000Z",
    });
  await db.collection(C.EVENTS).insertOne({
    id: eventId,
    groupId: publicId,
    adminUserId: subject,
    status: "PLANNING",
    name: "Public linked Event",
  });
  await db
    .collection(C.EVENT_TABLES)
    .insertOne({ id: tableId, eventId, name: "Public linked Table", order: 0 });
  for (const kind of ["event_join", "table_join"] as const)
    await activities.record({
      userId: subject,
      source: `${kind}:initial`,
      kind,
      eventId,
      ...(kind === "table_join" ? { tableId } : {}),
      occurredAt: "2030-06-03T12:00:30.000Z",
    });
  for (let i = 0; i < 60; i++)
    await activities.record({
      userId: subject,
      kind: "group_join",
      groupId: privateId,
      source: `secret:${i}`,
      occurredAt: "2030-06-03T12:01:00.000Z",
    });
  await db.collection(C.GROUP_MEMBERSHIPS).insertOne({
    id: randomUUID(),
    groupId: privateId,
    userId: viewer,
    status: "ACCEPTED",
    kind: "INVITATION",
    version: 1,
    createdAt: at,
    updatedAt: at,
  });
  const all = [];
  let cursor: string | undefined;
  do {
    const page = await profiles.networkFeed(viewer, { network: "all", limit: 10, cursor });
    expect(page.items.length).toBeLessThanOrEqual(10);
    all.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  expect(all).toHaveLength(14);
  expect(new Set(all.map((i) => i.id)).size).toBe(14);
  expect(all.filter((i) => i.kind === "friendship")).toHaveLength(1);
  expect(all.filter((i) => i.kind === "event_join")).toHaveLength(0);
  expect(all[0]).toMatchObject({
    kind: "table_join",
    eventContext: "Public linked Event",
    context: "Public linked Table",
  });
  expect(
    all.every(
      (i) =>
        i.author.id !== "third" &&
        i.groupId !== privateId &&
        Date.parse(i.occurredAt) >= Date.parse(at),
    ),
  ).toBe(true);
  const filtered = await profiles.networkFeed(viewer, {
    network: "all",
    kind: "group_join",
    limit: 10,
  });
  expect(filtered.items).toHaveLength(10);
  expect(filtered.items.every((row) => row.kind === "group_join" && row.groupId === publicId)).toBe(
    true,
  );
  expect(filtered.nextCursor).not.toBeNull();
  const tail = await profiles.networkFeed(viewer, {
    network: "all",
    kind: "group_join",
    limit: 10,
    cursor: filtered.nextCursor ?? undefined,
  });
  expect(tail.items).toHaveLength(2);
  expect(tail.nextCursor).toBeNull();
  expect(new Set([...filtered.items, ...tail.items].map((row) => row.id)).size).toBe(12);
  expect(
    (await profiles.networkFeed(viewer, { network: "all", kind: "friendship", limit: 10 })).items,
  ).toHaveLength(1);
  expect(
    (await profiles.networkFeed(viewer, { network: "all", kind: "event_join", limit: 10 })).items,
  ).toHaveLength(0);
  expect(JSON.stringify(all)).not.toContain("NEVER PRIVATE");
  expect(JSON.stringify(all)).not.toContain("@private.test");
  expect(
    (await profiles.networkFeed(viewer, { network: "friends", limit: 10 })).items.map(
      (i) => i.author.id,
    ),
  ).toEqual(["other"]);
  expect(
    (await profiles.networkFeed(viewer, { network: "following", limit: 10 })).items.every(
      (i) => i.author.id === subject,
    ),
  ).toBe(true);
  expect(
    (await profiles.feed(subject, subject, { kind: "group_join", limit: 10 })).items.every(
      (i) => i.groupId !== privateId,
    ),
  ).toBe(true);
  await db
    .collection(C.EVENT_TABLES)
    .updateOne({ id: tableId }, { $set: { removedAt: "2030-06-03T12:02:00.000Z" } });
  expect(
    (await profiles.networkFeed(viewer, { network: "following", limit: 10 })).items[0],
  ).toMatchObject({ kind: "event_join", context: "Public linked Event" });
  expect(
    (await profiles.networkFeed(viewer, { network: "all", kind: "event_join", limit: 10 })).items,
  ).toHaveLength(1);
  await db
    .collection(C.FOLLOWS)
    .updateOne(
      { fromUserId: viewer, toUserId: subject },
      { $set: { createdAt: new Date("2030-06-04T00:00:00.000Z") } },
    );
  expect((await profiles.networkFeed(viewer, { network: "following", limit: 10 })).items).toEqual(
    [],
  );
  await db.collection(C.FRIEND_REQUESTS).deleteOne({ fromUserId: "other", toUserId: viewer });
  expect((await profiles.networkFeed(viewer, { network: "all", limit: 10 })).items).toEqual([]);
});
