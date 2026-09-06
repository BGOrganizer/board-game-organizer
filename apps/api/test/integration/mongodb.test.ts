import { type Db, MongoClient } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { COLLECTIONS } from "../../src/app/lib/db";
import { migrate } from "../../src/app/lib/migrate";
import { RelationshipRepository } from "../../src/app/lib/relationship.repository";
import { RelationshipService } from "../../src/app/lib/relationship.service";

const ACTOR = "user_actor";
const TARGET = "user_target";
const THIRD = "user_third";

let container: StartedTestContainer;
let client: MongoClient;
let db: Db;

async function transact<T>(
  work: (service: RelationshipService, repo: RelationshipRepository) => Promise<T>,
) {
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const repo = new RelationshipRepository(db, session);
      return work(new RelationshipService(repo), repo);
    });
  } finally {
    await session.endSession();
  }
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
  let primary = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await client.db("admin").command({ hello: 1 });
    if (status.isWritablePrimary) {
      primary = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!primary) throw new Error("MongoDB replica set did not elect a primary");
  db = client.db("integration-social");
});

afterAll(async () => {
  await client?.close();
  await container?.stop();
});

beforeEach(async () => {
  await db.dropDatabase();
  await migrate(db);
  await db.collection(COLLECTIONS.USERS).insertMany([
    { clerkId: ACTOR, name: "Actor", email: "actor@example.com" },
    { clerkId: TARGET, name: "Target", email: "target@example.com" },
    { clerkId: THIRD, name: "Third", email: "third@example.com" },
  ]);
});

describe("social transactions on MongoDB replica set", () => {
  it("round-trips a document and creates unique social indexes", async () => {
    await db.collection("probe").insertOne({ hello: "world" });
    await expect(db.collection("probe").findOne({ hello: "world" })).resolves.toMatchObject({
      hello: "world",
    });

    const followIndexes = await db.collection(COLLECTIONS.FOLLOWS).indexes();
    const requestIndexes = await db.collection(COLLECTIONS.FRIEND_REQUESTS).indexes();
    const blockIndexes = await db.collection(COLLECTIONS.BLOCKS).indexes();
    expect(followIndexes).toContainEqual(
      expect.objectContaining({ key: { fromUserId: 1, toUserId: 1 }, unique: true }),
    );
    expect(requestIndexes).toContainEqual(
      expect.objectContaining({ key: { fromUserId: 1, toUserId: 1 }, unique: true }),
    );
    expect(blockIndexes).toContainEqual(
      expect.objectContaining({ key: { fromUserId: 1, toUserId: 1 }, unique: true }),
    );
  });

  it("runs follow and friendship lifecycle atomically", async () => {
    await transact(async (service) => service.follow(ACTOR, TARGET));
    await transact(async (service) => service.follow(ACTOR, TARGET));
    expect(
      await db
        .collection(COLLECTIONS.FOLLOWS)
        .countDocuments({ fromUserId: ACTOR, toUserId: TARGET }),
    ).toBe(1);

    await transact(async (service) => service.sendFriendRequest(ACTOR, TARGET));
    expect(await transact(async (service) => service.list(TARGET, "pending"))).toHaveLength(1);
    expect(await transact(async (service) => service.list(ACTOR, "sent"))).toHaveLength(1);

    await transact(async (service) => service.respondToFriendRequest(TARGET, ACTOR, "accepted"));
    expect(await transact(async (service) => service.list(ACTOR, "friends"))).toEqual([
      { fromUserId: ACTOR, toUserId: TARGET, status: "accepted" },
    ]);
    expect(await transact(async (service) => service.list(TARGET, "friends"))).toEqual([
      { fromUserId: TARGET, toUserId: ACTOR, status: "accepted" },
    ]);
    expect(
      await db.collection(COLLECTIONS.FOLLOWS).countDocuments({
        $or: [
          { fromUserId: ACTOR, toUserId: TARGET },
          { fromUserId: TARGET, toUserId: ACTOR },
        ],
      }),
    ).toBe(2);

    await transact(async (service) => service.unfriend(ACTOR, TARGET));
    expect(await transact(async (service) => service.list(ACTOR, "friends"))).toEqual([]);
    expect(await db.collection(COLLECTIONS.FOLLOWS).countDocuments({})).toBe(2);
  });

  it("supports reject, resend, cancel, and unfollow lifecycle", async () => {
    await transact(async (service) => service.sendFriendRequest(ACTOR, TARGET));
    await transact(async (service) => service.respondToFriendRequest(TARGET, ACTOR, "rejected"));
    await transact(async (service) => service.sendFriendRequest(ACTOR, TARGET));
    await transact(async (service) => service.cancelFriendRequest(ACTOR, TARGET));
    expect(await db.collection(COLLECTIONS.FRIEND_REQUESTS).countDocuments({})).toBe(0);

    await transact(async (service) => service.follow(ACTOR, TARGET));
    await transact(async (service) => service.unfollow(ACTOR, TARGET));
    expect(await db.collection(COLLECTIONS.FOLLOWS).countDocuments({})).toBe(0);
  });

  it("blocks atomically, preserves the target follow, and hides both users", async () => {
    await transact(async (service) => service.sendFriendRequest(ACTOR, TARGET));
    await transact(async (service) => service.respondToFriendRequest(TARGET, ACTOR, "accepted"));
    await transact(async (service) => service.block(ACTOR, TARGET));

    expect(await transact(async (service) => service.list(ACTOR, "blocked"))).toHaveLength(1);
    expect(await transact(async (service) => service.list(ACTOR, "following"))).toEqual([]);
    expect(await transact(async (service) => service.list(TARGET, "following"))).toEqual([]);
    expect(await transact(async (service) => service.list(ACTOR, "friends"))).toEqual([]);
    expect(await db.collection(COLLECTIONS.FRIEND_REQUESTS).countDocuments({})).toBe(0);
    expect(
      await db.collection(COLLECTIONS.FOLLOWS).findOne({
        fromUserId: TARGET,
        toUserId: ACTOR,
      }),
    ).not.toBeNull();
    expect(
      await db.collection(COLLECTIONS.FOLLOWS).findOne({
        fromUserId: ACTOR,
        toUserId: TARGET,
      }),
    ).toBeNull();

    await expect(transact(async (service) => service.follow(TARGET, ACTOR))).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      transact(async (service) => service.sendFriendRequest(TARGET, ACTOR)),
    ).rejects.toMatchObject({ status: 404 });

    await transact(async (service) => service.unblock(ACTOR, TARGET));
    expect(await db.collection(COLLECTIONS.BLOCKS).countDocuments({})).toBe(0);
  });

  it("rolls back every partial block mutation when final write fails", async () => {
    await transact(async (service) => service.sendFriendRequest(ACTOR, TARGET));
    await transact(async (service) => service.respondToFriendRequest(TARGET, ACTOR, "accepted"));

    await expect(
      transact(async (service, repo) => {
        repo.block = async () => {
          throw new Error("forced failure");
        };
        await service.block(ACTOR, TARGET);
      }),
    ).rejects.toThrow("forced failure");

    expect(await db.collection(COLLECTIONS.BLOCKS).countDocuments({})).toBe(0);
    expect(await db.collection(COLLECTIONS.FRIEND_REQUESTS).countDocuments({})).toBe(2);
    expect(await db.collection(COLLECTIONS.FOLLOWS).countDocuments({})).toBe(2);
  });

  it("removes every orphan social edge when a user is deleted", async () => {
    await db.collection(COLLECTIONS.FOLLOWS).insertMany([
      { fromUserId: ACTOR, toUserId: TARGET },
      { fromUserId: TARGET, toUserId: THIRD },
    ]);
    await db.collection(COLLECTIONS.FRIEND_REQUESTS).insertMany([
      { fromUserId: TARGET, toUserId: ACTOR, status: "pending" },
      { fromUserId: TARGET, toUserId: THIRD, status: "pending" },
    ]);
    await db.collection(COLLECTIONS.BLOCKS).insertMany([
      { fromUserId: ACTOR, toUserId: THIRD },
      { fromUserId: TARGET, toUserId: THIRD },
    ]);

    await transact(async (_service, repo) => repo.deleteAllForUser(ACTOR));

    expect(await db.collection(COLLECTIONS.FOLLOWS).countDocuments({})).toBe(1);
    expect(await db.collection(COLLECTIONS.FRIEND_REQUESTS).countDocuments({})).toBe(1);
    expect(await db.collection(COLLECTIONS.BLOCKS).countDocuments({})).toBe(1);
  });

  it("keeps concurrent follow and request writes unique", async () => {
    await Promise.all([
      transact(async (service) => service.follow(ACTOR, TARGET)),
      transact(async (service) => service.follow(ACTOR, TARGET)),
    ]);
    expect(await db.collection(COLLECTIONS.FOLLOWS).countDocuments({})).toBe(1);

    await Promise.allSettled([
      transact(async (service) => service.sendFriendRequest(ACTOR, TARGET)),
      transact(async (service) => service.sendFriendRequest(ACTOR, TARGET)),
    ]);
    expect(await db.collection(COLLECTIONS.FRIEND_REQUESTS).countDocuments({})).toBe(1);
  });
});
