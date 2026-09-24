import { beforeEach, describe, expect, it, vi } from "vitest";
import { BoardGamesRepository } from "@/app/lib/boardGames.repository";
import { getDb } from "@/app/lib/db";
import { migrate } from "@/app/lib/migrate";
import { OPTIONS, POST } from "../route";

const mocks = vi.hoisted(() => ({
  dropDatabase: vi.fn(async () => true),
  bulkUpsert: vi.fn(async () => 1),
}));
vi.mock("@/app/lib/db", () => ({
  getDb: vi.fn(async () => ({ dropDatabase: mocks.dropDatabase })),
}));
vi.mock("@/app/lib/migrate", () => ({ migrate: vi.fn(async () => ({})) }));
vi.mock("@/app/lib/boardGames.repository", () => ({
  BoardGamesRepository: vi.fn().mockImplementation(() => ({ bulkUpsert: mocks.bulkUpsert })),
}));

const url = "http://localhost/api/admin/ci-db";
const body = (action: string, databaseName = "bgo_ci_12_1") =>
  JSON.stringify({ action, databaseName });
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
    expect(mocks.dropDatabase).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledWith(
      expect.objectContaining({ dropDatabase: mocks.dropDatabase }),
    );
    expect(BoardGamesRepository).toHaveBeenCalledWith(
      expect.objectContaining({ dropDatabase: mocks.dropDatabase }),
    );
    expect(mocks.bulkUpsert).toHaveBeenCalledWith([
      { id: 295947, name: "Cascadia", yearPublished: 2021 },
    ]);
  });

  it("drops only its own database without reseeding", async () => {
    const res = await POST(request(body("cleanup")));
    expect(res.status).toBe(200);
    expect(mocks.dropDatabase).toHaveBeenCalledTimes(1);
    expect(migrate).not.toHaveBeenCalled();
  });

  it("handles preflight", () => {
    expect(OPTIONS(new Request(url)).status).toBe(204);
  });
});
