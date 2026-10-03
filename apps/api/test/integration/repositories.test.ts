import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, MongoClient, type ObjectId } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { importDirectCsv } from "../../scripts/import-boardgames-direct";
import { gameDetails, searchGames } from "../../src/app/lib/bgg";
import { BggAccountRepository } from "../../src/app/lib/bgg-account.repository";
import { parseBggCollection } from "../../src/app/lib/bgg-collection";
import { BoardGamesRepository } from "../../src/app/lib/boardGames.repository";
import { COLLECTIONS } from "../../src/app/lib/db";
import { GroupService } from "../../src/app/lib/group.service";
import { GroupLeaderboardRepository } from "../../src/app/lib/group-leaderboard.repository";
import { GroupsRepository } from "../../src/app/lib/groups.repository";
import { type MatchError, MatchService } from "../../src/app/lib/match.service";
import { MatchInvitationsRepository } from "../../src/app/lib/match-invitations.repository";
import { MatchesRepository } from "../../src/app/lib/matches.repository";
import { migrate } from "../../src/app/lib/migrate";
import { NotificationsRepository } from "../../src/app/lib/notifications.repository";
import { PushSubscriptionsRepository } from "../../src/app/lib/push-subscriptions.repository";
import { RatingsRepository } from "../../src/app/lib/ratings.repository";
import { RelationshipRepository } from "../../src/app/lib/relationship.repository";
import { RelationshipService } from "../../src/app/lib/relationship.service";
import { UsersRepository } from "../../src/app/lib/users.repository";

const ACTOR = "user_actor";
const TARGET = "user_target";
const THIRD = "user_third";
const FOURTH = "user_fourth";

let container: StartedTestContainer;
let client: MongoClient;
let db: Db;
let relationships: RelationshipRepository;
let users: UsersRepository;
let databaseNumber = 0;

async function transact(work: (repository: RelationshipRepository) => Promise<void>) {
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await work(new RelationshipRepository(db, session));
    });
  } finally {
    await session.endSession();
  }
}

async function seedUser(
  repository: UsersRepository,
  id: string,
  email: string,
  mobileNumber?: string,
) {
  await repository.upsertFromClerk({
    id,
    email,
    name: id,
    mobileNumber,
    preferredLanguage: "en",
  });
}

beforeAll(async () => {
  container = await new GenericContainer("mongo:7")
    .withCommand(["mongod", "--replSet", "rs0", "--bind_ip_all"])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .start();

  const directUri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?directConnection=true`;
  const bootstrap = new MongoClient(directUri);
  await bootstrap.connect();
  await bootstrap.db("admin").command({
    replSetInitiate: {
      _id: "rs0",
      members: [{ _id: 0, host: "localhost:27017" }],
    },
  });
  await bootstrap.close();

  client = new MongoClient(`${directUri}&replicaSet=rs0`);
  await client.connect();
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await client.db("admin").command({ hello: 1 });
    if (status.isWritablePrimary) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("MongoDB replica set did not elect a primary");
}, 240_000);

afterAll(async () => {
  await client?.close();
  await container?.stop();
});

beforeEach(async () => {
  db = client.db(`integration-repositories-${databaseNumber++}`);
  await migrate(db);
  users = new UsersRepository(db);
  relationships = new RelationshipRepository(db);
  await seedUser(users, ACTOR, "actor@example.com", "+39 333 123 4567");
  await seedUser(users, TARGET, "target@example.com");
  await seedUser(users, THIRD, "third@example.com");
});

describe("API repositories on a MongoDB replica set", () => {
  it("persists and retrieves users through UsersRepository", async () => {
    expect(await relationships.userExists(ACTOR)).toBe(true);
    await expect(users.findById(ACTOR)).resolves.toMatchObject({
      clerkId: ACTOR,
      email: "actor@example.com",
      mobileNumber: "+39 333 123 4567",
      mobileNumberNormalized: "393331234567",
    });
    await expect(users.findByEmail("target@example.com")).resolves.toMatchObject({
      clerkId: TARGET,
    });

    await seedUser(users, ACTOR, "actor-updated@example.com");
    await expect(users.findById(ACTOR)).resolves.toMatchObject({
      email: "actor-updated@example.com",
      mobileNumber: "+39 333 123 4567",
      mobileNumberNormalized: "393331234567",
    });

    await users.deleteByClerkId(ACTOR);
    expect(await relationships.userExists(ACTOR)).toBe(false);
  });

  it("persists idempotent follow and unfollow operations", async () => {
    await relationships.follow(ACTOR, TARGET);
    await relationships.follow(ACTOR, TARGET);

    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.listFollowing(ACTOR, [TARGET])).resolves.toEqual([]);
    await expect(relationships.listFollowers(TARGET)).resolves.toEqual([
      expect.objectContaining({ fromUserId: ACTOR, toUserId: TARGET }),
    ]);
    await expect(relationships.listFollowers(TARGET, [ACTOR])).resolves.toEqual([]);

    await relationships.unfollow(ACTOR, TARGET);
    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
  });

  it("persists friend-request and friendship lifecycle", async () => {
    await relationships.setFriendRequest(ACTOR, TARGET, "pending");
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toMatchObject({
      status: "pending",
    });
    await expect(relationships.listOutgoingFriendRequests(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.listIncomingFriendRequests(TARGET)).resolves.toHaveLength(1);
    await expect(relationships.listOutgoingFriendRequests(ACTOR, [TARGET])).resolves.toEqual([]);
    await expect(relationships.listIncomingFriendRequests(TARGET, [ACTOR])).resolves.toEqual([]);

    await relationships.setFriendRequest(ACTOR, TARGET, "rejected");
    await expect(relationships.listOutgoingFriendRequests(ACTOR)).resolves.toEqual([]);
    await relationships.setFriendRequest(ACTOR, TARGET, "pending");
    const wrongStatus = await relationships.deleteFriendRequest(ACTOR, TARGET, "accepted");
    expect(wrongStatus.deletedCount).toBe(0);
    await relationships.deleteFriendRequest(ACTOR, TARGET, "pending");
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toBeNull();

    await relationships.becomeFriends(ACTOR, TARGET);
    expect(await relationships.isFriend(ACTOR, TARGET)).toBe(true);
    await expect(relationships.listFriends(ACTOR)).resolves.toEqual([
      { fromUserId: ACTOR, toUserId: TARGET, status: "accepted" },
    ]);
    await expect(relationships.listFriends(TARGET)).resolves.toEqual([
      { fromUserId: TARGET, toUserId: ACTOR, status: "accepted" },
    ]);
    await expect(relationships.listFriends(ACTOR, [TARGET])).resolves.toEqual([]);
    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.listFollowing(TARGET)).resolves.toHaveLength(1);

    await transact((repository) => new RelationshipService(repository).unfriend(ACTOR, TARGET));
    expect(await relationships.isFriend(ACTOR, TARGET)).toBe(false);
    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
    await expect(relationships.listFollowing(TARGET)).resolves.toHaveLength(1);
  });

  it("persists block lifecycle and resolves either direction", async () => {
    await relationships.block(ACTOR, TARGET);
    await relationships.block(ACTOR, TARGET);

    await expect(relationships.findBlock(ACTOR, TARGET)).resolves.not.toBeNull();
    expect(await relationships.isBlocked(ACTOR, TARGET)).toBe(true);
    expect(await relationships.isBlocked(TARGET, ACTOR)).toBe(true);
    await expect(relationships.getBlockedUserIds(ACTOR)).resolves.toEqual([TARGET]);
    await expect(relationships.getBlockedUserIds(TARGET)).resolves.toEqual([ACTOR]);
    await expect(relationships.listBlocked(ACTOR)).resolves.toEqual([
      expect.objectContaining({ fromUserId: ACTOR, toUserId: TARGET }),
    ]);

    await relationships.unblock(ACTOR, TARGET);
    expect(await relationships.isBlocked(ACTOR, TARGET)).toBe(false);
    await expect(relationships.listBlocked(ACTOR)).resolves.toEqual([]);
  });

  it("clears friend requests in both directions", async () => {
    await relationships.setFriendRequest(ACTOR, TARGET, "pending");
    await relationships.setFriendRequest(TARGET, ACTOR, "rejected");
    await relationships.clearFriendRequests(ACTOR, TARGET);
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toBeNull();
    await expect(relationships.findFriendRequest(TARGET, ACTOR)).resolves.toBeNull();
  });

  it("deletes only social edges involving the removed user", async () => {
    await relationships.follow(ACTOR, TARGET);
    await relationships.follow(TARGET, THIRD);
    await relationships.setFriendRequest(TARGET, ACTOR, "pending");
    await relationships.setFriendRequest(TARGET, THIRD, "pending");
    await relationships.block(ACTOR, THIRD);
    await relationships.block(TARGET, THIRD);

    await relationships.deleteAllForUser(ACTOR);

    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
    await expect(relationships.listFollowing(TARGET)).resolves.toEqual([
      expect.objectContaining({ fromUserId: TARGET, toUserId: THIRD }),
    ]);
    await expect(relationships.findFriendRequest(TARGET, ACTOR)).resolves.toBeNull();
    await expect(relationships.findFriendRequest(TARGET, THIRD)).resolves.not.toBeNull();
    await expect(relationships.listBlocked(ACTOR)).resolves.toEqual([]);
    await expect(relationships.listBlocked(TARGET)).resolves.toHaveLength(1);
  });

  it("commits repository operations sharing one transaction session", async () => {
    await transact(async (repository) => {
      await repository.follow(ACTOR, TARGET);
      await repository.setFriendRequest(ACTOR, TARGET, "pending");
      await repository.block(ACTOR, THIRD);
    });

    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.not.toBeNull();
    await expect(relationships.findBlock(ACTOR, THIRD)).resolves.not.toBeNull();
  });

  it("rolls back every repository write when a transaction fails", async () => {
    await expect(
      transact(async (repository) => {
        await repository.follow(ACTOR, TARGET);
        await repository.setFriendRequest(ACTOR, TARGET, "pending");
        await repository.block(ACTOR, THIRD);
        throw new Error("forced failure");
      }),
    ).rejects.toThrow("forced failure");

    await expect(relationships.listFollowing(ACTOR)).resolves.toEqual([]);
    await expect(relationships.findFriendRequest(ACTOR, TARGET)).resolves.toBeNull();
    await expect(relationships.findBlock(ACTOR, THIRD)).resolves.toBeNull();
  });

  it("keeps concurrent upserts unique through repository methods", async () => {
    await Promise.all([relationships.follow(ACTOR, TARGET), relationships.follow(ACTOR, TARGET)]);
    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);

    await Promise.all([
      relationships.setFriendRequest(ACTOR, TARGET, "pending"),
      relationships.setFriendRequest(ACTOR, TARGET, "pending"),
    ]);
    await expect(relationships.listOutgoingFriendRequests(ACTOR)).resolves.toHaveLength(1);
  });
});

async function withMatchTransaction<T>(
  work: (repositories: {
    service: MatchService;
    matches: MatchesRepository;
    invitations: MatchInvitationsRepository;
    groups: GroupService;
  }) => Promise<T>,
  notify = false,
): Promise<T> {
  const session = client.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const matches = new MatchesRepository(db, session);
      const invitations = new MatchInvitationsRepository(db, session);
      const groups = new GroupService(
        new GroupsRepository(db, session),
        new UsersRepository(db, session),
        new RelationshipRepository(db, session),
        notify ? new NotificationsRepository(db, session) : undefined,
      );
      return work({
        groups,
        matches,
        invitations,
        service: new MatchService(
          matches,
          invitations,
          new UsersRepository(db, session),
          new RelationshipRepository(db, session),
          new BoardGamesRepository(db, session),
          notify ? new NotificationsRepository(db, session) : undefined,
          groups,
          new RatingsRepository(db, session),
        ),
      });
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

async function seedMatchDependencies() {
  await relationships.becomeFriends(ACTOR, TARGET);
  await new BoardGamesRepository(db).bulkUpsert([
    { id: 342942, name: "Ark Nova", yearPublished: 2021, isExpansion: false },
  ]);
}

const matchInput = {
  name: "Friday games",
  dates: ["2026-10-01T20:00:00.000Z"],
  locations: [
    {
      id: "8b1f8d7e-b32b-4c56-b0de-190748935516",
      name: "Game cafe",
      address: "123 Main St",
      longitude: 12.5,
      latitude: 41.9,
    },
  ],
  minPlayers: 2,
  maxPlayers: 3,
  invitedUserIds: [] as string[],
  gameIds: [342942],
};

describe("direct Preview catalog import on MongoDB replica set", () => {
  it("upserts the complete CSV, preserves older games and images, and safely repeats", async () => {
    const directory = mkdtempSync(join(tmpdir(), "bgo-direct-import-"));
    const csvPath = join(directory, "ranks.csv");
    const header =
      "id,name,yearpublished,rank,bayesaverage,average,usersrated,is_expansion,abstracts_rank,cgs_rank,childrensgames_rank,familygames_rank,partygames_rank,strategygames_rank,thematic_rank,wargames_rank";
    const row = (values: string[]) => [...values, ...Array(8).fill("")].join(",");
    writeFileSync(
      csvPath,
      [
        header,
        row(["13", "Catan", "1995", "627", "6.90146", "7.09", "144562", "0"]),
        row(["2", "Azul expansion", "2017", "0", "0", "7.5", "5", "1"]),
        "",
      ].join("\n"),
    );
    const host = `${container.getHost()}:${container.getMappedPort(27017)}`;
    const preview = client.db("board-game-organizer");
    const catalog = preview.collection(COLLECTIONS.BOARD_GAMES);
    try {
      await catalog.insertMany([
        {
          id: 13,
          name: "Old Catan",
          image: "https://cf.geekdo-images.com/catan/full.jpg",
          thumbnail: "legacy",
        },
        { id: 999, name: "Historical", thumbnail: "legacy" },
      ]);
      const env = {
        BGG_MONGODB_URI: `mongodb://${host}/?directConnection=true&replicaSet=rs0`,
        BGG_DATABASE_NAME: "board-game-organizer",
        BGG_CSV: csvPath,
      };
      await importDirectCsv(env);
      await importDirectCsv(env);
      expect(await catalog.countDocuments()).toBe(3);
      expect(await catalog.indexes()).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "id_1", unique: true })]),
      );
      expect(await catalog.findOne({ id: 13 })).toMatchObject({
        name: "Catan",
        bayesAverage: 6.90146,
        isExpansion: false,
        image: "https://cf.geekdo-images.com/catan/full.jpg",
      });
      expect(await catalog.findOne({ id: 2 })).toMatchObject({ isExpansion: true });
      expect(await catalog.findOne({ id: 999 })).toMatchObject({ name: "Historical" });
      expect(await catalog.countDocuments({ thumbnail: { $exists: true } })).toBe(0);
      expect(await searchGames(preview, "Catan")).toHaveLength(1);
      expect(await searchGames(preview, "Azul")).toEqual([]);
    } finally {
      await preview.dropDatabase();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("BGG account collection snapshots on MongoDB replica set", () => {
  it("publishes only complete snapshots, preserves old data on failure, and unlinks privately", async () => {
    const repository = new BggAccountRepository(db);
    const alice = { id: 41, username: "alice", avatarUrl: null };
    const first = await repository.stage(ACTOR, alice);
    const games = parseBggCollection(
      '<items><item objectid="987600" subtype="boardgame"><name>Rare Game</name><status own="0" wishlist="1"/></item></items>',
      ACTOR,
      first,
    );
    await repository.publish(ACTOR, first, alice, games);
    expect((await repository.get(ACTOR)).active?.username).toBe("alice");
    expect(await repository.games(ACTOR, first).toArray()).toHaveLength(1);
    expect(await new BoardGamesRepository(db).findExistingIds([987600])).toEqual([987600]);

    const bob = { id: 42, username: "bob", avatarUrl: null };
    const failed = await repository.stage(ACTOR, bob);
    await repository.failed(ACTOR, failed);
    expect((await repository.get(ACTOR)).active?.snapshot).toBe(first);
    expect((await repository.get(ACTOR)).pending).toBeNull();
    expect(await repository.games(ACTOR, failed).toArray()).toHaveLength(0);

    const empty = await repository.stage(ACTOR, bob);
    await repository.publish(ACTOR, empty, bob, []);
    expect((await repository.get(ACTOR)).active?.username).toBe("bob");
    expect(await repository.games(ACTOR, first).toArray()).toHaveLength(0);
    const session = client.startSession();
    try {
      await session.withTransaction(() => repository.unlink(ACTOR, session));
    } finally {
      await session.endSession();
    }
    expect((await repository.get(ACTOR)).active).toBeNull();
    expect(
      await db.collection(COLLECTIONS.BGG_COLLECTION_GAMES).countDocuments({ userId: ACTOR }),
    ).toBe(0);
    expect(await new BoardGamesRepository(db).findExistingIds([987600])).toEqual([987600]);
  });
});

describe("BGG covers on MongoDB replica set", () => {
  it("claims one global request for concurrent searches and persists the real thumbnail", async () => {
    vi.stubEnv("BGG_TOKEN", "test-token");
    const fetchMock = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<items><item id="1"><thumbnail>https://cf.geekdo-images.com/azul/thumb.jpg</thumbnail><image>https://cf.geekdo-images.com/azul/full.jpg</image></item></items>',
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await new BoardGamesRepository(db).bulkUpsert([
        {
          id: 1,
          name: "Azul",
          yearPublished: 2017,
          average: 7.81,
          rank: 83,
          isExpansion: false,
        },
        { id: 2, name: "Azul expansion", yearPublished: 2020, isExpansion: true },
      ]);
      await Promise.all([searchGames(db, "Azul"), searchGames(db, "Azul")]);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(await searchGames(db, "Azul")).toEqual([
        {
          id: 1,
          name: "Azul",
          year: 2017,
          bayesAverage: null,
          average: 7.81,
          rank: 83,
          imageUrl: "https://cf.geekdo-images.com/azul/full.jpg",
        },
      ]);
      expect(await gameDetails(db, 2)).toMatchObject({ id: 2, name: "Azul expansion" });
      await db
        .collection(COLLECTIONS.BOARD_GAMES)
        .updateOne({ id: 2 }, { $set: { thumbnail: "https://cf.geekdo-images.com/old.jpg" } });
      expect(await new BoardGamesRepository(db).removeLegacyThumbnails()).toBe(1);
      expect(await db.collection(COLLECTIONS.BOARD_GAMES).findOne({ id: 2 })).not.toHaveProperty(
        "thumbnail",
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("match repositories on MongoDB replica set", () => {
  it("registers exact results once and makes a terminated match immutable and visible to accepted players", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
        date: created.dates[0],
        gameId: created.gameIds[0],
      }),
    );
    const input = {
      lowerWins: true,
      entries: [
        { userId: ACTOR, score: "-2.5" },
        { userId: TARGET, score: null },
      ],
      tieBreaks: [],
    };
    expect(await new MatchesRepository(db).countPlayedByUser(ACTOR)).toBe(0);
    const registered = await withMatchTransaction(
      ({ service }) => service.registerResults(ACTOR, created.id, input),
      true,
    );
    expect((await new NotificationsRepository(db).list(TARGET, 10)).notifications).toEqual([
      expect.objectContaining({ kind: "match_terminated" }),
    ]);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .findOne({ recipientUserId: TARGET, kind: "match_terminated" }),
    ).toMatchObject({ recipientUserId: TARGET, actorUserId: ACTOR });
    expect((await new NotificationsRepository(db).list(ACTOR, 10)).notifications).toEqual([]);
    expect(registered).toMatchObject({
      status: "TERMINATED",
      results: {
        lowerWins: true,
        entries: [
          { userId: ACTOR, score: "-2.5", rank: 1 },
          { userId: TARGET, score: null, rank: null },
        ],
      },
    });
    expect(await new MatchesRepository(db).countPlayedByUser(ACTOR)).toBe(1);
    expect(await new MatchesRepository(db).countPlayedByUser(TARGET)).toBe(0);
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, created.id)),
    ).resolves.toMatchObject({
      match: { status: "TERMINATED", results: registered.results },
      gameRatings: [],
    });
    await expect(
      withMatchTransaction(({ service }) => service.registerResults(ACTOR, created.id, input)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      withMatchTransaction(({ service }) => service.setStatus(ACTOR, created.id, "PLANNING")),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      withMatchTransaction(({ service }) => service.deleteMatch(ACTOR, created.id)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      status: "TERMINATED",
    });
  });
  it("creates a zero-invite match, accepts, leaves, and allows re-invitation", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    expect(created).toMatchObject({ status: "PLANNING", invitations: [] });

    const matches = new MatchesRepository(db);
    const invitations = new MatchInvitationsRepository(db);
    await expect(matches.findById(created.id)).resolves.toMatchObject({
      id: created.id,
      status: "PLANNING",
    });
    await expect(invitations.listByMatch(created.id)).resolves.toEqual([]);

    const invited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    await expect(
      withMatchTransaction(({ service }) => service.respond(TARGET, invited.id, "accept")),
    ).resolves.toMatchObject({ status: "ACCEPTED" });
    await expect(withMatchTransaction(({ service }) => service.list(TARGET))).resolves.toEqual([
      expect.objectContaining({ id: created.id, status: "PLANNING" }),
    ]);

    await withMatchTransaction(({ service }) => service.leave(TARGET, invited.id));
    await expect(invitations.findById(invited.id)).resolves.toBeNull();
    const reinvited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    expect(reinvited).toMatchObject({ status: "PENDING", inviteeUserId: TARGET });
    expect(reinvited.id).not.toBe(invited.id);
  });

  it("persists participant choices without exposing other users and clears them on departure", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    const invited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    await expect(
      withMatchTransaction(({ service }) =>
        service.setChoice(TARGET, created.id, { kind: "games", itemId: 342942, choice: "YES" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await withMatchTransaction(({ service }) => service.respond(TARGET, invited.id, "accept"));
    await withMatchTransaction(({ service }) =>
      service.setChoice(TARGET, created.id, { kind: "games", itemId: 342942, choice: "YES" }),
    );
    await withMatchTransaction(({ service }) =>
      service.setChoice(ACTOR, created.id, {
        kind: "dates",
        itemId: matchInput.dates[0],
        choice: "IF_NEEDED",
      }),
    );
    expect(
      (await withMatchTransaction(({ service }) => service.detail(TARGET, created.id))).choices,
    ).toEqual({ dates: {}, games: { "342942": "YES" }, locations: {} });
    expect(
      (await withMatchTransaction(({ service }) => service.detail(ACTOR, created.id))).choices
        ?.dates?.[String(Date.parse(matchInput.dates[0]))],
    ).toBe("IF_NEEDED");
    await withMatchTransaction(({ service }) => service.leave(TARGET, invited.id));
    expect(
      (await new MatchesRepository(db).findById(created.id))?.choices?.[TARGET],
    ).toBeUndefined();
  });

  it("confirms with shared votes, hides pending invitees, and restores their access on replan", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    const invitations = await new MatchInvitationsRepository(db).listByMatch(created.id);
    const accepted = invitations.find((invitation) => invitation.inviteeUserId === TARGET);
    if (!accepted) throw new Error("Expected target invitation");
    await withMatchTransaction(({ service }) => service.respond(TARGET, accepted.id, "accept"));
    for (const userId of [ACTOR, TARGET]) {
      await withMatchTransaction(({ service }) =>
        service.setChoice(userId, created.id, {
          kind: "dates",
          itemId: matchInput.dates[0],
          choice: "YES",
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.setChoice(userId, created.id, {
          kind: "games",
          itemId: matchInput.gameIds[0],
          choice: "IF_NEEDED",
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.setChoice(userId, created.id, {
          kind: "locations",
          itemId: matchInput.locations[0].id,
          choice: userId === ACTOR ? "YES" : "IF_NEEDED",
        }),
      );
    }
    const dateKey = String(Date.parse(matchInput.dates[0]));
    const adminDetail = await withMatchTransaction(({ service }) =>
      service.detail(ACTOR, created.id),
    );
    expect(adminDetail.voteSummary).toMatchObject({
      dates: { [dateKey]: { yes: 2, no: 0, ifNeeded: 0, notChosen: 0 } },
      games: { [String(matchInput.gameIds[0])]: { yes: 0, no: 0, ifNeeded: 2, notChosen: 0 } },
      locations: { [matchInput.locations[0].id]: { yes: 1, no: 0, ifNeeded: 1, notChosen: 0 } },
      reasons: [],
      selectedDate: matchInput.dates[0],
      selectedLocationId: matchInput.locations[0].id,
      selectedGameId: matchInput.gameIds[0],
    });
    expect(
      (await withMatchTransaction(({ service }) => service.detail(TARGET, created.id))).voteSummary,
    ).toEqual(adminDetail.voteSummary);
    expect(
      (await withMatchTransaction(({ service }) => service.detail(THIRD, created.id))).voteSummary,
    ).toBeUndefined();
    const confirmed = await withMatchTransaction(
      ({ service }) => service.setStatus(ACTOR, created.id, "CREATED"),
      true,
    );
    expect(confirmed).toMatchObject({
      status: "CREATED",
      selectedDate: matchInput.dates[0],
      selectedGameId: matchInput.gameIds[0],
    });
    expect(confirmed.invitations).toHaveLength(1);
    expect(await withMatchTransaction(({ service }) => service.list(ACTOR))).toEqual([
      expect.objectContaining({ status: "CREATED", selectedGameName: "Ark Nova" }),
    ]);
    expect(await withMatchTransaction(({ service }) => service.list(THIRD))).toEqual([]);
    await expect(
      withMatchTransaction(({ service }) => service.detail(THIRD, created.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withMatchTransaction(({ service }) =>
        service.setChoice(TARGET, created.id, {
          kind: "games",
          itemId: matchInput.gameIds[0],
          choice: "YES",
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await new NotificationsRepository(db).list(TARGET, 10)).notifications.map(
        (item) => item.kind,
      ),
    ).toContain("match_created");
    expect((await new NotificationsRepository(db).list(THIRD, 10)).notifications).toEqual([]);
    await withMatchTransaction(
      ({ service }) => service.setStatus(ACTOR, created.id, "PLANNING"),
      true,
    );
    expect((await new MatchesRepository(db).findById(created.id))?.selectedDate).toBeUndefined();
    expect(
      (await withMatchTransaction(({ service }) => service.detail(THIRD, created.id))).match
        .invitations,
    ).toHaveLength(2);
    expect(
      (await new NotificationsRepository(db).list(TARGET, 10)).notifications.map(
        (item) => item.kind,
      ),
    ).toContain("match_replanning");
    const pending = invitations.find((invitation) => invitation.inviteeUserId === THIRD);
    if (!pending) throw new Error("Expected pending invitation");
    await withMatchTransaction(({ service }) => service.respond(THIRD, pending.id, "accept"));
    await expect(
      withMatchTransaction(({ service }) => service.setStatus(ACTOR, created.id, "CREATED")),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("removes declined invitation before re-invite and blocks late departure", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    expect(created.invitations).toHaveLength(1);
    const invitation = created.invitations[0];

    await expect(
      withMatchTransaction(({ service }) => service.respond(TARGET, invitation.id, "decline")),
    ).resolves.toMatchObject({ status: "DECLINED" });
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, created.id, invitation.id),
    );
    const reinvited = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, TARGET),
    );
    expect(reinvited).toMatchObject({ status: "PENDING" });
    expect(reinvited.id).not.toBe(invitation.id);
    await withMatchTransaction(({ service }) => service.respond(TARGET, reinvited.id, "accept"));

    await new MatchesRepository(db).setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
      date: created.dates[0],
      gameId: created.gameIds[0],
    });
    await expect(
      withMatchTransaction(({ service }) => service.leave(TARGET, reinvited.id)),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MatchError>>({
        status: 409,
        message: "Match is no longer in planning",
      }),
    );
    await expect(new MatchInvitationsRepository(db).findById(reinvited.id)).resolves.toMatchObject({
      status: "ACCEPTED",
    });
  });

  it("rolls back match and invitation writes together", async () => {
    await expect(
      withMatchTransaction(async ({ matches, invitations }) => {
        const created = await matches.create({
          clerkId: ACTOR,
          name: matchInput.name,
          dates: matchInput.dates,
          locations: matchInput.locations,
          minPlayers: matchInput.minPlayers,
          maxPlayers: matchInput.maxPlayers,
          gameIds: matchInput.gameIds,
        });
        await invitations.create(created.id, ACTOR, TARGET);
        throw Object.assign(new Error("force rollback"), { matchId: created.id });
      }),
    ).rejects.toMatchObject({ message: "force rollback" });
    await expect(new MatchesRepository(db).listAccessible(ACTOR, [])).resolves.toEqual([]);
    await expect(new MatchInvitationsRepository(db).listByInvitee(TARGET)).resolves.toEqual([]);
  });

  it("atomically updates match fields and reconciles invitations", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );

    const updated = await withMatchTransaction(({ service }) =>
      service.update(ACTOR, created.id, {
        name: "Updated integration match",
        dates: ["2026-11-01T20:00:00.000Z"],
        minPlayers: 2,
        maxPlayers: 3,
        invitedUserIds: [THIRD],
        gameIds: [342942],
      }),
    );

    expect(updated).toMatchObject({
      name: "Updated integration match",
      invitedUserIds: [THIRD],
    });
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toEqual([
      expect.objectContaining({ inviteeUserId: THIRD, status: "PENDING" }),
    ]);
    await expect(new MatchInvitationsRepository(db).listByInvitee(TARGET)).resolves.toEqual([]);
  });

  it("serializes concurrent invites so maxPlayers cannot be exceeded", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, maxPlayers: 2 }),
    );

    const results = await Promise.allSettled(
      [TARGET, THIRD].map((inviteeUserId) =>
        withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, inviteeUserId)),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toHaveLength(
      1,
    );
  });

  it("requires maxPlayers increase and lets admin remove pending or accepted users", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, maxPlayers: 2, invitedUserIds: [TARGET] }),
    );
    await expect(
      withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, THIRD)),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: "Match has no available invitation positions",
      }),
    );

    await withMatchTransaction(({ service }) =>
      service.update(ACTOR, created.id, { maxPlayers: 3 }),
    );
    const thirdInvitation = await withMatchTransaction(({ service }) =>
      service.invite(ACTOR, created.id, THIRD),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, created.id, created.invitations[0].id),
    );
    await withMatchTransaction(({ service }) =>
      service.removeInvitation(ACTOR, created.id, thirdInvitation.id),
    );
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toEqual([]);
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      maxPlayers: 3,
    });
  });

  it("updates title, dates, player range, and games while planning", async () => {
    await seedMatchDependencies();
    await new BoardGamesRepository(db).bulkUpsert([
      { id: 266192, name: "Wingspan", yearPublished: 2019, isExpansion: false },
    ]);
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    const updates = {
      name: "Updated game night",
      dates: ["2026-11-01T20:00:00.000Z", "2026-11-02T20:00:00.000Z"],
      minPlayers: 3,
      maxPlayers: 5,
      gameIds: [342942, 266192],
    };
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, created.id, updates)),
    ).resolves.toMatchObject(updates);

    const reduced = {
      name: "Small game night",
      dates: [updates.dates[0]],
      minPlayers: 2,
      maxPlayers: 3,
      gameIds: [266192],
    };
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, created.id, reduced)),
    ).resolves.toMatchObject(reduced);
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject(reduced);
  });

  it("rejects non-admin, finalized, missing-game, and occupied-capacity updates", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        maxPlayers: 3,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(TARGET, created.id, { name: "Unauthorized title" }),
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(ACTOR, created.id, { gameIds: [999999] }),
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 400 }));
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, created.id, { maxPlayers: 2 })),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: "maxPlayers cannot be lower than occupied player positions",
      }),
    );

    await new MatchesRepository(db).setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
      date: created.dates[0],
      gameId: created.gameIds[0],
    });
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(ACTOR, created.id, { name: "Finalized title" }),
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 409 }));
  });

  it("rolls back match field updates", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    await expect(
      withMatchTransaction(async ({ service }) => {
        await service.update(ACTOR, created.id, { name: "Rolled back title", maxPlayers: 5 });
        throw new Error("force update rollback");
      }),
    ).rejects.toThrow("force update rollback");
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      name: matchInput.name,
      maxPlayers: matchInput.maxPlayers,
    });
  });

  it("deletes match and all invitation statuses atomically", async () => {
    await seedMatchDependencies();
    await seedUser(users, FOURTH, "fourth@example.com");
    await relationships.becomeFriends(ACTOR, THIRD);
    await relationships.becomeFriends(ACTOR, FOURTH);
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        maxPlayers: 4,
        invitedUserIds: [TARGET, THIRD, FOURTH],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(THIRD, created.invitations[1].id, "decline"),
    );

    await withMatchTransaction(({ service }) => service.deleteMatch(ACTOR, created.id));
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toBeNull();
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toEqual([]);
  });

  it("rolls back match deletion and invitation cleanup together", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await expect(
      withMatchTransaction(async ({ service }) => {
        await service.deleteMatch(ACTOR, created.id);
        throw new Error("force deletion rollback");
      }),
    ).rejects.toThrow("force deletion rollback");
    await expect(new MatchesRepository(db).findById(created.id)).resolves.toMatchObject({
      id: created.id,
    });
    await expect(new MatchInvitationsRepository(db).listByMatch(created.id)).resolves.toHaveLength(
      1,
    );
  });

  it("persists, paginates, reads, and cleans notification data", async () => {
    const createdIds: ObjectId[] = [];
    const notifications = new NotificationsRepository(db, undefined, createdIds);
    await notifications.notify({
      kind: "friend_request",
      recipientUserId: TARGET,
      actorUserId: ACTOR,
    });
    await db
      .collection("users")
      .updateOne({ clerkId: TARGET }, { $set: { preferredLanguage: "it" } });
    await notifications.notify({
      kind: "match_invitation",
      recipientUserId: TARGET,
      actorUserId: ACTOR,
      matchName: "Catan",
      matchId: "507f1f77bcf86cd799439011",
    });

    expect(createdIds).toHaveLength(2);
    const firstPage = await notifications.list(TARGET, 1);
    expect(firstPage).toMatchObject({ unreadCount: 2 });
    expect(firstPage.notifications[0]).toMatchObject({
      title: "Nuovo invito a una partita",
      href: "/matches/507f1f77bcf86cd799439011",
      readAt: null,
    });
    expect(firstPage.nextCursor).toBe(firstPage.notifications[0]?.id);
    const secondPage = await notifications.list(TARGET, 1, firstPage.nextCursor ?? undefined);
    expect(secondPage.notifications[0]).toMatchObject({
      title: "New friend request",
      href: "/contacts",
    });
    expect(secondPage.nextCursor).toBeNull();

    await notifications.markRead(TARGET, firstPage.notifications[0]?.id ?? "");
    expect((await notifications.list(TARGET, 5)).unreadCount).toBe(1);
    expect(
      (await notifications.deleteOne(ACTOR, firstPage.notifications[0]?.id ?? "")).deletedCount,
    ).toBe(0);
    expect(
      (await notifications.deleteOne(TARGET, firstPage.notifications[0]?.id ?? "")).deletedCount,
    ).toBe(1);
    expect((await notifications.list(TARGET, 5)).notifications).toHaveLength(1);
    expect((await notifications.list(TARGET, 5)).unreadCount).toBe(1);
    await notifications.markAllRead(TARGET);
    expect((await notifications.list(TARGET, 5)).unreadCount).toBe(0);

    const subscriptions = new PushSubscriptionsRepository(db);
    await subscriptions.upsert(ACTOR, "token-1234567890123456", "android", "en");
    await subscriptions.upsert(TARGET, "token-1234567890123456", "web", "it");
    expect(await subscriptions.listByUser(ACTOR)).toEqual([]);
    expect(await subscriptions.listByUser(TARGET)).toMatchObject([
      { provider: "fcm", platform: "web", locale: "it" },
    ]);
    await subscriptions.remove(TARGET, "token-1234567890123456");
    expect(await subscriptions.listByUser(TARGET)).toEqual([]);

    await subscriptions.upsert(ACTOR, "token-abcdefghijklmnop", "ios", "en");
    await notifications.deleteForUser(ACTOR);
    expect(await notifications.list(TARGET, 5)).toMatchObject({ notifications: [] });
    expect(await subscriptions.listByUser(ACTOR)).toEqual([]);
  });

  it("rolls back notification creation with its source event", async () => {
    const session = client.startSession();
    await expect(
      session.withTransaction(async () => {
        await new NotificationsRepository(db, session).notify({
          kind: "friend_request",
          recipientUserId: TARGET,
          actorUserId: ACTOR,
        });
        throw new Error("rollback notification");
      }),
    ).rejects.toThrow("rollback notification");
    await session.endSession();
    expect((await new NotificationsRepository(db).list(TARGET, 5)).notifications).toEqual([]);
  });

  it("keeps existing match access and invitations after a block until the player leaves", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await new RelationshipService(relationships).block(ACTOR, TARGET);
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, created.id)),
    ).resolves.toMatchObject({
      match: {
        invitations: [expect.objectContaining({ inviteeUserId: TARGET, status: "PENDING" })],
      },
    });
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await expect(
      withMatchTransaction(({ service }) => service.detail(ACTOR, created.id)),
    ).resolves.toMatchObject({
      invitedPlayers: [
        expect.objectContaining({
          id: TARGET,
          invitation: expect.objectContaining({ status: "ACCEPTED" }),
        }),
      ],
    });
    await withMatchTransaction(({ service }) => service.leave(TARGET, created.invitations[0].id));
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, created.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, TARGET)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects invitations when either user blocked the other", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) => service.create(ACTOR, matchInput));
    await relationships.block(TARGET, ACTOR);
    await expect(
      withMatchTransaction(({ service }) => service.invite(ACTOR, created.id, TARGET)),
    ).rejects.toEqual(expect.objectContaining({ status: 404, message: "User not found" }));
  });
});

describe("group membership and OpenSkill on the MongoDB replica set", () => {
  it("allows only admin to remove pending or accepted group invitations by id", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const group = await withMatchTransaction(({ groups }) =>
      groups.create(ACTOR, {
        name: "Board Gamers",
        isPublic: false,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    const [pending, accepted] = group.invitations;
    await withMatchTransaction(({ groups }) => groups.respond(THIRD, accepted.id, "accept"));
    await expect(
      withMatchTransaction(({ groups }) => groups.removeInvitation(TARGET, pending.id)),
    ).rejects.toEqual(expect.objectContaining({ status: 403 }));
    await withMatchTransaction(({ groups }) => groups.removeInvitation(ACTOR, pending.id));
    await withMatchTransaction(({ groups }) => groups.removeInvitation(ACTOR, accepted.id));
    const updated = await withMatchTransaction(({ groups }) => groups.detail(ACTOR, group.id));
    expect(updated.invitations).toEqual([]);
    expect(updated.memberCount).toBe(1);
    await expect(
      withMatchTransaction(({ groups }) => groups.removeInvitation(ACTOR, pending.id)),
    ).rejects.toEqual(expect.objectContaining({ status: 404 }));
  });
  it("counts withdrawals and shared first-place wins, excluding planning matches", async () => {
    const groupId = "1f454adb-43e3-47ad-8c29-57b97a55a211";
    await db.collection(COLLECTIONS.MATCHES).insertMany([
      {
        id: "1f454adb-43e3-47ad-8c29-57b97a55a212",
        groupId,
        status: "TERMINATED",
        selectedGameId: 42,
        results: {
          entries: [
            { userId: ACTOR, score: "5", rank: 1 },
            { userId: TARGET, score: "5", rank: 1 },
            { userId: THIRD, score: null, rank: 3 },
          ],
        },
      },
      {
        id: "1f454adb-43e3-47ad-8c29-57b97a55a213",
        groupId,
        status: "TERMINATED",
        selectedGameId: 42,
        results: {
          entries: [
            { userId: ACTOR, score: "6", rank: 1 },
            { userId: TARGET, score: null, rank: 2 },
          ],
        },
      },
      {
        id: "1f454adb-43e3-47ad-8c29-57b97a55a214",
        groupId,
        status: "PLANNING",
        selectedGameId: 99,
      },
    ]);
    const standings = new GroupLeaderboardRepository(db);
    expect(await standings.games(groupId)).toEqual([{ id: 42, name: "42", imageUrl: null }]);
    expect((await standings.players(groupId, 42, 0, 25)).rows).toMatchObject([
      { _id: ACTOR, gamesPlayed: 2, gamesWon: 2, nd: 0 },
      { _id: TARGET, gamesPlayed: 2, gamesWon: 1, nd: 1 },
      { _id: THIRD, gamesPlayed: 1, gamesWon: 0, nd: 1 },
    ]);
  });

  it("accepts invited friends, allows group member match invite after unfriend, and keeps group history after archive", async () => {
    await seedMatchDependencies();
    await relationships.becomeFriends(ACTOR, THIRD);
    const group = await withMatchTransaction(
      ({ groups }) =>
        groups.create(ACTOR, {
          name: "Board Gamers",
          isPublic: false,
          invitedUserIds: [TARGET, THIRD],
        }),
      true,
    );
    expect(group.memberCount).toBe(1);
    expect(
      (await withMatchTransaction(({ groups }) => groups.list(TARGET)))[0].memberProfiles.map(
        (person) => person.id,
      ),
    ).toEqual([ACTOR]);
    expect((await new NotificationsRepository(db).list(TARGET, 10)).notifications).toEqual([
      expect.objectContaining({ kind: "group_invitation" }),
    ]);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .findOne({ recipientUserId: TARGET, kind: "group_invitation" }),
    ).toMatchObject({ recipientUserId: TARGET, actorUserId: ACTOR });
    const inviteTo = (userId: string) => {
      const invitation = group.invitations.find((item) => item.inviteeUserId === userId);
      if (!invitation) throw new Error("Missing group invitation");
      return invitation.id;
    };
    await withMatchTransaction(
      ({ groups }) => groups.respond(TARGET, inviteTo(TARGET), "accept"),
      true,
    );
    await withMatchTransaction(
      ({ groups }) => groups.respond(THIRD, inviteTo(THIRD), "accept"),
      true,
    );
    expect(
      (await withMatchTransaction(({ groups }) => groups.list(TARGET)))[0].memberProfiles
        .map((person) => person.id)
        .sort(),
    ).toEqual([ACTOR, TARGET, THIRD].sort());
    expect((await new NotificationsRepository(db).list(ACTOR, 10)).notifications).toEqual([
      expect.objectContaining({ kind: "group_invitation_accepted" }),
      expect.objectContaining({ kind: "group_invitation_accepted" }),
    ]);
    expect(
      await db
        .collection(COLLECTIONS.NOTIFICATIONS)
        .find({ recipientUserId: ACTOR, kind: "group_invitation_accepted" })
        .sort({ createdAt: -1, _id: -1 })
        .toArray(),
    ).toEqual([
      expect.objectContaining({ recipientUserId: ACTOR, actorUserId: THIRD }),
      expect.objectContaining({ recipientUserId: ACTOR, actorUserId: TARGET }),
    ]);
    expect((await withMatchTransaction(({ groups }) => groups.list(ACTOR)))[0].memberCount).toBe(3);
    await relationships.unfriend(ACTOR, TARGET);
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, {
        ...matchInput,
        groupId: group.id,
        invitedUserIds: [TARGET, THIRD],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, match.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(THIRD, match.invitations[1].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
        date: match.dates[0],
        gameId: match.gameIds[0],
      }),
    );
    await withMatchTransaction(({ groups }) => groups.archive(ACTOR, group.id));
    expect(await withMatchTransaction(({ groups }) => groups.list(ACTOR))).toEqual([]);
    const createdDetail = await withMatchTransaction(({ service }) =>
      service.detail(TARGET, match.id),
    );
    expect(createdDetail).not.toHaveProperty("currentGameRatings");
    const createdLeaderboard = await withMatchTransaction(({ service }) =>
      service.leaderboard(TARGET, match.id, match.gameIds[0]),
    );
    expect(createdLeaderboard.ratings).toEqual([
      { userId: ACTOR, score: 500, provisional: true, gamesPlayed: 0, gamesWon: 0, nd: 0 },
      { userId: TARGET, score: 500, provisional: true, gamesPlayed: 0, gamesWon: 0, nd: 0 },
      { userId: THIRD, score: 500, provisional: true, gamesPlayed: 0, gamesWon: 0, nd: 0 },
    ]);
    const results = await withMatchTransaction(({ service }) =>
      service.registerResults(ACTOR, match.id, {
        lowerWins: false,
        entries: [
          { userId: ACTOR, score: "5" },
          { userId: TARGET, score: "2" },
          { userId: THIRD, score: null },
        ],
        tieBreaks: [],
      }),
    );
    expect(results.status).toBe("TERMINATED");
    const ratings = new RatingsRepository(db);
    const global = await ratings.leaderboard(match.gameIds[0], "GLOBAL", null);
    const scoped = await ratings.leaderboard(match.gameIds[0], "GROUP", group.id);
    const standings = new GroupLeaderboardRepository(db);
    expect(await standings.games(group.id)).toEqual([
      { id: match.gameIds[0], name: "Ark Nova", imageUrl: null },
    ]);
    const first = await standings.players(group.id, match.gameIds[0], 0, 1);
    expect(first.rows).toMatchObject([{ _id: ACTOR, gamesPlayed: 1, gamesWon: 1, nd: 0 }]);
    expect(first.nextCursor).toBe(1);
    const groupStats = await ratings.matchStats([ACTOR, TARGET, THIRD], match.gameIds[0], group.id);
    const globalStats = await ratings.matchStats([ACTOR, TARGET, THIRD], match.gameIds[0], null);
    expect(groupStats).toEqual(
      new Map([
        [ACTOR, { gamesPlayed: 1, gamesWon: 1, nd: 0 }],
        [TARGET, { gamesPlayed: 1, gamesWon: 0, nd: 0 }],
        [THIRD, { gamesPlayed: 1, gamesWon: 0, nd: 1 }],
      ]),
    );
    expect(globalStats).toEqual(groupStats);
    expect(
      (
        await withMatchTransaction(({ service }) =>
          service.leaderboard(TARGET, match.id, match.gameIds[0]),
        )
      ).ratings.find((row) => row.userId === THIRD),
    ).toMatchObject({
      gamesPlayed: 1,
      gamesWon: 0,
      nd: 1,
    });
    expect((await standings.players(group.id, match.gameIds[0], 1, 25)).rows).toMatchObject([
      { _id: TARGET, gamesPlayed: 1, gamesWon: 0, nd: 0 },
      { _id: THIRD, gamesPlayed: 1, gamesWon: 0, nd: 1 },
    ]);
    const gameRatings = await ratings.forMatch(match.id, match.gameIds[0]);
    const current = await ratings.currentForPlayers([ACTOR, TARGET, THIRD], match.gameIds[0]);
    const groupCurrent = await ratings.currentForPlayers(
      [ACTOR, TARGET, THIRD, "new_player"],
      match.gameIds[0],
      group.id,
    );
    expect(groupCurrent.find((entry) => entry.userId === ACTOR)?.score).toBeCloseTo(
      500 + (scoped.find((entry) => entry.userId === ACTOR)?.conservativeScore ?? Number.NaN),
    );
    expect(groupCurrent.find((entry) => entry.userId === "new_player")).toEqual({
      userId: "new_player",
      score: 500,
      provisional: true,
    });
    await db.collection(COLLECTIONS.PLAYER_RATINGS).insertOne({
      userId: "global_only",
      gameId: match.gameIds[0],
      scope: "GLOBAL",
      groupId: null,
      mu: 30,
      sigma: 3,
      gamesPlayed: 6,
      conservativeScore: 21,
      updatedAt: new Date().toISOString(),
    });
    expect(await ratings.currentForPlayers(["global_only"], match.gameIds[0], group.id)).toEqual([
      { userId: "global_only", score: 500 + 30 - 3 * (((25 / 3) * 200) / 350), provisional: true },
    ]);
    expect(current.find((entry) => entry.userId === ACTOR)?.score).toBeCloseTo(
      500 + (global.find((entry) => entry.userId === ACTOR)?.conservativeScore ?? NaN),
    );
    expect(gameRatings).toHaveLength(3);
    expect(gameRatings.find((entry) => entry.userId === ACTOR)).toEqual({
      userId: ACTOR,
      score: 500 + (global.find((entry) => entry.userId === ACTOR)?.conservativeScore ?? NaN),
      delta: global.find((entry) => entry.userId === ACTOR)?.conservativeScore,
      provisional: true,
    });
    await expect(
      withMatchTransaction(({ service }) => service.detail(TARGET, match.id)),
    ).resolves.toMatchObject({
      gameRatings,
    });
    expect(global).toHaveLength(3);
    expect(scoped).toHaveLength(3);
    expect(global.every((row) => row.gamesPlayed === 1 && row.provisional)).toBe(true);
    expect(scoped.find((row) => row.userId === THIRD)?.mu).toBeLessThan(25);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: match.id }),
    ).toBe(6);
    await expect(
      withMatchTransaction(({ service }) =>
        service.registerResults(ACTOR, match.id, {
          lowerWins: false,
          entries: [{ userId: ACTOR, score: "5" }],
          tieBreaks: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: match.id }),
    ).toBe(6);
    const ungrouped = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [THIRD] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(THIRD, ungrouped.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(ungrouped.id, ACTOR, "PLANNING", "CREATED", {
        date: ungrouped.dates[0],
        gameId: ungrouped.gameIds[0],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.registerResults(ACTOR, ungrouped.id, {
        lowerWins: false,
        entries: [
          { userId: ACTOR, score: "1" },
          { userId: THIRD, score: null },
        ],
        tieBreaks: [],
      }),
    );
    expect(await ratings.matchStats([ACTOR, THIRD], match.gameIds[0], null)).toEqual(
      new Map([
        [ACTOR, { gamesPlayed: 2, gamesWon: 2, nd: 0 }],
        [THIRD, { gamesPlayed: 2, gamesWon: 0, nd: 2 }],
      ]),
    );
    expect(await ratings.matchStats([ACTOR, THIRD], match.gameIds[0], group.id)).toEqual(
      new Map([
        [ACTOR, { gamesPlayed: 1, gamesWon: 1, nd: 0 }],
        [THIRD, { gamesPlayed: 1, gamesWon: 0, nd: 1 }],
      ]),
    );
  });

  it("edits a planning match group atomically, checks membership again at confirmation, and locks it when created", async () => {
    await seedMatchDependencies();
    const group = await withMatchTransaction(({ groups }) =>
      groups.create(ACTOR, { name: "Tabletop Club", isPublic: false, invitedUserIds: [TARGET] }),
    );
    const invitation = group.invitations[0];
    if (!invitation) throw new Error("Missing group invitation");
    await withMatchTransaction(({ groups }) => groups.respond(TARGET, invitation.id, "accept"));
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, match.invitations[0].id, "accept"),
    );
    const linked = await withMatchTransaction(({ service }) =>
      service.update(ACTOR, match.id, { groupId: group.id, invitedUserIds: [TARGET] }),
    );
    expect(linked.groupId).toBe(group.id);
    await withMatchTransaction(({ groups }) => groups.leave(TARGET, group.id));
    await expect(
      withMatchTransaction(({ service }) => service.setStatus(ACTOR, match.id, "CREATED")),
    ).rejects.toMatchObject({
      status: 409,
      message: "Every participant must be an accepted group member",
    });
    await expect(
      withMatchTransaction(({ service }) =>
        service.update(ACTOR, match.id, { groupId: group.id, invitedUserIds: [TARGET] }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const unlinked = await withMatchTransaction(({ service }) =>
      service.update(ACTOR, match.id, { groupId: null, invitedUserIds: [TARGET] }),
    );
    expect(unlinked.groupId).toBeUndefined();
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
        date: match.dates[0],
        gameId: match.gameIds[0],
      }),
    );
    await expect(
      withMatchTransaction(({ service }) => service.update(ACTOR, match.id, { groupId: group.id })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("initializes first group game from pre-match global snapshots and then evolves independently", async () => {
    await seedMatchDependencies();
    const group = await withMatchTransaction(({ groups }) =>
      groups.create(ACTOR, { name: "Local Friends", isPublic: true, invitedUserIds: [TARGET] }),
    );
    const invitation = group.invitations[0];
    if (!invitation) throw new Error("Missing group invitation");
    await withMatchTransaction(({ groups }) => groups.respond(TARGET, invitation.id, "accept"));
    const play = async (groupId?: string) => {
      const match = await withMatchTransaction(({ service }) =>
        service.create(ACTOR, {
          ...matchInput,
          ...(groupId ? { groupId } : {}),
          invitedUserIds: [TARGET],
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.respond(TARGET, match.invitations[0].id, "accept"),
      );
      await withMatchTransaction(({ matches }) =>
        matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
          date: match.dates[0],
          gameId: match.gameIds[0],
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.registerResults(ACTOR, match.id, {
          lowerWins: false,
          entries: [
            { userId: ACTOR, score: "2" },
            { userId: TARGET, score: "1" },
          ],
          tieBreaks: [],
        }),
      );
      return match;
    };
    const first = await play();
    const firstGlobal = await db.collection(COLLECTIONS.PLAYER_RATINGS).findOne({
      userId: ACTOR,
      gameId: matchInput.gameIds[0],
      scope: "GLOBAL",
      groupId: null,
    });
    if (!firstGlobal) throw new Error("Missing global rating");
    expect(firstGlobal.mu).toBeGreaterThan(25);
    const second = await play(group.id);
    const groupEvent = await db.collection(COLLECTIONS.RATING_EVENTS).findOne({
      matchId: second.id,
      userId: ACTOR,
      scope: "GROUP",
      groupId: group.id,
    });
    if (!groupEvent) throw new Error("Missing group rating event");
    expect(groupEvent.before.mu).toBeCloseTo(firstGlobal.mu);
    expect(groupEvent.before.sigma).toBeCloseTo(
      Math.min(25 / 3, Math.max(((25 / 3) * 200) / 350, firstGlobal.sigma * 1.5)),
    );
    expect(groupEvent.before.gamesPlayed).toBe(0);
    expect(groupEvent.after.gamesPlayed).toBe(1);
    const globalEvent = await db.collection(COLLECTIONS.RATING_EVENTS).findOne({
      matchId: second.id,
      userId: ACTOR,
      scope: "GLOBAL",
      groupId: null,
    });
    expect(globalEvent?.before.mu).toBeCloseTo(firstGlobal.mu);
    expect(globalEvent?.after.gamesPlayed).toBe(2);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: first.id }),
    ).toBe(2);
  });

  it("applies concurrent result submissions once, without duplicate rating events", async () => {
    await seedMatchDependencies();
    const match = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, match.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
        date: match.dates[0],
        gameId: match.gameIds[0],
      }),
    );
    const input = {
      lowerWins: false,
      entries: [
        { userId: ACTOR, score: "5" },
        { userId: TARGET, score: "3" },
      ],
      tieBreaks: [],
    };
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        withMatchTransaction(({ service }) => service.registerResults(ACTOR, match.id, input)),
      ),
    );
    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments({ matchId: match.id }),
    ).toBe(2);
    const ratings = await db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .find({ gameId: matchInput.gameIds[0] })
      .toArray();
    expect(ratings).toHaveLength(2);
    expect(ratings.map((row) => row.gamesPlayed)).toEqual([1, 1]);
  });

  it("recalculates from fresh ratings when distinct matches for same players finish concurrently", async () => {
    await seedMatchDependencies();
    const matches = [];
    for (let index = 0; index < 2; index++) {
      const match = await withMatchTransaction(({ service }) =>
        service.create(ACTOR, {
          ...matchInput,
          name: `Ranking round ${index + 1}`,
          invitedUserIds: [TARGET],
        }),
      );
      await withMatchTransaction(({ service }) =>
        service.respond(TARGET, match.invitations[0].id, "accept"),
      );
      await withMatchTransaction(({ matches: repository }) =>
        repository.setStatus(match.id, ACTOR, "PLANNING", "CREATED", {
          date: match.dates[0],
          gameId: match.gameIds[0],
        }),
      );
      matches.push(match);
    }
    await Promise.all(
      matches.map((match) =>
        withMatchTransaction(({ service }) =>
          service.registerResults(ACTOR, match.id, {
            lowerWins: false,
            entries: [
              { userId: ACTOR, score: "2" },
              { userId: TARGET, score: "1" },
            ],
            tieBreaks: [],
          }),
        ),
      ),
    );
    const ratings = await db
      .collection(COLLECTIONS.PLAYER_RATINGS)
      .find({ gameId: matchInput.gameIds[0] })
      .toArray();
    expect(ratings).toHaveLength(2);
    expect(ratings.map((row) => row.gamesPlayed)).toEqual([2, 2]);
    const events = await db.collection(COLLECTIONS.RATING_EVENTS).find({ userId: ACTOR }).toArray();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.before.gamesPlayed).sort()).toEqual([0, 1]);
    const second = events.find((event) => event.before.gamesPlayed === 1);
    if (!second) throw new Error("Missing subsequent rating event");
    const change = (await new RatingsRepository(db).forMatch(second.matchId, second.gameId)).find(
      (entry) => entry.userId === ACTOR,
    );
    const score = second.after.mu - 3 * second.after.sigma;
    expect(change?.score).toBeCloseTo(500 + score);
    expect(change?.delta).toBeCloseTo(score - (second.before.mu - 3 * second.before.sigma));
    expect(change?.provisional).toBe(true);
  });

  it("does not create any rating or event when only one player scored", async () => {
    await seedMatchDependencies();
    const created = await withMatchTransaction(({ service }) =>
      service.create(ACTOR, { ...matchInput, invitedUserIds: [TARGET] }),
    );
    await withMatchTransaction(({ service }) =>
      service.respond(TARGET, created.invitations[0].id, "accept"),
    );
    await withMatchTransaction(({ matches }) =>
      matches.setStatus(created.id, ACTOR, "PLANNING", "CREATED", {
        date: created.dates[0],
        gameId: created.gameIds[0],
      }),
    );
    await withMatchTransaction(({ service }) =>
      service.registerResults(ACTOR, created.id, {
        lowerWins: false,
        entries: [
          { userId: ACTOR, score: "1" },
          { userId: TARGET, score: null },
        ],
        tieBreaks: [],
      }),
    );
    expect(await db.collection(COLLECTIONS.PLAYER_RATINGS).countDocuments()).toBe(0);
    expect(await db.collection(COLLECTIONS.RATING_EVENTS).countDocuments()).toBe(0);
  });
});
