import { describe, expect, it, vi } from "vitest";
import { MatchesRepository } from "@/app/lib/matches.repository";

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
  it("creates a PLANNING match with generated id and timestamps", async () => {
    const { db, collection } = setup();
    const match = await new MatchesRepository(db as never).create(input);
    expect(match).toMatchObject({ ...input, status: "PLANNING" });
    expect(match.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(match.createdAt).toBe(match.updatedAt);
    expect(collection.insertOne).toHaveBeenCalledWith(match, {});
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
      { $or: [{ clerkId: "user_1" }, { id: { $in: ["match_2"] } }] },
      { projection: { _id: 0 } },
    );
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(matches[0]).toMatchObject({ status: "CREATED", updatedAt: stored.updatedAt });
    expect(matches[1]).toMatchObject({ status: "PLANNING", updatedAt: stored.createdAt });
    expect(matches[1]).not.toHaveProperty("invitedUserIds");
  });

  it("finds and normalizes a match by id", async () => {
    const { db, collection } = setup([], stored);
    await expect(new MatchesRepository(db as never).findById(stored.id)).resolves.toMatchObject({
      id: stored.id,
      status: "CREATED",
    });
    expect(collection.findOne).toHaveBeenCalledWith({ id: stored.id }, { projection: { _id: 0 } });
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
    ).resolves.toEqual(updated);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: stored.id, clerkId: "user_1", status: "PLANNING" },
      { $set: { ...changes, updatedAt: expect.any(String) } },
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

  it("deletes only a match owned by admin", async () => {
    const { db, collection } = setup();
    await new MatchesRepository(db as never).deleteById(stored.id, "user_1");
    expect(collection.deleteOne).toHaveBeenCalledWith({ id: stored.id, clerkId: "user_1" }, {});
  });

  it("updates match status and timestamp", async () => {
    const { db, collection } = setup();
    await new MatchesRepository(db as never).setStatus(stored.id, "CREATED");
    expect(collection.updateOne).toHaveBeenCalledWith(
      { id: stored.id },
      { $set: { status: "CREATED", updatedAt: expect.any(String) } },
      {},
    );
  });
});
