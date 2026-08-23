import { MongoClient } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integration test scaffold (testcontainers).
 *
 * Currently the API has no database attached, so this test only validates the
 * containerised-MongoDB pattern that the upcoming MongoDB integration will
 * rely on. Once the API connects to MongoDB, real integration tests (e.g.
 * relationship repository flows) will extend this setup.
 */
describe("MongoDB via testcontainers", () => {
  let container: StartedTestContainer;
  let client: MongoClient;

  beforeAll(async () => {
    container = await new GenericContainer("mongo:7")
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/i))
      .start();
    const uri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}`;
    client = new MongoClient(uri);
    await client.connect();
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

import { RelationshipRepository } from "../../src/app/lib/relationship.repository";

describe("RelationshipRepository flows on real MongoDB (session concurrency)", () => {
  let container: StartedTestContainer;
  let client: MongoClient;

  beforeAll(async () => {
    container = await new GenericContainer("mongo:7")
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/i))
      .start();
    const uri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}`;
    client = new MongoClient(uri);
    await client.connect();
  }, 240_000);

  afterAll(async () => {
    await client?.close();
    await container?.stop();
  });

  it("block clears relationships and upserts the block row (serialized, no session concurrency)", async () => {
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

        // The regression: Promise.all with the same session throws
        // "may not be used concurrently" on real MongoDB. Serialized ops pass.
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
