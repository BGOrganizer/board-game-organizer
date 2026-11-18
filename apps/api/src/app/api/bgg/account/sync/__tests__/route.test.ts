import type {
  BggAccount,
  BggAccountResponse,
  BggCollectionGame,
} from "@board-game-organizer/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PendingAccount = NonNullable<BggAccount["pending"]>;

const mocks = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null }>>(),
  getDb: vi.fn(async () => ({})),
  pending: vi.fn<(userId: string) => Promise<PendingAccount | null>>(),
  get: vi.fn<(userId: string) => Promise<BggAccountResponse>>(),
  restart: vi.fn(async (_userId: string, _snapshot: string) => ({ modifiedCount: 1 })),
  claim: vi.fn<(userId: string, snapshot: string) => Promise<object | null>>(),
  publish: vi.fn(
    async (
      _userId: string,
      _snapshot: string,
      _identity: PendingAccount,
      _games: Omit<BggCollectionGame, "_id">[],
    ) => undefined,
  ),
  queued: vi.fn(async (_userId: string, _snapshot: string, _wait: number) => undefined),
  failed: vi.fn(async (_userId: string, _snapshot: string) => undefined),
  fetchCollection:
    vi.fn<
      (
        username: string,
        userId: string,
        snapshot: string,
      ) => Promise<Omit<BggCollectionGame, "_id">[]>
    >(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/app/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/app/lib/games/bgg-account.repository", () => ({
  BggAccountRepository: class {
    get = mocks.get;
    pending = mocks.pending;
    restart = mocks.restart;
    claim = mocks.claim;
    publish = mocks.publish;
    queued = mocks.queued;
    failed = mocks.failed;
  },
}));
vi.mock("@/app/lib/games/bgg-collection", async (load) => ({
  ...(await load<typeof import("@/app/lib/games/bgg-collection")>()),
  fetchBggCollection: mocks.fetchCollection,
}));

import { OPTIONS, POST } from "../route";

const now = new Date("2030-06-12T10:00:00.000Z");
const pending: PendingAccount = {
  id: 42,
  username: "alice",
  avatarUrl: null,
  snapshot: "pending-snapshot",
  status: "syncing",
  attempts: 0,
};
const account: BggAccountResponse = {
  active: {
    id: 41,
    username: "previous-account",
    avatarUrl: null,
    snapshot: "published-snapshot",
    syncedAt: "2030-06-11T10:00:00.000Z",
  },
  pending: {
    id: 42,
    username: "alice",
    avatarUrl: null,
    status: "syncing",
    nextAttemptAt: null,
    error: null,
  },
};
const origin = "https://collection-preview.vercel.app";
const request = (query = "") =>
  new Request(`https://api.test/api/bgg/account/sync${query}`, {
    method: "POST",
    headers: { origin },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  mocks.auth.mockResolvedValue({ userId: "viewer" });
  mocks.pending.mockResolvedValue(pending);
  mocks.get.mockResolvedValue(account);
  mocks.claim.mockResolvedValue({ userId: "viewer" });
  mocks.fetchCollection.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

async function expectUnchangedAccount(response: Response) {
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(account);
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith("viewer");
  expect(mocks.fetchCollection).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.queued).not.toHaveBeenCalled();
  expect(mocks.failed).not.toHaveBeenCalled();
}

describe("POST /api/bgg/account/sync lease and retry route units", () => {
  it("returns a conflict when no sync is pending without fetching or replacing active data", async () => {
    mocks.pending.mockResolvedValueOnce(null);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "No BGG sync pending" });
    expect(mocks.pending).toHaveBeenCalledExactlyOnceWith("viewer");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.fetchCollection).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each(["", "?retry=false", "?retry=TRUE"])(
    "keeps a failed snapshot untouched without an explicit retry=true (%s)",
    async (query) => {
      mocks.pending.mockResolvedValueOnce({ ...pending, status: "failed" });
      await expectUnchangedAccount(await POST(request(query)));
      expect(mocks.restart).not.toHaveBeenCalled();
      expect(mocks.claim).not.toHaveBeenCalled();
    },
  );

  it("returns current state if the failed snapshot disappears while restarting", async () => {
    mocks.pending
      .mockResolvedValueOnce({ ...pending, status: "failed" })
      .mockResolvedValueOnce(null);
    await expectUnchangedAccount(await POST(request("?retry=true")));
    expect(mocks.restart).toHaveBeenCalledExactlyOnceWith("viewer", pending.snapshot);
    expect(mocks.pending).toHaveBeenCalledTimes(2);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("respects a future next-attempt time without taking the collection lease", async () => {
    mocks.pending.mockResolvedValueOnce({
      ...pending,
      nextAttemptAt: new Date(now.getTime() + 60_000),
    });
    await expectUnchangedAccount(await POST(request()));
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.restart).not.toHaveBeenCalled();
  });

  it("returns the current snapshot when another request owns its lease", async () => {
    mocks.claim.mockResolvedValueOnce(null);
    await expectUnchangedAccount(await POST(request()));
    expect(mocks.claim).toHaveBeenCalledExactlyOnceWith("viewer", pending.snapshot);
    expect(mocks.restart).not.toHaveBeenCalled();
  });

  it.each([-1, 0])(
    "claims a queued snapshot when its retry time has elapsed (%s ms)",
    async (offset) => {
      const due = { ...pending, nextAttemptAt: new Date(now.getTime() + offset) };
      mocks.pending.mockResolvedValueOnce(due);
      const response = await POST(request());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(account);
      expect(mocks.claim).toHaveBeenCalledExactlyOnceWith("viewer", due.snapshot);
      expect(mocks.fetchCollection).toHaveBeenCalledExactlyOnceWith(
        "alice",
        "viewer",
        due.snapshot,
      );
      expect(mocks.publish).toHaveBeenCalledExactlyOnceWith("viewer", due.snapshot, due, []);
    },
  );

  it("uses the authoritative snapshot read after restart instead of fetching the stale failed identity", async () => {
    const replacement: PendingAccount = {
      ...pending,
      id: 43,
      username: "replacement",
      snapshot: "replacement-snapshot",
    };
    mocks.pending
      .mockResolvedValueOnce({ ...pending, status: "failed" })
      .mockResolvedValueOnce(replacement);
    const response = await POST(request("?retry=true"));
    expect(response.status).toBe(200);
    expect(mocks.restart).toHaveBeenCalledExactlyOnceWith("viewer", pending.snapshot);
    expect(mocks.claim).toHaveBeenCalledExactlyOnceWith("viewer", replacement.snapshot);
    expect(mocks.fetchCollection).toHaveBeenCalledExactlyOnceWith(
      "replacement",
      "viewer",
      replacement.snapshot,
    );
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith(
      "viewer",
      replacement.snapshot,
      replacement,
      [],
    );
    expect(mocks.failed).not.toHaveBeenCalled();
  });

  it("propagates lease-storage failure rather than starting an unleased provider request", async () => {
    const failure = new Error("Lease storage unavailable");
    mocks.claim.mockRejectedValueOnce(failure);
    await expect(POST(request())).rejects.toBe(failure);
    expect(mocks.fetchCollection).not.toHaveBeenCalled();
    expect(mocks.failed).not.toHaveBeenCalled();
  });

  it("exposes preflight without claiming a sync or fetching provider data", () => {
    const response = OPTIONS(
      new Request("https://api.test/api/bgg/account/sync", {
        method: "OPTIONS",
        headers: { origin },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.fetchCollection).not.toHaveBeenCalled();
  });
});
