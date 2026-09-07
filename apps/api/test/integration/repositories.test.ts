import { type Db, MongoClient } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../../src/app/lib/migrate";
import { RelationshipRepository } from "../../src/app/lib/relationship.repository";
import { UsersRepository } from "../../src/app/lib/users.repository";

const ACTOR = "user_actor";
const TARGET = "user_target";
const THIRD = "user_third";

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

async function seedUser(repository: UsersRepository, id: string, email: string) {
  await repository.upsertFromClerk({
    id,
    email,
    name: id,
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
  await seedUser(users, ACTOR, "actor@example.com");
  await seedUser(users, TARGET, "target@example.com");
  await seedUser(users, THIRD, "third@example.com");
});

describe("API repositories on a MongoDB replica set", () => {
  it("persists and retrieves users through UsersRepository", async () => {
    expect(await relationships.userExists(ACTOR)).toBe(true);
    await expect(users.findById(ACTOR)).resolves.toMatchObject({
      clerkId: ACTOR,
      email: "actor@example.com",
    });
    await expect(users.findByEmail("target@example.com")).resolves.toMatchObject({
      clerkId: TARGET,
    });

    await seedUser(users, ACTOR, "actor-updated@example.com");
    await expect(users.findById(ACTOR)).resolves.toMatchObject({
      email: "actor-updated@example.com",
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

    await relationships.unfriend(ACTOR, TARGET);
    expect(await relationships.isFriend(ACTOR, TARGET)).toBe(false);
    await expect(relationships.listFollowing(ACTOR)).resolves.toHaveLength(1);
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
