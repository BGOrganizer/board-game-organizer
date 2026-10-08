import { describe, expect, it, vi } from "vitest";
import { MatchesRepository } from "@/app/lib/matches/matches.repository";

function setup(
  rows: Array<Record<string, unknown>> = [],
  found: Record<string, unknown> | null = null,
) {
  const cursor = {
    sort: vi.fn(function sort() {
      return cursor;
    }),
    toArray: vi.fn(async () => rows),
  };
  const collection = {
    insertOne: vi.fn(async () => ({ insertedId: "id" })),
    countDocuments: vi.fn(async () => 3),
    findOne: vi.fn(async () => found),
    findOneAndUpdate: vi.fn(async () => found),
    find: vi.fn(() => cursor),
    updateOne: vi.fn(async () => ({ matchedCount: 1 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
  };
  const db = { collection: vi.fn(() => collection) };
  return { db, collection, cursor };
}

const input = {
  clerkId: "user_1",
  name: "Friday night games",
  dates: ["2026-09-05T20:00:00.000Z"],
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
  maxPlayers: 5,
  gameIds: [342942],
};

const stored = {
  id: "69409f64-7414-4e47-815c-36b01c1bff95",
  ...input,
  status: "CREATED",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
};

describe("MatchesRepository", () => {
  it("retains event-table authorization and fixed-selection metadata on reads", async () => {
    const eventTable = {
      organizationId: "org",
      eventId: "event",
      tableId: "table",
      eventName: "Event",
      tableName: "Table",
      demonstratorUserId: "demo",
      openSkill: false,
      bookingClosesAt: "2026-10-10T12:00:00.000Z",
      endsAt: "2026-10-11T12:00:00.000Z",
    };
    const db = {
      collection: () => ({
        findOne: vi.fn(async () => ({
          id: "match",
          clerkId: "admin",
          name: "Event table",
          dates: [],
          gameIds: [],
          minPlayers: 2,
          maxPlayers: 4,
          eventTable,
          createdAt: eventTable.bookingClosesAt,
        })),
      }),
    };
    expect((await new MatchesRepository(db as never).findById("match"))?.eventTable).toEqual(
      eventTable,
    );
  });
  it("keeps legacy locations compatible and persists location choices and confirmation", async () => {
    const locationId = input.locations[0].id;
    const selected = {
      ...stored,
      selectedLocationId: locationId,
      choices: { user_1: { locations: { [locationId]: "YES" } } },
    };
    const { db, collection } = setup([], selected);
    const repository = new MatchesRepository(db as never);
    expect((await repository.findById(stored.id))?.selectedLocationId).toBe(locationId);
    expect(
      (
        await new MatchesRepository(
          setup([], { ...stored, locations: undefined }).db as never,
        ).findById(stored.id)
      )?.locations,
    ).toEqual([]);
    await repository.setChoice(stored.id, "user_1", {
      kind: "locations",
      itemId: locationId,
      choice: "YES",
    });
    expect(collection.updateOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ "locations.id": locationId }),
      { $set: { [`choices.user_1.locations.${locationId}`]: "YES" } },
      {},
    );
    await repository.clearRemovedOptionChoices(selected as never, [], [], [locationId]);
    expect(collection.updateOne).toHaveBeenLastCalledWith(
      { id: stored.id },
      { $unset: { [`choices.user_1.locations.${locationId}`]: "" } },
      {},
    );
    await repository.setStatus(stored.id, stored.clerkId, "PLANNING", "CREATED", {
      date: stored.dates[0],
      gameId: stored.gameIds[0],
      locationId,
    });
    expect(collection.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({ selectedLocationId: locationId }),
      }),
      expect.any(Object),
    );
  });
  it("creates a PLANNING match with generated id and timestamps", async () => {
    const { db, collection } = setup();
    const match = await new MatchesRepository(db as never).create(input);
    expect(match).toMatchObject({ ...input, status: "PLANNING" });
    expect(match.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(match.createdAt).toBe(match.updatedAt);
    expect(collection.insertOne).toHaveBeenCalledWith(match, {});
  });

  it("persists optional group linkage and reads it back", async () => {
    const groupId = "1f454adb-43e3-47ad-8c29-57b97a55a211";
    const grouped = { ...stored, groupId };
    const { db, collection } = setup([], grouped);
    const repo = new MatchesRepository(db as never);
    expect((await repo.create({ ...input, groupId })).groupId).toBe(groupId);
    expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({ groupId }), {});
    expect((await repo.findById(stored.id))?.groupId).toBe(groupId);
  });

  it("passes a transaction session while creating", async () => {
    const { db, collection } = setup();
    const session = { id: "session" };
    await new MatchesRepository(db as never, session as never).create(input);
    expect(collection.insertOne).toHaveBeenCalledWith(expect.any(Object), { session });
  });

  it("lists accessible matches newest first and normalizes legacy rows", async () => {
    const legacy = { ...stored, status: undefined, updatedAt: undefined, invitedUserIds: ["old"] };
    const { db, collection, cursor } = setup([stored, legacy]);
    const matches = await new MatchesRepository(db as never).listAccessible("user_1", ["match_2"]);
    expect(collection.find).toHaveBeenCalledWith(
      {
        $or: [
          { clerkId: "user_1" },
          { id: { $in: ["match_2"] } },
          { "eventTable.demonstratorUserId": "user_1" },
        ],
      },
      { projection: { _id: 0 } },
    );
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(matches[0]).toMatchObject({ status: "CREATED", updatedAt: stored.updatedAt });
    expect(matches[1]).toMatchObject({ status: "PLANNING", updatedAt: stored.createdAt });
    expect(matches[1]).not.toHaveProperty("invitedUserIds");
  });

  it("counts only terminated matches in which the player recorded a score", async () => {
    const { db, collection } = setup();
    await expect(new MatchesRepository(db as never).countPlayedByUser("user_1")).resolves.toBe(3);
    expect(collection.countDocuments).toHaveBeenCalledWith(
      {
        status: "TERMINATED",
        "results.entries": { $elemMatch: { userId: "user_1", score: { $type: "string" } } },
      },
      {},
    );
  });

  it("finds and normalizes a match by id", async () => {
    const { db, collection } = setup([], stored);
    await expect(new MatchesRepository(db as never).findById(stored.id)).resolves.toMatchObject({
      id: stored.id,
      status: "CREATED",
    });
    expect(collection.findOne).toHaveBeenCalledWith({ id: stored.id }, { projection: { _id: 0 } });
  });

  it("normalizes stored votes and confirmed options", async () => {
    const selected = {
      ...stored,
      selectedDate: stored.dates[0],
      selectedGameId: stored.gameIds[0],
      choices: { user_1: { dates: { [String(Date.parse(stored.dates[0]))]: "YES" } } },
    };
    const { db } = setup([], selected);
    await expect(new MatchesRepository(db as never).findById(stored.id)).resolves.toMatchObject(
      selected,
    );
  });

  it("returns null when the match does not exist", async () => {
    await expect(
      new MatchesRepository(setup().db as never).findById("missing"),
    ).resolves.toBeNull();
  });

  it("serializes invitation changes", async () => {
    const { db, collection } = setup();
    await new MatchesRepository(db as never).serializeInvitationChange(stored.id);
    expect(collection.updateOne).toHaveBeenCalledWith(
      { id: stored.id },
      { $inc: { invitationRevision: 1 } },
      {},
    );
  });

  it("writes choices atomically only for still-existing options", async () => {
    const { db, collection } = setup();
    const repo = new MatchesRepository(db as never);
    await repo.setChoice(stored.id, "user_1", {
      kind: "dates",
      itemId: input.dates[0],
      choice: "YES",
    });
    expect(collection.updateOne).toHaveBeenCalledWith(
      {
        id: stored.id,
        $or: [{ status: "PLANNING" }, { status: { $exists: false } }],
        dates: input.dates[0],
      },
      { $set: { [`choices.user_1.dates.${Date.parse(input.dates[0])}`]: "YES" } },
      {},
    );
    await repo.setChoice(stored.id, "user_1", { kind: "games", itemId: 342942, choice: "NO" });
    expect(collection.updateOne).toHaveBeenCalledWith(
      {
        id: stored.id,
        $or: [{ status: "PLANNING" }, { status: { $exists: false } }],
        gameIds: 342942,
      },
      { $set: { "choices.user_1.games.342942": "NO" } },
      {},
    );
  });

  it("clears a departing player's choices and removed match options", async () => {
    const { db, collection } = setup();
    const repo = new MatchesRepository(db as never);
    await repo.clearChoices(stored.id, "user_1");
    expect(collection.updateOne).toHaveBeenCalledWith(
      { id: stored.id },
      { $unset: { "choices.user_1": "" } },
      {},
    );
    await repo.clearRemovedOptionChoices(
      {
        ...stored,
        choices: {
          user_1: {
            dates: { [String(Date.parse(input.dates[0]))]: "YES" },
            games: { "342942": "NO" },
          },
        },
      } as never,
      input.dates,
      [342942],
    );
    expect(collection.updateOne).toHaveBeenCalledWith(
      { id: stored.id },
      {
        $unset: {
          [`choices.user_1.dates.${Date.parse(input.dates[0])}`]: "",
          "choices.user_1.games.342942": "",
        },
      },
      {},
    );
  });

  it("rejects unsafe vote keys and skips clearing absent options", () => {
    const { db, collection } = setup();
    const repo = new MatchesRepository(db as never);
    expect(() => repo.clearChoices(stored.id, "user.bad")).toThrow("Invalid user id");
    expect(() =>
      repo.clearRemovedOptionChoices(
        { ...stored, choices: { "user.bad": {} } } as never,
        input.dates,
        [],
      ),
    ).toThrow("Invalid user id");
    expect(repo.clearRemovedOptionChoices(stored as never, input.dates, [342942])).toBeUndefined();
    expect(
      repo.clearRemovedOptionChoices({ ...stored, choices: { user_1: {} } } as never, [], []),
    ).toBeUndefined();
    expect(collection.updateOne).not.toHaveBeenCalled();
  });

  it("updates planning match fields and normalizes result", async () => {
    const changes = {
      name: "Updated games",
      dates: ["2026-10-01T20:00:00.000Z"],
      minPlayers: 3,
      maxPlayers: 7,
      gameIds: [1, 2],
    };
    const updated = { ...stored, ...changes };
    const { db, collection } = setup([], updated);
    await expect(
      new MatchesRepository(db as never).updatePlanning(stored.id, "user_1", changes),
    ).resolves.toEqual({ ...updated, isPublic: false });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: stored.id, clerkId: "user_1", status: "PLANNING" },
      { $set: { ...changes, updatedAt: expect.any(String) } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  });

  it("links and clears group only in planning update", async () => {
    const groupId = "1f454adb-43e3-47ad-8c29-57b97a55a211";
    const { db, collection } = setup([], { ...stored, groupId });
    const repo = new MatchesRepository(db as never);
    expect((await repo.updatePlanning(stored.id, "user_1", { groupId }))?.groupId).toBe(groupId);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: stored.id, clerkId: "user_1", status: "PLANNING" },
      { $set: { groupId, updatedAt: expect.any(String) } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    collection.findOneAndUpdate.mockResolvedValueOnce(stored);
    expect(
      (await repo.updatePlanning(stored.id, "user_1", { groupId: null }))?.groupId,
    ).toBeUndefined();
    expect(collection.findOneAndUpdate).toHaveBeenLastCalledWith(
      { id: stored.id, clerkId: "user_1", status: "PLANNING" },
      { $set: { updatedAt: expect.any(String) }, $unset: { groupId: "" } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  });

  it("returns null when planning update does not match", async () => {
    await expect(
      new MatchesRepository(setup().db as never).updatePlanning(stored.id, "user_1", {
        name: "Updated games",
      }),
    ).resolves.toBeNull();
  });

  it("atomically records results only for a CREATED match and returns finalized data", async () => {
    const results = {
      lowerWins: true,
      entries: [{ userId: "user_1", score: "-1.5", rank: 1 }],
      tieBreaks: [],
      finalizedAt: "2026-09-02T12:00:00.000Z",
    };
    const { db, collection } = setup([], { ...stored, status: "TERMINATED", results });
    const repo = new MatchesRepository(db as never);
    await expect(repo.registerResults(stored.id, "user_1", results)).resolves.toMatchObject({
      status: "TERMINATED",
      results,
    });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: stored.id, clerkId: "user_1", status: "CREATED", results: { $exists: false } },
      { $set: { status: "TERMINATED", results, updatedAt: results.finalizedAt } },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    collection.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(repo.registerResults(stored.id, "user_1", results)).resolves.toBeNull();
  });

  it("deletes only a match owned by admin", async () => {
    const { db, collection } = setup();
    await new MatchesRepository(db as never).deleteById(stored.id, "user_1");
    expect(collection.deleteOne).toHaveBeenCalledWith(
      { id: stored.id, clerkId: "user_1", status: { $ne: "TERMINATED" } },
      {},
    );
  });

  it("clears confirmed options on replan and reports a concurrent status change", async () => {
    const { db, collection } = setup([], { ...stored, status: "PLANNING" });
    const repo = new MatchesRepository(db as never);
    await expect(repo.setStatus(stored.id, "user_1", "CREATED", "PLANNING")).resolves.toMatchObject(
      { status: "PLANNING" },
    );
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: stored.id, clerkId: "user_1", status: "CREATED" },
      {
        $set: { status: "PLANNING", updatedAt: expect.any(String) },
        $unset: { selectedDate: "", selectedLocationId: "", selectedGameId: "" },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
    collection.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(repo.setStatus(stored.id, "user_1", "CREATED", "PLANNING")).resolves.toBeNull();
  });

  it("updates match status and timestamp", async () => {
    const { db, collection } = setup();
    await new MatchesRepository(db as never).setStatus(stored.id, "user_1", "PLANNING", "CREATED", {
      date: stored.dates[0],
      gameId: stored.gameIds[0],
    });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        id: stored.id,
        clerkId: "user_1",
        $or: [{ status: "PLANNING" }, { status: { $exists: false } }],
      },
      {
        $set: {
          status: "CREATED",
          selectedDate: stored.dates[0],
          selectedGameId: stored.gameIds[0],
          updatedAt: expect.any(String),
        },
      },
      { returnDocument: "after", projection: { _id: 0 } },
    );
  });
});
