import {
  CommunityApiError,
  eventProposalKeys,
  eventRecordQuery,
  optimisticProfileSocialData,
  projectProposalReview,
  revokeProposalReview,
} from "@board-game-organizer/shared";
import {
  hashKey,
  hydrate,
  InfiniteQueryObserver,
  isCancelledError,
  QueryClient,
} from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginOptimisticOperation,
  clearSessionQueryCache,
} from "../../../../../../packages/shared/src/common/optimisticOperation";
import { reconcilePersonalEventAccess } from "../../../../../../packages/shared/src/events/eventPersonalAccessCache";
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
    "bgg-collection",
  ])("allows only the current API/user for %s", (family) => {
    const suffix =
      family === "bgg-picker" ? ["", true, false, null, null, "sources-v2", false, null] : [];
    expect(ownsPersistedQuery([family, owner.apiUrl, owner.userId, ...suffix], owner)).toBe(true);
    expect(ownsPersistedQuery([family, owner.apiUrl, "user-b", ...suffix], owner)).toBe(false);
    expect(ownsPersistedQuery([family, "other-api", owner.userId, ...suffix], owner)).toBe(false);
  });
  it("round-trips canonical owned collection pages and purges their persisted payload on removal", () => {
    const f = fixture();
    const key = ["bgg-collection", owner.apiUrl, owner.userId, "snapshot", ""];
    const payload = {
      pages: [
        {
          snapshot: "snapshot",
          counts: { withoutExpansions: 1, withExpansions: 2, wishlist: 1 },
          items: [
            { id: 1, name: "Owned game", userRating: 8.5, wishlist: true, isExpansion: false },
            { id: 2, name: "Expansion", userRating: null, wishlist: false, isExpansion: true },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [""],
    };
    f.client.setQueryData(key, payload);
    f.persister.flush();
    expect(f.persister.restoreClient()?.clientState.queries[0]?.state.data).toEqual(payload);
    f.client.removeQueries({ queryKey: ["bgg-collection", owner.apiUrl, owner.userId] });
    f.persister.flush();
    expect(f.persister.restoreClient()?.clientState.queries).toHaveLength(0);
  });

  it("persists shared collection bases under the viewer, selectively rolls back a failed block and removes known-blocked disk payloads", async () => {
    const f = fixture(),
      target = [
        "bgg-collection",
        owner.apiUrl,
        owner.userId,
        "snapshot",
        "",
        "subject",
        "all",
        false,
        null,
      ],
      safe = [...target.slice(0, 5), "safe", "all", false, null];
    const payload = {
      pages: [
        {
          snapshot: "snapshot",
          items: [{ id: 1, name: "Subject private title" }],
          nextCursor: null,
        },
      ],
      pageParams: [""],
    };
    const other = {
      pages: [{ snapshot: "snapshot", items: [{ id: 2, name: "Other title" }], nextCursor: null }],
      pageParams: [""],
    };
    f.client.setQueryData(target, payload);
    f.client.setQueryData(safe, other);
    const variables = {
      targetUserId: "subject",
      targetUser: {
        id: "subject",
        name: "Subject",
        email: null,
        avatarUrl: null,
        presence: { online: false, lastActiveAt: "" },
      },
    };
    const start = () =>
      beginOptimisticOperation(
        f.client,
        ["contacts", owner.apiUrl, owner.userId, "subject"],
        { queryKey: target },
        (data, key) => optimisticProfileSocialData(key, data, "block", variables, owner.userId),
      );
    const first = await start();
    expect(f.client.getQueryData(target)).toBeNull();
    f.persister.flush();
    expect(f.data.get("queries")).toContain("Subject private title");
    await first.reject(new CommunityApiError(409, "CONFLICT"));
    expect(f.client.getQueryData(target)).toEqual(payload);
    const confirmed = await start();
    confirmed.commit();
    f.persister.flush();
    expect(f.data.get("queries")).not.toContain("Subject private title");
    expect(f.data.get("queries")).toContain("Other title");
    expect(f.client.getQueryData(safe)).toEqual(other);
    f.client.removeQueries({ queryKey: target, exact: true });
    f.persister.flush();
    expect(f.persister.restoreClient()?.clientState.queries.map((q) => q.queryKey)).toEqual([safe]);
  });
  it("persists canonical proposal bases only and purges manager-only disk data after verified demotion", async () => {
    const f = fixture(),
      scope = {
        eventId: "event",
        groupId: "group",
        kind: "date" as const,
        mode: "review" as const,
      };
    const review = eventProposalKeys.page(owner, scope),
      own = eventProposalKeys.page(owner, { ...scope, mode: "mine" });
    const row = {
      id: "proposal",
      eventId: "event",
      version: 1,
      status: "PENDING",
      label: "Private candidate",
    };
    const payload = {
      eventId: "event",
      groupId: "group",
      eventVersion: 1,
      mode: "review",
      items: [row],
      nextCursor: null,
    };
    f.client.setQueryData(review, payload);
    f.client.setQueryData(own, { ...payload, mode: "mine" });
    const operation = await beginOptimisticOperation(
      f.client,
      ["events", owner.apiUrl, owner.userId, "event", "write"],
      { queryKey: review },
      (data) => projectProposalReview(data, "event", "proposal", 1, 1, "accept"),
      [eventProposalKeys.reviewResource(owner, "event")],
    );
    expect(f.client.getQueryData<{ items: object[] }>(review)?.items[0]).toHaveProperty(
      "clientAction",
      "accept",
    );
    f.persister.flush();
    expect(f.data.get("queries")).not.toContain("clientAction");
    expect(f.persister.restoreClient()?.clientState.queries).toHaveLength(2);
    revokeProposalReview(f.client, owner, { groupId: "group" });
    f.persister.flush();
    expect(operation.signal.aborted).toBe(true);
    const saved = f.persister.restoreClient()?.clientState.queries;
    expect(saved).toHaveLength(1);
    expect(saved?.[0].queryKey).toEqual(own);
    expect(saved?.[0].state.data).toEqual({ ...payload, mode: "mine" });
  });
  it("purges manager-only pending participant identities from canonical disk cache on verified demotion", () => {
    const f = fixture();
    const review = [
      "events",
      owner.apiUrl,
      owner.userId,
      "participants",
      "event",
      "roles-v2",
      "review",
      "group",
    ];
    const member = [
      "events",
      owner.apiUrl,
      owner.userId,
      "participants",
      "event",
      "roles-v2",
      "member",
      null,
    ];
    f.client.setQueryData(review, {
      pages: [
        {
          groupId: "group",
          items: [
            {
              userId: "invitee",
              username: "private-invitee",
              accepted: false,
              pendingInvitation: true,
            },
          ],
        },
      ],
      pageParams: [""],
    });
    f.client.setQueryData(member, {
      pages: [{ groupId: "group", items: [{ userId: "accepted", accepted: true }] }],
      pageParams: [""],
    });
    f.persister.flush();
    expect(f.data.get("queries")).toContain("private-invitee");
    revokeProposalReview(f.client, owner, { groupId: "group" });
    f.persister.flush();
    expect(f.data.get("queries")).not.toContain("private-invitee");
    expect(f.persister.restoreClient()?.clientState.queries.map((query) => query.queryKey)).toEqual(
      [member],
    );
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

it.each([false, true])(
  "filters delayed storage restoration before synchronous subscribers can see disk-only revoked privileges (opaque scope: %s)",
  async (withScope) => {
    const disk = fixture(),
      live = fixture();
    const root = ["events", owner.apiUrl, owner.userId];
    const groups = ["groups", owner.apiUrl, owner.userId];
    const detail = [...root, "detail", "event"];
    const full = { id: "event", groupId: "group", dates: [], secret: "private-plan" };
    const other = { id: "other", groupId: "other-group", dates: [] };
    const personal = {
      id: "event",
      groupId: null,
      personalAccessOnly: true,
      ...(withScope ? { accessRevokedGroupId: "group" } : {}),
    };
    const pages = (items: unknown[]) => ({
      pages: [{ items, nextCursor: null }],
      pageParams: [""],
    });
    disk.client.setQueryData(detail, full);
    disk.client.setQueryData([...groups, "people", "group"], pages([{ email: "private-member" }]));
    disk.client.setQueryData([...groups, "detail", "group"], {
      id: "group",
      secret: "private-group",
    });
    disk.client.setQueryData([...root, "list", {}], pages([full, other]));
    disk.client.setQueryData([...root, "participants", "event"], { secret: "private-roster" });
    disk.client.setQueryData([...root, "table", "event", "table"], {
      id: "table",
      eventId: "event",
      personalAccessOnly: true,
    });
    disk.client.setQueryData([...root, "detail", "shared"], {
      id: "shared",
      groupId: null,
      sharedResultsOnly: true,
    });
    disk.client.setQueryData([...groups, "people", "other-group"], pages([{ userId: "allowed" }]));
    disk.persister.flush();
    const snapshot = disk.data.get("queries");
    if (!snapshot) throw new Error("Missing disk fixture snapshot");
    let opened!: () => void;
    const opening = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const restored = (async () => {
      await opening;
      live.data.set("queries", snapshot);
      const saved = live.persister.restoreClient();
      if (!saved) throw new Error("Missing delayed fixture snapshot");
      restoreSessionCache(live.client, saved, new Set([hashKey(detail)]));
    })();
    // The server responds while encrypted storage is still opening. No Group record is in RAM.
    live.client.setQueryData(detail, personal, { updatedAt: Date.now() - 1000 });
    live.client.setQueryData([...root, "list", {}], pages([personal, other]), {
      updatedAt: Date.now() - 1000,
    });
    const observed: string[] = [];
    const unsubscribe = live.client.getQueryCache().subscribe((event) => {
      observed.push(JSON.stringify(event.query.state.data));
      live.persister.schedule();
    });
    live.persister.schedule(); // A write is already pending when hydration starts.
    opened();
    await restored;
    await Promise.resolve();
    live.persister.flush();
    expect(observed.join(" ")).not.toContain("private-");
    expect(live.data.get("queries")).not.toContain("private-");
    expect(live.client.getQueryData(detail)).toEqual(personal);
    expect(live.client.getQueryData([...root, "list", {}])).toEqual(pages([personal, other]));
    expect(live.client.getQueryData([...groups, "people", "group"])).toBeUndefined();
    expect(live.client.getQueryData([...groups, "people", "other-group"])).toEqual(
      pages([{ userId: "allowed" }]),
    );
    expect(live.client.getQueryData([...root, "table", "event", "table"])).toMatchObject({
      personalAccessOnly: true,
    });
    expect(live.client.getQueryData([...root, "detail", "shared"])).toMatchObject({
      sharedResultsOnly: true,
    });
    expect(live.error).not.toHaveBeenCalled();
    unsubscribe();
  },
);

it("persists only reconciled journal bases after revocation, queued writes, late reads and rollback", async () => {
  const f = fixture(),
    root = ["events", owner.apiUrl, owner.userId];
  const detail = [...root, "detail", "event"],
    list = [...root, "list", {}];
  const full = { id: "event", groupId: "group", dates: [], secret: "private-plan" };
  const other = { id: "other", groupId: "other-group", dates: [] };
  const pages = (items: unknown[]) => ({ pages: [{ items, nextCursor: null }], pageParams: [""] });
  f.client.setQueryData(detail, full);
  f.client.setQueryData(list, pages([full, other]));
  const revoked = await beginOptimisticOperation(f.client, [...root, "event"], { queryKey: root });
  const unrelated = await beginOptimisticOperation(f.client, [...root, "other"], {
    queryKey: root,
  });
  const unsubscribe = f.client.getQueryCache().subscribe((event) => {
    if (ownsPersistedQuery(event.query.queryKey, owner)) f.persister.schedule();
  });
  f.persister.flush();
  expect(f.data.get("queries")).toContain("private-plan");
  f.persister.schedule();
  const personal = {
    id: "event",
    groupId: null,
    personalAccessOnly: true,
    accessRevokedGroupId: "group",
  };
  reconcilePersonalEventAccess(f.client, owner, personal, detail);
  revoked.commit(() => full);
  unrelated.rollback();
  await Promise.resolve();
  expect(f.data.get("queries")).not.toContain("private-plan");
  expect(f.client.getQueryData(list)).toEqual(pages([other]));
  const saved = f.persister.restoreClient();
  if (!saved) throw new Error("Missing reconciled fixture snapshot");
  const next = fixture();
  restoreSessionCache(next.client, saved, new Set());
  expect(next.client.getQueryData(detail)).toEqual(personal);
  expect(next.client.getQueryData(list)).toEqual(pages([other]));
  unsubscribe();
});

it.each([false, true])(
  "rejects a deferred cold sibling query factory response from RAM and persistence (A already personal: %s)",
  async (alreadyPersonal) => {
    const f = fixture(),
      root = ["events", owner.apiUrl, owner.userId];
    const options = { ...owner, getToken: vi.fn(async () => "fresh") };
    const personal = {
      id: "event-a",
      groupId: null,
      personalAccessOnly: true,
      accessRevokedGroupId: "group",
    };
    const detail = [...root, "detail", "event-a"];
    f.client.setQueryData(
      detail,
      alreadyPersonal ? personal : { id: "event-a", groupId: "group", dates: [] },
    );
    // Only these two reads have authoritative evidence of an unrelated Group/standalone scope.
    f.client.setQueryData([...root, "list", {}], {
      pages: [{ items: [{ id: "known-other", groupId: "other-group", dates: [] }] }],
      pageParams: [""],
    });
    f.client.setQueryData(
      [...root, "detail", "standalone"],
      { id: "standalone", groupId: null },
      { updatedAt: 1 },
    );
    const pending = new Map<string, (value: Response) => void>();
    let started: () => void = () => {};
    const allStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (input) =>
        new Promise<Response>((resolve) => {
          const id = new URL(String(input)).pathname.split("/").at(-1) ?? "";
          pending.set(id, resolve);
          if (pending.size === 3) started();
        }),
    );
    const sibling = eventRecordQuery(options, "sibling");
    const other = eventRecordQuery(options, "known-other");
    const standalone = eventRecordQuery(options, "standalone");
    const staleRead = f.client.fetchQuery(sibling).catch((error: unknown) => error);
    const otherRead = f.client.fetchQuery(other);
    const standaloneRead = f.client.fetchQuery(standalone);
    await allStarted;
    const unsubscribe = f.client.getQueryCache().subscribe((event) => {
      if (ownsPersistedQuery(event.query.queryKey, owner)) f.persister.schedule();
    });
    f.persister.schedule();
    reconcilePersonalEventAccess(f.client, owner, personal, detail);
    const respond = (id: string, data: unknown) => {
      const resolve = pending.get(id);
      if (!resolve) throw new Error(`Missing deferred ${id} fixture`);
      resolve(new Response(JSON.stringify(data), { status: 200 }));
    };
    respond("sibling", { id: "sibling", groupId: "group", dates: [], secret: "private-sibling" });
    const knownOther = {
      id: "known-other",
      groupId: "other-group",
      dates: [],
      name: "fresh-other",
    };
    const knownStandalone = { id: "standalone", groupId: null, name: "fresh-standalone" };
    respond("known-other", knownOther);
    respond("standalone", knownStandalone);
    expect(isCancelledError(await staleRead)).toBe(true);
    await Promise.all([otherRead, standaloneRead]);
    await Promise.resolve();
    f.persister.flush();
    expect(f.client.getQueryData(sibling.queryKey)).toBeUndefined();
    expect(f.client.getQueryData(other.queryKey)).toEqual(knownOther);
    expect(f.client.getQueryData(standalone.queryKey)).toEqual(knownStandalone);
    expect(f.client.getQueryData(detail)).toEqual(personal);
    expect(
      JSON.stringify(
        f.client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain("private-sibling");
    expect(f.data.get("queries")).not.toContain("private-sibling");
    expect(f.data.get("queries")).toContain("fresh-other");
    expect(f.data.get("queries")).toContain("fresh-standalone");
    expect(options.getToken).toHaveBeenCalledTimes(3);
    unsubscribe();
  },
);
