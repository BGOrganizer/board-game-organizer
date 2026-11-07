import { MongoClient } from "mongodb";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/app/lib/migrate";

/** Creates application collections/indexes and drops legacy `relationships`. */
describe("database migration", () => {
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

  it("creates application collections with their unique indexes", async () => {
    const db = client.db("migration-test");
    const result = await migrate(db);

    const names = await db.listCollections().toArray();
    const created = names.map((c) => c.name).sort();
    expect(created).toEqual(
      expect.arrayContaining([
        "users",
        "follows",
        "friendRequests",
        "blocks",
        "invites",
        "matches",
        "matchInvitations",
      ]),
    );

    const userIndexes = await db.collection("users").indexes();
    expect(userIndexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: { mobileNumberNormalized: 1 } })]),
    );

    // users.clerkId must be unique
    await db.collection("users").insertOne({ clerkId: "user_1" });
    await expect(db.collection("users").insertOne({ clerkId: "user_1" })).rejects.toThrow(
      /duplicate key/i,
    );

    // follows (fromUserId, toUserId) must be unique
    await db.collection("follows").insertOne({ fromUserId: "a", toUserId: "b" });
    await expect(
      db.collection("follows").insertOne({ fromUserId: "a", toUserId: "b" }),
    ).rejects.toThrow(/duplicate key/i);

    // invites.token must be unique
    await db.collection("invites").insertOne({ token: "tok_1" });
    await expect(db.collection("invites").insertOne({ token: "tok_1" })).rejects.toThrow(
      /duplicate key/i,
    );

    // MongoDB drop() on a missing collection resolves ok — no error, so the
    // migration reports the (no-op) drop as done.
    expect(result.droppedLegacyRelationships).toBe(true);
  });

  it("normalizes existing mobile numbers for contact matching", async () => {
    const db = client.db("migration-test");
    await db.collection("users").insertMany([
      { clerkId: "user_phone", mobileNumber: "+39 333 123 4567" },
      {
        clerkId: "user_invalid_phone",
        mobileNumber: "not a phone",
        mobileNumberNormalized: "stale",
      },
    ]);

    await migrate(db);

    await expect(db.collection("users").findOne({ clerkId: "user_phone" })).resolves.toMatchObject({
      mobileNumberNormalized: "393331234567",
    });
    await expect(
      db.collection("users").findOne({ clerkId: "user_invalid_phone" }),
    ).resolves.not.toHaveProperty("mobileNumberNormalized");
  });

  it("drops the legacy relationships collection (now unused)", async () => {
    const db = client.db("migration-test");
    await db.collection("relationships").insertOne({ fromUserId: "a", toUserId: "b" });
    const result = await migrate(db);
    expect(result.droppedLegacyRelationships).toBe(true);
    const exists = await db.listCollections({ name: "relationships" }).toArray();
    expect(exists).toHaveLength(0);
  });
});
