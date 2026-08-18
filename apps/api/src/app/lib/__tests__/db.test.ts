import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const connectMock = vi.fn();
  const dbMock = vi.fn();
  const sessionWithTransactionMock = vi.fn();
  const endSessionMock = vi.fn();
  const startSessionMock = vi.fn(() => ({
    withTransaction: sessionWithTransactionMock,
    endSession: endSessionMock,
  }));
  const MongoClientMock = vi.fn(() => ({
    connect: connectMock,
    db: dbMock,
    startSession: startSessionMock,
  }));
  return {
    MongoClientMock,
    connectMock,
    dbMock,
    startSessionMock,
    sessionWithTransactionMock,
    endSessionMock,
  };
});

vi.mock("mongodb", () => ({
  MongoClient: mocks.MongoClientMock,
}));

describe("db", () => {
  afterEach(() => {
    vi.resetModules();
    mocks.MongoClientMock.mockClear();
    mocks.connectMock.mockClear();
    mocks.dbMock.mockClear();
    mocks.startSessionMock.mockClear();
    mocks.sessionWithTransactionMock.mockClear();
    mocks.endSessionMock.mockClear();
    delete process.env.MONGODB_URI;
    delete process.env.MONGODB_DB_NAME;
  });

  it("exposes the relationships collection name", async () => {
    const { COLLECTIONS } = await import("../db");
    expect(COLLECTIONS.RELATIONSHIPS).toBe("relationships");
  });

  it("getDb connects once and returns the configured database", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "bgo_test";
    mocks.dbMock.mockReturnValue("db-instance");

    const { getDb } = await import("../db");
    const db = await getDb();
    await getDb(); // second call reuses the singleton client

    expect(mocks.connectMock).toHaveBeenCalledTimes(1);
    expect(mocks.dbMock).toHaveBeenCalledWith("bgo_test");
    expect(db).toBe("db-instance");
  });

  it("withTransaction runs the callback inside a session transaction", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "bgo_test";
    mocks.sessionWithTransactionMock.mockImplementation(async (fn: () => unknown) => fn());

    const { withTransaction } = await import("../db");
    const fn = vi.fn().mockResolvedValue("result");
    const result = await withTransaction(fn);

    expect(mocks.startSessionMock).toHaveBeenCalledTimes(1);
    expect(mocks.sessionWithTransactionMock).toHaveBeenCalledTimes(1);
    expect(mocks.endSessionMock).toHaveBeenCalledTimes(1);
    expect(result).toBe("result");
  });

  it("withTransaction ends the session when the callback throws", async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017";
    process.env.MONGODB_DB_NAME = "bgo_test";
    mocks.sessionWithTransactionMock.mockImplementation(async () => {
      throw new Error("boom");
    });

    const { withTransaction } = await import("../db");
    await expect(withTransaction(vi.fn())).rejects.toThrow("boom");
    expect(mocks.endSessionMock).toHaveBeenCalledTimes(1);
  });
});
