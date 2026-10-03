import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardGamesRepository } from "@/app/lib/boardGames.repository";
import { getDb } from "@/app/lib/db";
import { migrate } from "@/app/lib/migrate";
import { OPTIONS, POST } from "../route";

const mocks = vi.hoisted(() => ({
  listCollections: vi.fn(() => ({
    toArray: async () => [{ name: "users" }, { name: "boardGames" }],
  })),
  dropCollection: vi.fn(async (_name: string) => true),
  bulkUpsert: vi.fn(async () => 1),
  findUser: vi.fn(async (): Promise<{ clerkId: string } | null> => ({ clerkId: "user_1" })),
  stageBgg: vi.fn(async () => "snapshot"),
  publishBgg: vi.fn(async () => undefined),
}));
vi.mock("@/app/lib/db", () => ({
  COLLECTIONS: { USERS: "users" },
  getDb: vi.fn(async () => ({
    listCollections: mocks.listCollections,
    collection: (name: string) => ({
      drop: () => mocks.dropCollection(name),
      findOne: mocks.findUser,
    }),
  })),
}));
vi.mock("@/app/lib/bgg-account.repository", () => ({
  BggAccountRepository: vi
    .fn()
    .mockImplementation(() => ({ stage: mocks.stageBgg, publish: mocks.publishBgg })),
}));
vi.mock("@/app/lib/migrate", () => ({ migrate: vi.fn(async () => ({})) }));
vi.mock("@/app/lib/boardGames.repository", () => ({
  BoardGamesRepository: vi.fn().mockImplementation(() => ({ bulkUpsert: mocks.bulkUpsert })),
}));

const url = "http://localhost/api/admin/ci-db";
const body = (action: string, databaseName = "bgo_ci_12_1", userId?: string) =>
  JSON.stringify({ action, databaseName, userId });
const request = (payload: string, auth = "Bearer sk_test_ci") =>
  new Request(url, { method: "POST", headers: { authorization: auth }, body: payload });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_SECRET_KEY = "sk_test_ci";
  process.env.MONGODB_DB_NAME = "bgo_ci_12_1";
});

describe("POST /api/admin/ci-db", () => {
  it("rejects requests without admin authorization", async () => {
    expect((await POST(request(body("cleanup"), "Bearer wrong"))).status).toBe(401);
    delete process.env.CLERK_SECRET_KEY;
    expect((await POST(request(body("cleanup")))).status).toBe(401);
    expect(getDb).not.toHaveBeenCalled();
  });

  it.each([
    ["cleanup", "bgo_dev"],
    ["cleanup", "bgo_ci_99_1"],
    ["cleanup", "bgo_ci_0_1"],
    ["unknown", "bgo_ci_12_1"],
  ])("rejects %s for %s without accessing MongoDB", async (action, databaseName) => {
    expect((await POST(request(body(action, databaseName)))).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and non-CI runtime databases", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    process.env.MONGODB_DB_NAME = "bgo_dev";
    expect((await POST(request(body("cleanup")))).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("seeds only its own database with indexes and Cascadia", async () => {
    const res = await POST(request(body("seed")));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.dropCollection).not.toHaveBeenCalled();
    expect(migrate).toHaveBeenCalledWith(
      expect.objectContaining({ listCollections: mocks.listCollections }),
    );
    expect(BoardGamesRepository).toHaveBeenCalledWith(
      expect.objectContaining({ listCollections: mocks.listCollections }),
    );
    expect(mocks.bulkUpsert).toHaveBeenCalledWith([
      {
        id: 295947,
        name: "Cascadia",
        yearPublished: 2021,
        bayesAverage: 7.65789,
        average: 7.83,
        rank: 42,
        isExpansion: false,
      },
    ]);
  });

  it("seeds BGG collection only for a mirrored CI user", async () => {
    expect((await POST(request(body("seed-bgg")))).status).toBe(400);
    mocks.findUser.mockResolvedValueOnce(null);
    expect((await POST(request(body("seed-bgg", "bgo_ci_12_1", "missing")))).status).toBe(400);
    expect(mocks.stageBgg).not.toHaveBeenCalled();
    expect((await POST(request(body("seed-bgg", "bgo_ci_12_1", "user_1")))).status).toBe(200);
    expect(mocks.stageBgg).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ username: "bgg-e2e" }),
    );
    expect(mocks.publishBgg).toHaveBeenCalledWith(
      "user_1",
      "snapshot",
      expect.objectContaining({ username: "bgg-e2e" }),
      [expect.objectContaining({ gameId: 295947, name: "Cascadia", userId: "user_1" })],
    );
  });

  it("removes every collection in its own database without reseeding", async () => {
    const res = await POST(request(body("cleanup")));
    expect(res.status).toBe(200);
    expect(mocks.listCollections).toHaveBeenCalledWith({}, { nameOnly: true });
    expect(mocks.dropCollection.mock.calls.map(([name]) => name)).toEqual(["users", "boardGames"]);
    expect(migrate).not.toHaveBeenCalled();
  });

  it("treats cleanup of an empty CI database as success", async () => {
    mocks.listCollections.mockReturnValueOnce({ toArray: async () => [] });
    expect((await POST(request(body("cleanup")))).status).toBe(200);
    expect(mocks.dropCollection).not.toHaveBeenCalled();
  });

  it("handles preflight", () => {
    expect(OPTIONS(new Request(url)).status).toBe(204);
  });
});
