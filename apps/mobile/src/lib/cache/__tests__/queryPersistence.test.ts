import { CommunityApiError } from "@board-game-organizer/shared";
import { hashKey, hydrate, InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginOptimisticOperation,
  clearSessionQueryCache,
} from "../../../../../../packages/shared/src/common/optimisticOperation";
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE,
  CACHE_MAX_BYTES,
  configureMobileCache,
  createSessionPersister,
  decodeCache,
  ownsPersistedQuery,
  restoreSessionCache,
} from "../queryPersistence";

const owner = { apiUrl: "https://api.test", userId: "user-a" };
const key = ["events", owner.apiUrl, owner.userId, "tables", null];
const clients: QueryClient[] = [];
function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const data = new Map<string, string>();
  const storage = {
    getString: vi.fn((k: string) => data.get(k)),
    set: vi.fn((k: string, v: string) => {
      data.set(k, v);
    }),
    remove: vi.fn((k: string) => data.delete(k)),
  };
  const error = vi.fn();
  const persister = createSessionPersister(client, owner, storage, error);
  return { client, data, storage, error, persister };
}
afterEach(() => {
  for (const c of clients.splice(0)) clearSessionQueryCache(c);
  vi.restoreAllMocks();
});

describe("account-owned canonical persistence", () => {
  it.each([
    "events",
    "groups",
    "notifications",
    "notification-attention",
    "profile",
    "favoriteLocations",
    "bgg-account",
    "bgg-picker",
  ])("allows only the current API/user for %s", (family) => {
    expect(ownsPersistedQuery([family, owner.apiUrl, owner.userId], owner)).toBe(true);
    expect(ownsPersistedQuery([family, owner.apiUrl, "user-b"], owner)).toBe(false);
    expect(ownsPersistedQuery([family, "other-api", owner.userId], owner)).toBe(false);
  });
  it("excludes local contacts, credentials, providers, retired domains and foreign contacts", () => {
    expect(ownsPersistedQuery(["contacts", "friends", owner.apiUrl, owner.userId], owner)).toBe(
      true,
    );
    for (const candidate of [
      ["contacts", "friends", owner.apiUrl, "other"],
      ["contacts", "friends", "other", owner.userId],
      ["device-contacts", owner.apiUrl, owner.userId],
      ["contact-sync", owner.apiUrl, owner.userId],
      ["locations", "reverse", owner.apiUrl, owner.userId],
      ["tokens", owner.apiUrl, owner.userId],
      ["matches", owner.apiUrl, owner.userId],
    ])
      expect(ownsPersistedQuery(candidate, owner)).toBe(false);
  });
  it("retires old private activity snapshots selectively while retaining owned network pages and unrelated datasets", () => {
    const old = ["profile", owner.apiUrl, owner.userId, "activities", "subject", null, 5],
      current = ["profile", owner.apiUrl, owner.userId, "network", "all", "public-v1"],
      now = Date.now();
    expect(ownsPersistedQuery(old, owner)).toBe(false);
    expect(ownsPersistedQuery(current, owner)).toBe(true);
    const snapshot = decodeCache(
      JSON.stringify({
        buster: CACHE_BUSTER,
        timestamp: now,
        clientState: {
          mutations: [],
          queries: [old, current, key].map((queryKey) => ({
            queryKey,
            state: { data: { pages: [] }, dataUpdatedAt: now },
          })),
        },
      }),
      owner,
      now,
    );
    expect(snapshot?.clientState.queries.map((q) => q.queryKey)).toEqual([current, key]);
    const f = fixture();
    f.client.setQueryData(current, { pages: [{ items: [{ id: "authorized" }] }] });
    f.client.setQueryData(old, { pages: [{ items: [{ id: "NEVER_PRIVATE" }] }] });
    f.persister.flush();
    expect(f.data.get("queries")).toContain("authorized");
    expect(f.data.get("queries")).not.toContain("NEVER_PRIVATE");
  });
  it("saves pages, restores stale data without mutations, and preserves canonical timestamps inside DTOs", () => {
    const a = fixture();
    const pages = {
      pages: [
        { items: [{ id: "server-id", changedAt: "2026-01-01" }], nextCursor: "next" },
        { items: [], nextCursor: null },
      ],
      pageParams: ["", "next"],
    };
    a.client.setQueryData(key, pages);
    a.client.setQueryData(["contact-sync", owner.apiUrl, owner.userId], {
      submitted: ["private-phone"],
    });
    a.client.getMutationCache().build(a.client, { mutationKey: ["secret-body"] });
    a.persister.flush();
    const serialized = a.data.get("queries")!;
    expect(serialized).not.toContain("private-phone");
    expect(serialized).not.toContain("secret-body");
    const restored = a.persister.restoreClient()!;
    const b = fixture();
    b.client.getQueryCache().build(b.client, { queryKey: key }); // Already-mounted restoring observer.
    hydrate(b.client, restored.clientState);
    expect(b.client.getQueryData(key)).toEqual(pages);
    expect(b.client.getQueryState(key)).toMatchObject({
      dataUpdatedAt: a.client.getQueryState(key)!.dataUpdatedAt,
      fetchStatus: "idle",
      isInvalidated: true,
    });
    expect(b.client.getMutationCache().getAll()).toEqual([]);
  });
  it("revalidates even a recent restored snapshot without falsifying its timestamp", async () => {
    const f = fixture();
    f.client.setQueryData(key, { id: "old" });
    const updatedAt = f.client.getQueryState(key)!.dataUpdatedAt;
    f.persister.flush();
    const saved = f.persister.restoreClient()!;
    f.client.clear();
    restoreSessionCache(f.client, saved, new Set());
    expect(f.client.getQueryState(key)!.dataUpdatedAt).toBe(updatedAt);
    const queryFn = vi.fn(async () => ({ id: "server" }));
    await f.client.prefetchQuery({ queryKey: key, queryFn, staleTime: 600_000 });
    expect(queryFn).toHaveBeenCalledOnce();
    expect(f.client.getQueryData(key)).toEqual({ id: "server" });
  });
  it("late restore preserves newer data, deletion/denial and observable offline errors", async () => {
    const f = fixture();
    const offline = [...key, "offline"],
      denied = [...key, "denied"],
      deleted = [...key, "deleted"],
      untouched = [...key, "untouched"];
    for (const k of [key, offline, denied, deleted, untouched])
      f.client.setQueryData(k, { id: "old" }, { updatedAt: Date.now() - 1000 });
    f.persister.flush();
    const saved = f.persister.restoreClient()!;
    f.client.clear();
    f.client.setQueryData(key, { id: "new" }, { updatedAt: Date.now() });
    for (const [k, error] of [
      [offline, new Error("offline")],
      [denied, new CommunityApiError(403, "FORBIDDEN")],
    ] as const) {
      await expect(
        f.client.fetchQuery({
          queryKey: k,
          queryFn: async () => {
            throw error;
          },
        }),
      ).rejects.toThrow();
    }
    restoreSessionCache(f.client, saved, new Set([hashKey(deleted)]));
    expect(f.client.getQueryData(key)).toEqual({ id: "new" });
    expect(f.client.getQueryData(offline)).toEqual({ id: "old" });
    expect(f.client.getQueryState(offline)).toMatchObject({
      status: "error",
      error: new Error("offline"),
    });
    expect(f.client.getQueryData(denied)).toBeUndefined();
    expect(f.client.getQueryData(deleted)).toBeUndefined();
    expect(f.client.getQueryData(untouched)).toEqual({ id: "old" });
  });
  it("never stores pending/uncertain overlays; persists disjoint confirmed changes and rollback", async () => {
    const f = fixture();
    f.client.setQueryData(key, { a: false, b: false });
    const a = await beginOptimisticOperation(
      f.client,
      [...key, "a"],
      { queryKey: key },
      (data) => ({ ...(data as object), a: true }),
    );
    const b = await beginOptimisticOperation(
      f.client,
      [...key, "b"],
      { queryKey: key },
      (data) => ({ ...(data as object), b: true }),
    );
    const disk = () => f.persister.restoreClient()!.clientState.queries[0].state.data;
    f.persister.flush();
    expect(disk()).toEqual({ a: false, b: false });
    b.commit();
    f.persister.flush();
    expect(f.client.getQueryData(key)).toEqual({ a: true, b: true });
    expect(disk()).toEqual({ a: false, b: true });
    a.rollback();
    f.persister.flush();
    expect(disk()).toEqual({ a: false, b: true });
  });
  it("excludes a projected entry with no authoritative base", async () => {
    const f = fixture();
    f.client.getQueryCache().build(f.client, { queryKey: key });
    const operation = await beginOptimisticOperation(f.client, key, { queryKey: key }, () => ({
      optimisticOnly: true,
    }));
    expect(f.client.getQueryData(key)).toEqual({ optimisticOnly: true });
    // A manual publication may mark its projection recently updated; that is still not a server base.
    f.client.setQueryData(key, { optimisticOnly: true });
    f.persister.flush();
    expect(f.persister.restoreClient()!.clientState.queries).toEqual([]);
    operation.rollback();
  });
  it("retains last good data on transport failure, removes newly denied and deleted data", async () => {
    const f = fixture();
    f.client.setQueryData(key, { id: "old" });
    await expect(
      f.client.fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow("offline");
    f.persister.flush();
    expect(f.persister.restoreClient()!.clientState.queries).toHaveLength(1);
    await expect(
      f.client.fetchQuery({
        queryKey: key,
        queryFn: async () => {
          throw new CommunityApiError(403, "FORBIDDEN");
        },
      }),
    ).rejects.toThrow();
    f.persister.flush();
    expect(f.persister.restoreClient()!.clientState.queries).toHaveLength(0);
    f.client.setQueryData(key, { id: "fresh" });
    f.client.removeQueries({ queryKey: key });
    f.persister.flush();
    expect(f.persister.restoreClient()!.clientState.queries).toHaveLength(0);
  });
  it("coalesces same-turn notifications and stops queued, direct and late-response writes after logout", async () => {
    const f = fixture();
    f.persister.schedule();
    f.persister.schedule();
    await Promise.resolve();
    expect(f.storage.set).toHaveBeenCalledTimes(1);
    f.persister.schedule();
    f.persister.stop();
    f.client.setQueryData(key, { id: "late" });
    f.persister.flush();
    f.persister.schedule();
    f.persister.removeClient();
    await Promise.resolve();
    expect(f.storage.set).toHaveBeenCalledTimes(1);
    expect(f.persister.restoreClient()).toBeUndefined();
  });
  it("handles missing, malformed, incompatible, expired, foreign and oversized snapshots without hydrating", () => {
    const f = fixture();
    expect(f.persister.restoreClient()).toBeUndefined();
    for (const value of [
      "{",
      "null",
      "{}",
      JSON.stringify({ buster: "old" }),
      "x".repeat(CACHE_MAX_BYTES),
    ]) {
      f.data.set("queries", value);
      expect(f.persister.restoreClient()).toBeUndefined();
      expect(f.data.has("queries")).toBe(false);
    }
    expect(f.error).toHaveBeenCalled();
    f.client.setQueryData(key, {});
    f.persister.flush();
    const valid = JSON.parse(f.data.get("queries")!);
    for (const changed of [
      { ...valid, timestamp: 0 },
      { ...valid, timestamp: "now" },
      { ...valid, timestamp: Date.now() + 60_000 },
      { ...valid, timestamp: Date.now() - CACHE_MAX_AGE - 1 },
      { ...valid, clientState: { queries: {} } },
      { ...valid, clientState: { queries: [null] } },
      {
        ...valid,
        clientState: {
          queries: [{ queryKey: ["events", owner.apiUrl, "foreign"], state: { data: {} } }],
        },
      },
    ])
      expect(decodeCache(JSON.stringify(changed), owner)).toBeUndefined();
    expect(valid.buster).toBe(CACHE_BUSTER);
  });
  it("reports storage errors and keeps memory usable", () => {
    const f = fixture();
    f.storage.set.mockImplementation(() => {
      throw new Error("disk full");
    });
    f.client.setQueryData(key, { id: "good" });
    f.persister.flush();
    expect(f.error).toHaveBeenCalledOnce();
    expect(f.client.getQueryData(key)).toEqual({ id: "good" });
    f.storage.getString.mockImplementation(() => {
      throw new Error("read");
    });
    f.storage.remove.mockImplementation(() => {
      throw new Error("delete");
    });
    expect(f.persister.restoreClient()).toBeUndefined();
  });
  it("expires individual old entries even when other queries keep the snapshot recent", () => {
    const f = fixture();
    f.client.setQueryData(key, { id: "expired" }, { updatedAt: Date.now() - CACHE_MAX_AGE - 1 });
    f.persister.flush();
    expect(f.persister.restoreClient()!.clientState.queries).toEqual([]);
    f.client.setQueryData(key, { id: "fresh" });
    f.persister.flush();
    const saved = JSON.parse(f.data.get("queries")!);
    saved.clientState.queries[0].state.dataUpdatedAt = Date.now() - CACHE_MAX_AGE - 1;
    expect(decodeCache(JSON.stringify(saved), owner)!.clientState.queries).toEqual([]);
    saved.clientState.queries = Array(201).fill(saved.clientState.queries[0]);
    expect(decodeCache(JSON.stringify(saved), owner)).toBeUndefined();
  });
  it("bounds serialized cache size", () => {
    const f = fixture();
    f.client.setQueryData(key, "x".repeat(CACHE_MAX_BYTES));
    f.persister.flush();
    expect(f.data.get("queries")?.length ?? 0).toBeLessThan(CACHE_MAX_BYTES);
  });
  it("evicts old queries above the 200-entry budget", () => {
    const f = fixture();
    for (let i = 0; i < 201; i++)
      f.client.setQueryData([...key, i], { id: i }, { updatedAt: Date.now() - 1000 + i });
    f.persister.flush();
    const rows = f.persister.restoreClient()!.clientState.queries;
    expect(rows).toHaveLength(200);
    expect(rows.some((row) => row.queryKey.at(-1) === 0)).toBe(false);
  });
  it("native GC overrides factories and refetches one page, not every restored page", async () => {
    const f = fixture();
    const stop = configureMobileCache(f.client, owner);
    const fn = vi.fn(async ({ pageParam }: { pageParam: number }) => ({
      items: [pageParam],
      nextCursor: pageParam + 1,
    }));
    f.client.setQueryData(key, {
      pages: [
        { items: [1], nextCursor: 2 },
        { items: [2], nextCursor: 3 },
      ],
      pageParams: [0, 2],
    });
    const observer = new InfiniteQueryObserver(f.client, {
      queryKey: key,
      queryFn: fn,
      initialPageParam: 0,
      getNextPageParam: (page) => page.nextCursor,
      gcTime: 30 * 60_000,
      enabled: false,
    });
    await observer.refetch();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(observer.getCurrentResult().data?.pages).toHaveLength(1);
    expect(f.client.getQueryCache().find({ queryKey: key })!.gcTime).toBeGreaterThanOrEqual(
      CACHE_MAX_AGE,
    );
    await observer.fetchNextPage();
    expect(observer.getCurrentResult().data?.pages).toHaveLength(2);
    observer.destroy();
    stop();
  });
});
