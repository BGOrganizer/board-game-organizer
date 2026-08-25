import { MongoClient } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RelationshipRepository } from "../../src/app/lib/relationship.repository";

/**
 * Integration tests (testcontainers).
 *
 * The container runs mongo:7 as a REPLICA SET (single node): transactions
 * (withTransaction) are only allowed on a replica set member — a standalone
 * mongo rejects them. Production uses MongoDB Atlas (replica set), so this
 * mirrors the real runtime.
 */
const REPLICA_SET = "rs0";

async function startMongo() {
  const container = await new GenericContainer("mongo:7")
    .withCommand(["--replSet", REPLICA_SET, "--bind_ip_all"])
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/i))
    .start();
  // Member host uses the INTERNAL port (27017): the node checks whether the
  // announced member "maps to this node" and a mapped port never matches.
  // directConnection=true keeps the client on a single socket (no discovery).
  const uri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/?directConnection=true`;
  const client = new MongoClient(uri);
  await client.connect();
  await client.db("admin").command({
    replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host: "localhost:27017" }] },
  });
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

  it("block keeps the blocked user's follow, drops the viewer's follow, stores the block", async () => {
    const db = client.db("integration-rel");
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const repo = new RelationshipRepository(db, session);
        // Seed reciprocal follows + friend edges.
        await repo.upsert("a", "b", "follow", "accepted");
        await repo.upsert("b", "a", "follow", "accepted");
        await repo.upsert("a", "b", "friend_request", "accepted");
        await repo.upsert("b", "a", "friend_request", "accepted");
        // Block: viewer (a) stops following b; b's follow toward a survives.
        await repo.delete("a", "b", "follow");
        await repo.clearBidirectional("a", "b", ["friend_request"]);
        await repo.upsert("a", "b", "block", "blocked");
      });
      const blocks = await db.collection("blocks").find({}).toArray();
      expect(blocks).toHaveLength(1);
      // Only b→a survives (the blocked user still follows the viewer).
      const follows = await db.collection("follows").find({}).toArray();
      const fr = await db.collection("friendRequests").find({}).toArray();
      expect(follows).toHaveLength(1);
      expect(follows[0]).toMatchObject({ fromUserId: "b", toUserId: "a" });
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
