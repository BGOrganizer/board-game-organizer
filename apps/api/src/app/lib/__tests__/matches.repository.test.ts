import { createMatchSchema } from "@board-game-organizer/schemas";
import { describe, expect, it, vi } from "vitest";
import { MatchesRepository } from "@/app/lib/matches.repository";

const dbMock = { collection: vi.fn() };
const colMock = {
  insertOne: vi.fn(async (doc: unknown) => ({ insertedId: "id" })),
  findOne: vi.fn(async () => null),
  find: vi.fn(() => ({
    sort: vi.fn(() => ({ toArray: async () => [] })),
  })),
};
dbMock.collection.mockReturnValue(colMock);

function repo() {
  return new MatchesRepository(dbMock as never);
}

describe("MatchesRepository", () => {
  it("creates a match with id, owner and timestamps", async () => {
    const m = await repo().create({
      clerkId: "user_1",
      name: "Friday night games",
      dates: ["2026-09-05T20:00:00.000Z"],
      minPlayers: 3,
      maxPlayers: 5,
      invitedUserIds: ["user_2"],
      gameIds: [342942],
    });
    expect(m.id).toBeTruthy();
    expect(m.clerkId).toBe("user_1");
    expect(m.createdAt).toBeTruthy();
    expect(colMock.insertOne).toHaveBeenCalledWith(m);
  });

  it("lists matches owned by a user, newest first", async () => {
    colMock.find.mockReturnValueOnce({
      sort: vi.fn(() => ({ toArray: async () => [{ id: "m1", clerkId: "user_1" }] })),
    });
    const rows = await repo().listByOwner("user_1");
    expect(rows).toHaveLength(1);
    expect(colMock.find).toHaveBeenCalledWith(
      { clerkId: "user_1" },
      expect.objectContaining({ projection: { _id: 0 } }),
    );
  });
});

describe("createMatchSchema", () => {
  const base = {
    name: "Game night",
    dates: ["2026-09-05T20:00:00.000Z"],
    minPlayers: 2,
    maxPlayers: 4,
    invitedUserIds: [],
    gameIds: [342942],
  };

  it("accepts a valid payload", () => {
    expect(createMatchSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a name shorter than 5 chars", () => {
    const r = createMatchSchema.safeParse({ ...base, name: "Game" });
    expect(r.success).toBe(false);
  });

  it("rejects zero dates", () => {
    const r = createMatchSchema.safeParse({ ...base, dates: [] });
    expect(r.success).toBe(false);
  });

  it("rejects minPlayers < 1", () => {
    const r = createMatchSchema.safeParse({ ...base, minPlayers: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects zero games", () => {
    const r = createMatchSchema.safeParse({ ...base, gameIds: [] });
    expect(r.success).toBe(false);
  });
});
