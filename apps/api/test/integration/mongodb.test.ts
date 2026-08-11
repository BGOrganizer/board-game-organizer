import { MongoClient } from "mongodb";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
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
