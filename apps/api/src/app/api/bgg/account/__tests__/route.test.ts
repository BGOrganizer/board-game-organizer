import { beforeEach, describe, expect, it, vi } from "vitest";
import { BggRemoteError } from "@/app/lib/games/bgg-collection";
import { DELETE, GET, POST } from "../route";
import { POST as SYNC } from "../sync/route";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "clerk-user" as string | null })),
  getDb: vi.fn(async () => ({})),
  get: vi.fn(async () => ({ active: null, pending: null })),
  stage: vi.fn(async () => "snapshot"),
  unlink: vi.fn(async () => undefined),
  pending: vi.fn(async () => ({
    id: 42,
    username: "alice",
    avatarUrl: null,
    snapshot: "snap",
    status: "syncing",
    attempts: 0,
  })),
  restart: vi.fn(async () => ({ modifiedCount: 1 })),
  claim: vi.fn(async () => ({ userId: "clerk-user" })),
  publish: vi.fn(async () => undefined),
  queued: vi.fn(async () => undefined),
  failed: vi.fn(async () => undefined),
  fetchUser: vi.fn(
    async (): Promise<{ id: number; username: string; avatarUrl: string | null } | null> => ({
      id: 42,
      username: "alice",
      avatarUrl: null,
    }),
  ),
  fetchCollection: vi.fn(async () => []),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({
  getDb: mocks.getDb,
  withTransaction: (callback: (session: object, db: object) => Promise<unknown>) =>
    callback({ id: "session" }, {}),
}));
vi.mock("@/app/lib/games/bgg-account.repository", () => ({
  BggAccountRepository: vi.fn().mockImplementation(() => ({
    get: mocks.get,
    stage: mocks.stage,
    unlink: mocks.unlink,
    pending: mocks.pending,
    restart: mocks.restart,
    claim: mocks.claim,
    publish: mocks.publish,
    queued: mocks.queued,
    failed: mocks.failed,
  })),
}));
vi.mock("@/app/lib/games/bgg-collection", async (load) => ({
  ...(await load<typeof import("@/app/lib/games/bgg-collection")>()),
  fetchBggUser: mocks.fetchUser,
  fetchBggCollection: mocks.fetchCollection,
}));

const request = (method: string, input?: unknown) =>
  new Request("http://localhost/api/bgg/account", {
    method,
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "clerk-user" });
  mocks.fetchUser.mockResolvedValue({ id: 42, username: "alice", avatarUrl: null });
  mocks.pending.mockResolvedValue({
    id: 42,
    username: "alice",
    avatarUrl: null,
    snapshot: "snap",
    status: "syncing",
    attempts: 0,
  });
  mocks.claim.mockResolvedValue({ userId: "clerk-user" });
  mocks.fetchCollection.mockResolvedValue([]);
});

describe("BGG account endpoints", () => {
  it("requires Clerk authentication for all account operations", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await POST(request("POST", { username: "alice" }))).status).toBe(401);
    expect((await DELETE(request("DELETE"))).status).toBe(401);
    expect((await SYNC(request("POST"))).status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("validates username before changing link, preserves previous on BGG failure", async () => {
    expect((await POST(request("POST", {}))).status).toBe(400);
    expect((await POST(request("POST", { username: "" }))).status).toBe(400);
    mocks.fetchUser.mockResolvedValueOnce(null);
    expect((await POST(request("POST", { username: "missing" }))).status).toBe(404);
    mocks.fetchUser.mockRejectedValueOnce(new BggRemoteError("rate_limited"));
    expect((await POST(request("POST", { username: "alice" }))).status).toBe(503);
    expect(mocks.stage).not.toHaveBeenCalled();
    expect((await POST(request("POST", { username: " alice " }))).status).toBe(200);
    expect(mocks.fetchUser).toHaveBeenLastCalledWith("alice");
    expect(mocks.stage).toHaveBeenCalledWith("clerk-user", {
      id: 42,
      username: "alice",
      avatarUrl: null,
    });
  });

  it("reads only caller account and unlinks caller data", async () => {
    await GET(request("GET"));
    await DELETE(request("DELETE"));
    expect(mocks.get).toHaveBeenCalledWith("clerk-user");
    expect(mocks.unlink).toHaveBeenCalledWith("clerk-user", { id: "session" });
  });

  it("queues BGG 202 instead of publishing incomplete collection, then publishes success", async () => {
    mocks.fetchCollection.mockRejectedValueOnce(new BggRemoteError("rate_limited", 7000));
    expect((await SYNC(request("POST"))).status).toBe(200);
    expect(mocks.queued).toHaveBeenCalledWith("clerk-user", "snap", 7000);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect((await SYNC(request("POST"))).status).toBe(200);
    expect(mocks.publish).toHaveBeenCalledWith(
      "clerk-user",
      "snap",
      expect.objectContaining({ id: 42 }),
      [],
    );
  });

  it("marks failed collection without overwriting active data; retry restarts", async () => {
    mocks.fetchCollection.mockRejectedValueOnce(new BggRemoteError("unavailable"));
    await SYNC(request("POST"));
    expect(mocks.failed).toHaveBeenCalledWith("clerk-user", "snap");
    mocks.pending.mockResolvedValueOnce({
      id: 42,
      username: "alice",
      avatarUrl: null,
      snapshot: "snap",
      status: "failed",
      attempts: 0,
    });
    await SYNC(new Request("http://localhost/api/bgg/account/sync?retry=true", { method: "POST" }));
    expect(mocks.restart).toHaveBeenCalledWith("clerk-user", "snap");
  });
});
