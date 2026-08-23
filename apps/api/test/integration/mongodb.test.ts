import { MongoClient } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RelationshipRepository } from "../../src/app/lib/relationship.repository";

/**
 * Integration tests (testcontainers).
 *
 * The container runs mongo:7 as a REPLICA SET (`--replSet rs0` + initiate):
 * transactions (withTransaction) are only allowed on a replica set member —
 * a standalone mongo rejects them with "Transaction numbers are only allowed
 * on a replica set member or mongos". Production uses MongoDB Atlas
 * (replica set), so this mirrors the real runtime.
 */
const REPLICA_SET = "rs0";

async function startMongo() {
  const container = await new GenericContainer("mongo:7")
    .withCommand(["--replSet", REPLICA_SET, "--bind_ip_all"])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/i))
    .start();
  const host = `${container.getHost()}:${container.getMappedPort(27017)}`;
  // directConnection=true: the container announces itself with its internal
  // hostname, which the test runner cannot resolve — a single-host connection
  // to the mapped port skips replica-set topology discovery entirely.
  const uri = `mongodb://${host}/?directConnection=true`;
  const client = new MongoClient(uri);
  await client.connect();
  // Initiate the replica set with an EXPLICIT member host (the mapped
  // address), otherwise mongo uses its container hostname and the client
  // cannot reach it → server selection timeout.
  await client
    .db("admin")
    .command({ replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host }] } });
  for (let i = 0; i < 30; i += 1) {
    try {
      const status = await client.db("admin").command({ hello: 1 });
      if (status.isWritablePrimary) break;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { container, client };
}

describe("MongoDB via testcontainers", () => {
  let container: StartedTestContainer;
  let client: MongoClient;

  beforeAll(async () => {
    const started = await startMongo();
    container = started.container;
    client = started.client;
  }, 240_000);

  afterAll(async () => {
    await client?.close();
    await container?.stop();
  });

  it("connects to MongoDB and round-trips a document", async () => {
    const db = client.db("integration-test");
    const collection = db.collection("probe");
    await collection.insertOne({ hello: "world" });
    const doc = await collection.findOne({ hello: "world" });
    expect(doc).toMatchObject({ hello: "world" });
    await collection.drop();
  });
});

describe("RelationshipRepository flows on real MongoDB (transaction)", () => {
  let container: StartedTestContainer;
  let client: MongoClient;

  beforeAll(async () => {
    const started = await startMongo();
    container = started.container;
    client = started.client;
  }, 240_000);

  afterAll(async () => {
    await client?.close();
    await container?.stop();
  });

  it("block clears relationships and upserts the block row", async () => {
    const db = client.db("integration-rel");
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const repo = new RelationshipRepository(db, session);
        // Seed follow + friend_request edges so block has something to clear.
        await repo.upsert("a", "b", "follow", "accepted");
        await repo.upsert("b", "a", "follow", "accepted");
        await repo.upsert("a", "b", "friend_request", "accepted");
        await repo.upsert("b", "a", "friend_request", "accepted");

        // Regression: Promise.all with the same session used to throw
        // "may not be used concurrently"; serialized ops pass.
        await repo.clearBidirectional("a", "b", ["follow", "friend_request", "friend"]);
        await repo.upsert("a", "b", "block", "blocked");
      });
      const blocks = await db.collection("blocks").find({}).toArray();
      expect(blocks).toHaveLength(1);
      const follows = await db.collection("follows").find({}).toArray();
      const fr = await db.collection("friendRequests").find({}).toArray();
      expect(follows).toHaveLength(0);
      expect(fr).toHaveLength(0);
    } finally {
      await session.endSession();
      await db.dropDatabase();
    }
  });

  it("becomeFriends writes all four edges serially inside a transaction", async () => {
    const db = client.db("integration-rel2");
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const repo = new RelationshipRepository(db, session);
        await repo.becomeFriends("a", "b");
      });
      const follows = await db.collection("follows").find({}).toArray();
      const fr = await db.collection("friendRequests").find({}).toArray();
      expect(follows).toHaveLength(2);
      expect(fr).toHaveLength(2);
    } finally {
      await session.endSession();
      await db.dropDatabase();
    }
  });
});
