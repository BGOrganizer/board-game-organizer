import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  beginOptimisticOperation,
  cancelOptimisticResource,
  clearSessionQueryCache,
  optimisticBaseData,
  optimisticFailureAction,
  optimisticOperationSignal,
  optimisticOperationState,
  updateOptimisticBase,
} from "../optimisticOperation";

const root = ["items", "api", "user"] as const;
const list = [...root, "list"];
const detail = [...root, "detail"];
const filters = { queryKey: root };
const rejected = Object.assign(new Error("REJECTED"), { status: 409 });
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
type Data = { a: boolean; b: boolean; count: number };
const initial: Data = { a: false, b: false, count: 0 };
const patch = (field: "a" | "b") => (data: unknown) => {
  const row = data as Data | undefined;
  return row ? { ...row, [field]: true, count: row.count + Number(!row[field]) } : row;
};
function seed(client: QueryClient) {
  client.setQueryData(list, initial);
  client.setQueryData(detail, initial);
}

describe("operation-scoped optimistic cache updates", () => {
  it("reports only freshly denied reads so the owning feature can revoke dependent access", async () => {
    const client = makeClient();
    let denied = false;
    await client.fetchQuery({
      queryKey: list,
      queryFn: async () => {
        if (denied) throw Object.assign(new Error("Forbidden"), { status: 403 });
        return initial;
      },
    });
    const onDenied = vi.fn();
    const operation = await beginOptimisticOperation(
      client,
      root,
      filters,
      patch("a"),
      [],
      onDenied,
    );
    denied = true;
    await operation.reject(Object.assign(new Error("Write denied"), { status: 403 }));
    expect(onDenied).toHaveBeenCalledExactlyOnceWith(list);
    expect(client.getQueryData(list)).toBeUndefined();
    expect(operation.active).toBe(false);
  });
  it.each([null, 200, 399, 400, 401, 403, 404, 408, 409, 500])(
    "distinguishes a definite rejection from an unverified outcome (%s)",
    (status) => {
      const error =
        status === null
          ? new Error("network unavailable")
          : Object.assign(new Error("response"), { status });
      expect(optimisticFailureAction(error, "follow")).toBe(
        status !== null && status >= 400 && status < 500 && status !== 408
          ? "follow"
          : "verify_saved_changes",
      );
    },
  );
  it.each(["MUTATION_IN_PROGRESS", "MUTATION_OWNER_CHANGED"])(
    "does not call a local pre-request guard an unknown server outcome (%s)",
    (message) => {
      expect(optimisticFailureAction(new Error(message), "follow")).toBe("follow");
    },
  );
  it("rolls back every part of A while retaining B's acknowledged changes", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    const b = await beginOptimisticOperation(client, [...root, "b"], filters, patch("b"));
    expect(a.modified).toBe(true);
    expect(client.getQueryData(list)).toEqual({ a: true, b: true, count: 2 });
    b.commit();
    await a.reject(rejected);
    for (const key of [list, detail])
      expect(client.getQueryData(key)).toEqual({ a: false, b: true, count: 1 });
    expect(a.active).toBe(false);
    a.rollback();
    b.commit();
    expect(optimisticOperationState(client, root).busy()).toBe(false);
  });

  it("replays still-pending B after A fails, then can roll back B too", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    const b = await beginOptimisticOperation(client, [...root, "b"], filters, patch("b"));
    a.rollback();
    expect(client.getQueryData(list)).toEqual({ a: false, b: true, count: 1 });
    b.rollback();
    expect(client.getQueryData(list)).toEqual(initial);
  });

  it("retains an authoritative canonical acknowledgement when another action fails", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    const b = await beginOptimisticOperation(client, [...root, "b"], filters, patch("b"));
    b.commit((data) => ({ ...(data as Data), canonical: "verified" }));
    a.rollback();
    expect(client.getQueryData(detail)).toEqual({
      a: false,
      b: true,
      count: 1,
      canonical: "verified",
    });
  });

  it("rebases pending work over fetched server data without dropping new fields", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    await client.fetchQuery({
      queryKey: list,
      queryFn: async () => ({ ...initial, b: true, count: 1, page: 2 }),
    });
    expect(client.getQueryData(list)).toEqual({ a: true, b: true, count: 2, page: 2 });
    a.rollback();
    expect(client.getQueryData(list)).toEqual({ a: false, b: true, count: 1, page: 2 });
  });

  it("publishes other acknowledged writes against the base rather than the overlay", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    updateOptimisticBase(client, list, patch("b"));
    a.rollback();
    expect(client.getQueryData(list)).toEqual({ a: false, b: true, count: 1 });
    updateOptimisticBase(client, detail, patch("b"));
    expect(client.getQueryData(detail)).toEqual({ a: false, b: true, count: 1 });
  });

  it("locks only overlapping resources, including bulk writes", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    await expect(beginOptimisticOperation(client, [...root, "a"], filters)).rejects.toThrow(
      "MUTATION_IN_PROGRESS",
    );
    await expect(beginOptimisticOperation(client, root, filters)).rejects.toThrow(
      "MUTATION_IN_PROGRESS",
    );
    expect(optimisticOperationState(client, root).busy([...root, "b"])).toBe(false);
    const foreign = await beginOptimisticOperation(client, ["items", "other-api", "user", "a"], {
      queryKey: ["foreign"],
    });
    foreign.rollback();
    a.rollback();
    const bulk = await beginOptimisticOperation(client, root, filters);
    await expect(beginOptimisticOperation(client, [...root, "a"], filters)).rejects.toThrow(
      "MUTATION_IN_PROGRESS",
    );
    bulk.commit();
  });

  it("does not fabricate missing cache entries or emit a false changed flag", async () => {
    const client = makeClient();
    const operation = await beginOptimisticOperation(client, root, filters);
    expect(operation.modified).toBe(false);
    operation.commit();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    seed(client);
    const noop = await beginOptimisticOperation(client, root, filters);
    expect(noop.modified).toBe(false);
    noop.rollback();
  });

  it("preserves age and invalidation for no-op and partial publishers outside a tracked operation", async () => {
    const client = makeClient();
    client.setQueryData(list, initial, { updatedAt: 1 });
    await client.invalidateQueries({ ...filters, refetchType: "none" });
    updateOptimisticBase(client, list, (data) => ({ ...(data as Data) }));
    expect(client.getQueryState(list)).toMatchObject({ dataUpdatedAt: 1, isInvalidated: true });
    updateOptimisticBase(client, list, patch("b"));
    expect(client.getQueryState(list)).toMatchObject({ dataUpdatedAt: 1, isInvalidated: true });
    expect(client.getQueryData(list)).toEqual({ a: false, b: true, count: 1 });
    updateOptimisticBase(client, detail, () => initial);
    expect(client.getQueryData(detail)).toEqual(initial);
  });

  it.each(["commit", "rollback"] as const)(
    "preserves cache age and invalidation through projections and %s",
    async (finish) => {
      const client = makeClient();
      client.setQueryData(list, initial, { updatedAt: 1 });
      await client.invalidateQueries({ ...filters, refetchType: "none" });
      const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
      expect(client.getQueryState(list)).toMatchObject({ dataUpdatedAt: 1, isInvalidated: true });
      updateOptimisticBase(client, list, patch("b"));
      expect(client.getQueryState(list)).toMatchObject({ dataUpdatedAt: 1, isInvalidated: true });
      operation[finish]();
      expect(client.getQueryState(list)).toMatchObject({ dataUpdatedAt: 1, isInvalidated: true });
      expect(client.getQueryData(list)).toMatchObject({ a: finish === "commit", b: true });
    },
  );

  it.each(["begin", "acknowledge"] as const)(
    "retains invalidation when %s cancels a read whose revert snapshot was fresh",
    async (phase) => {
      const client = makeClient();
      seed(client);
      const operation =
        phase === "acknowledge"
          ? await beginOptimisticOperation(client, root, filters, patch("a"))
          : undefined;
      const fetching = client.fetchQuery({
        queryKey: list,
        queryFn: ({ signal }) => {
          expect(signal.aborted).toBe(false);
          return new Promise<Data>(() => undefined);
        },
      });
      await client.invalidateQueries({ ...filters, refetchType: "none" });
      const current =
        operation ?? (await beginOptimisticOperation(client, root, filters, patch("a")));
      if (operation) operation.acknowledge();
      await expect(fetching).resolves.toBeDefined();
      expect(client.getQueryState(list)?.isInvalidated).toBe(true);
      current.rollback();
      expect(client.getQueryState(list)?.isInvalidated).toBe(true);
    },
  );

  it("does not re-notify evicted queries while preserving invalidation during cancellation", async () => {
    const client = makeClient();
    seed(client);
    await client.invalidateQueries({ ...filters, refetchType: "none" });
    const invalidations = client
      .getQueryCache()
      .findAll(filters)
      .map((query) => vi.spyOn(query, "invalidate"));
    const cancel = client.cancelQueries.bind(client);
    vi.spyOn(client, "cancelQueries").mockImplementation((filters) => {
      const pending = cancel(filters);
      clearSessionQueryCache(client);
      return pending;
    });
    await expect(beginOptimisticOperation(client, root, filters, patch("a"))).rejects.toThrow(
      "MUTATION_OWNER_CHANGED",
    );
    for (const invalidate of invalidations) expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("cancels pre-ACK reads once without cancelling post-ACK reads on completion", async () => {
    const client = makeClient();
    seed(client);
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    let beforeSignal: AbortSignal | undefined;
    const before = client.fetchQuery({
      queryKey: list,
      queryFn: ({ signal }) => {
        beforeSignal = signal;
        return new Promise<Data>(() => undefined);
      },
    });
    operation.acknowledge();
    expect(beforeSignal?.aborted).toBe(true);
    await expect(before).resolves.toBeDefined();
    let afterSignal: AbortSignal | undefined;
    let release!: (data: Data) => void;
    const after = client.fetchQuery({
      queryKey: list,
      queryFn: ({ signal }) => {
        afterSignal = signal;
        return new Promise<Data>((resolve) => {
          release = resolve;
        });
      },
    });
    operation.commit();
    operation.acknowledge();
    expect(afterSignal?.aborted).toBe(false);
    release({ a: true, b: true, count: 2 });
    await expect(after).resolves.toEqual({ a: true, b: true, count: 2 });
    expect(client.getQueryData(list)).toEqual({ a: true, b: true, count: 2 });
  });

  it("handles cache invalidation and unrelated fetches without changing its baseline", async () => {
    const client = makeClient();
    seed(client);
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    await client.invalidateQueries({ ...filters, refetchType: "none" });
    await client.fetchQuery({ queryKey: ["foreign"], queryFn: async () => "foreign" });
    updateOptimisticBase(client, list, patch("b"));
    operation.rollback();
    expect(client.getQueryData(list)).toEqual({ a: false, b: true, count: 1 });
    expect(client.getQueryData(["foreign"])).toBe("foreign");
    await client.fetchQuery({ queryKey: list, queryFn: async () => initial });
  });

  it("drops removed resources and cannot resurrect a cleared session", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    const b = await beginOptimisticOperation(client, ["other"], { queryKey: ["other"] });
    client.removeQueries({ queryKey: detail, exact: true });
    expect(a.active).toBe(true);
    expect(client.getQueryData(list)).toEqual({ ...initial, a: true, count: 1 });
    a.commit();
    b.rollback();
    const c = await beginOptimisticOperation(client, root, filters, patch("b"));
    clearSessionQueryCache(client);
    c.commit();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not publish a cancelled operation after the cache disappears during cancellation", async () => {
    const client = makeClient();
    seed(client);
    let release!: () => void;
    vi.spyOn(client, "cancelQueries").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = beginOptimisticOperation(client, root, filters, patch("a"));
    clearSessionQueryCache(client);
    release();
    await expect(pending).rejects.toThrow("MUTATION_OWNER_CHANGED");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("undoes a partially applied client update if a transformer throws", async () => {
    const client = makeClient();
    seed(client);
    await expect(
      beginOptimisticOperation(client, root, filters, (data, key) => {
        if (key[3] === "detail") throw new Error("bad patch");
        return patch("a")(data);
      }),
    ).rejects.toThrow("bad patch");
    expect(client.getQueryData(list)).toEqual(initial);
    expect(optimisticOperationState(client, root).busy()).toBe(false);
  });

  it("cleans up after cancellation failure and notifies resource observers", async () => {
    const client = makeClient();
    seed(client);
    const state = optimisticOperationState(client, root),
      listener = vi.fn();
    const unsubscribe = state.subscribe(listener);
    const before = state.snapshot();
    vi.spyOn(client, "cancelQueries").mockRejectedValue(new Error("cancel"));
    await expect(beginOptimisticOperation(client, root, filters)).rejects.toThrow("cancel");
    expect(listener).toHaveBeenCalled();
    expect(state.snapshot()).toBeGreaterThan(before);
    expect(state.busy()).toBe(false);
    unsubscribe();
  });

  it.each([400, 401, 409, 422])(
    "treats HTTP %i as rejection, hiding private data after access loss",
    async (status) => {
      const client = makeClient();
      seed(client);
      client.setQueryData(["items", "api", "other-user"], initial);
      const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
      await operation.reject(Object.assign(new Error("rejected"), { status }));
      expect(operation.active).toBe(false);
      expect(client.getQueryData(list)).toEqual(status === 401 ? undefined : initial);
      expect(client.getQueryData(["items", "api", "other-user"])).toEqual(initial);
    },
  );

  it.each([
    new Error("response lost"),
    Object.assign(new Error("timeout"), { status: 408 }),
    Object.assign(new Error("server"), { status: 500 }),
  ])("reads back uncertain writes instead of blindly undoing committed data: %s", async (error) => {
    const client = makeClient();
    let server = initial;
    await client.fetchQuery({ queryKey: list, queryFn: async () => server });
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    server = { a: true, b: false, count: 1 };
    await operation.reject(error);
    expect(client.getQueryData(list)).toEqual(server);
    expect(operation.active).toBe(false);
  });

  it("keeps only an uncertain resource locked, recovering after connectivity returns", async () => {
    const client = makeClient();
    let online = true;
    const queryFn = vi.fn(async () => {
      if (!online) throw new Error("offline");
      return { ...initial, a: true, count: 1 };
    });
    await client.fetchQuery({ queryKey: list, queryFn });
    online = false;
    const operation = await beginOptimisticOperation(client, [...root, "a"], filters, patch("b"));
    await operation.reject(new Error("response lost"));
    expect(operation.active).toBe(true);
    expect(optimisticOperationState(client, root).busy([...root, "a"])).toBe(true);
    expect(optimisticOperationState(client, root).busy([...root, "b"])).toBe(false);
    online = true;
    await client.fetchQuery({ queryKey: list, queryFn, staleTime: 0 });
    await vi.waitFor(() => expect(operation.active).toBe(false));
    expect(client.getQueryData(list)).toEqual({ ...initial, a: true, count: 1 });
  });

  it.each([403, 404])(
    "re-reads HTTP %i write failures without discarding still-readable data",
    async (status) => {
      const client = makeClient();
      await client.fetchQuery({ queryKey: list, queryFn: async () => initial });
      const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
      await operation.reject(Object.assign(new Error("write denied"), { status }));
      expect(operation.active).toBe(false);
      expect(client.getQueryData(list)).toEqual(initial);
    },
  );

  it.each([401, 403, 404])(
    "hides only the private query denied by a fresh HTTP %i read",
    async (status) => {
      const client = makeClient();
      let denied = false;
      await client.fetchQuery({
        queryKey: list,
        queryFn: async () => {
          if (denied) throw new Error(`HTTP ${status}`);
          return initial;
        },
      });
      client.setQueryData(["foreign"], "keep");
      const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
      denied = true;
      await operation.reject(new Error("response lost"));
      expect(operation.active).toBe(false);
      expect(client.getQueryData(list)).toBeUndefined();
      expect(client.getQueryState(list)?.status).toBe("error");
      expect(client.getQueryData(["foreign"])).toBe("keep");
    },
  );

  it("locks every known alias and cancels a waiting token resolution on session change", async () => {
    const client = makeClient();
    seed(client);
    const operation = await beginOptimisticOperation(
      client,
      [...root, "opaque"],
      filters,
      patch("a"),
      [[...root, "canonical"]],
    );
    const signal = optimisticOperationSignal(client, [...root, "canonical"]);
    expect(signal.aborted).toBe(false);
    expect(optimisticOperationState(client, root).busy([...root, "canonical"])).toBe(true);
    await expect(
      beginOptimisticOperation(client, [...root, "other"], filters, patch("b"), [
        [...root, "canonical"],
      ]),
    ).rejects.toThrow("MUTATION_IN_PROGRESS");
    clearSessionQueryCache(client);
    expect(signal.aborted).toBe(true);
    expect(optimisticOperationSignal(client, root).aborted).toBe(true);
    operation.commit();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  it("seeds a new detail from the server base and rolls its pending projection back too", async () => {
    const client = makeClient();
    seed(client);
    expect(optimisticBaseData(client, list)).toEqual(initial);
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    const base = optimisticBaseData(client, list);
    expect(base).toEqual(initial);
    const extra = [...root, "new-detail"];
    await client.fetchQuery({
      queryKey: extra,
      initialData: base,
      staleTime: Infinity,
      queryFn: async () => base,
    });
    expect(client.getQueryData(extra)).toEqual({ ...initial, a: true, count: 1 });
    await client.fetchQuery({
      queryKey: ["unrelated-initial"],
      initialData: initial,
      queryFn: async () => initial,
    });
    operation.rollback();
    expect(client.getQueryData(extra)).toEqual(initial);
    await client.fetchQuery({
      queryKey: ["foreign-seed"],
      initialData: initial,
      queryFn: async () => initial,
    });
  });

  it("never lets a lost-response recovery revive a cleared actor", async () => {
    const client = makeClient();
    seed(client);
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    clearSessionQueryCache(client);
    await operation.reject(new Error("late network error"));
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(operation.active).toBe(false);
  });

  it("does not resurrect a query evicted reentrantly while initial data is being published", async () => {
    const client = makeClient();
    seed(client);
    const cache = client.getQueryCache();
    const stop = cache.subscribe((event) => {
      if (event.type === "added" && event.query.queryKey[3] === "evicted")
        cache.remove(event.query);
    });
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    const key = [...root, "evicted"];
    cache.build(client, { queryKey: key, initialData: initial });
    expect(client.getQueryData(key)).toBeUndefined();
    operation.rollback();
    expect(client.getQueryData(key)).toBeUndefined();
    stop();
  });

  it("does not execute placeholder-only queries while verifying a lost response", async () => {
    const client = makeClient();
    await client.fetchQuery({ queryKey: list, queryFn: async () => initial });
    const disabled = vi.fn(async () => initial);
    client.getQueryCache().build(client, { queryKey: [...root, "empty-id"], queryFn: disabled });
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    await operation.reject(Object.assign(new Error("unknown status"), { status: 200 }));
    expect(disabled).not.toHaveBeenCalled();
    expect(operation.active).toBe(false);
  });

  it("keeps an uncertain outcome unresolved when a read throws a non-Error failure", async () => {
    const client = makeClient();
    let fail = false;
    await client.fetchQuery({
      queryKey: list,
      queryFn: async () => {
        if (fail) return Promise.reject("offline");
        return initial;
      },
    });
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    fail = true;
    await operation.reject(new Error("lost response"));
    expect(operation.active).toBe(true);
    operation.rollback();
  });

  it("waits for every reconciliation read so a partial failure cannot create an automatic retry storm", async () => {
    const client = makeClient();
    seed(client);
    let deferred = false;
    let release!: (value: Data) => void;
    const read = vi.fn(() =>
      deferred
        ? new Promise<Data>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(initial),
    );
    await client.fetchQuery({ queryKey: list, queryFn: read, staleTime: 0 });
    read.mockClear();
    deferred = true;
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    const recovery = operation.reject(new Error("lost response"));
    await vi.waitFor(() => expect(release).toBeDefined());
    release(initial);
    await recovery;
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    expect(operation.active).toBe(true);
    operation.rollback();
  });

  it("does not restore private data if another cache listener evicts a denied query", async () => {
    const client = makeClient();
    const cache = client.getQueryCache();
    cache.subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") cache.remove(event.query);
    });
    let denied = false;
    await client.fetchQuery({
      queryKey: list,
      queryFn: async () => {
        if (denied) throw new Error("HTTP 403");
        return initial;
      },
    });
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    denied = true;
    await operation.reject(new Error("unknown write outcome"));
    expect(client.getQueryData(list)).toBeUndefined();
    expect(operation.active).toBe(false);
  });

  it("does not treat a cancelled reconciliation's fulfilled cache projection as a server receipt", async () => {
    const client = makeClient();
    const releases: ((value: Data) => void)[] = [];
    let waiting = false;
    const read = () =>
      waiting ? new Promise<Data>((resolve) => releases.push(resolve)) : Promise.resolve(initial);
    await client.fetchQuery({ queryKey: list, queryFn: read });
    await client.fetchQuery({ queryKey: detail, queryFn: read });
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    const b = await beginOptimisticOperation(client, [...root, "b"], filters, patch("b"));
    waiting = true;
    const recovery = b.reject(new Error("lost response"));
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    a.commit();
    await recovery;
    expect(b.active).toBe(true);
    b.rollback();
    for (const release of releases) release(initial);
    await Promise.resolve();
    expect(client.getQueryData(list)).toEqual({ a: true, b: false, count: 1 });
  });

  it("cancels a deleted resource's aliases without cancelling an independent writer", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"), [
      [...root, "alias"],
    ]);
    const b = await beginOptimisticOperation(client, [...root, "b"], filters, patch("b"));
    const signal = optimisticOperationSignal(client, [...root, "a"]);
    cancelOptimisticResource(client, ["other-owner"]);
    expect(a.active).toBe(true);
    cancelOptimisticResource(client, [...root, "alias"]);
    expect(signal.aborted).toBe(true);
    expect(a.active).toBe(false);
    expect(b.active).toBe(true);
    a.commit(() => ({ corrupted: true }));
    expect(client.getQueryData(list)).toEqual({ a: false, b: true, count: 1 });
    b.rollback();
  });

  it("cannot resume a readback under a new session after cancellation was awaited", async () => {
    const client = makeClient();
    const read = vi.fn(async () => initial);
    await client.fetchQuery({ queryKey: list, queryFn: read });
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    let release!: () => void;
    const cancel = vi.spyOn(client, "cancelQueries").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const recovery = operation.reject(new Error("lost response"));
    clearSessionQueryCache(client);
    release();
    await recovery;
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).toEqual([]);
    cancel.mockRestore();
  });

  it("does not absorb another pending projection when an observer rewrites the same cached data", async () => {
    const client = makeClient();
    seed(client);
    const a = await beginOptimisticOperation(client, [...root, "a"], filters, patch("a"));
    const b = await beginOptimisticOperation(client, [...root, "b"], filters, patch("b"));
    client.setQueryData(list, client.getQueryData(list));
    a.rollback();
    b.rollback();
    expect(client.getQueryData(list)).toEqual(initial);
  });

  it("drops a recovery cancelled by session removal without leaving an old-owner lock", async () => {
    const client = makeClient();
    let waiting = false;
    let release!: (value: Data) => void;
    await client.fetchQuery({
      queryKey: list,
      queryFn: () =>
        waiting
          ? new Promise<Data>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(initial),
    });
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    waiting = true;
    const recovery = operation.reject(new Error("lost response"));
    await vi.waitFor(() => expect(release).toBeDefined());
    clearSessionQueryCache(client);
    await recovery;
    release(initial);
    expect(operation.active).toBe(false);
    expect(optimisticOperationState(client, root).busy()).toBe(false);
  });

  it("requires owned GET evidence and an unchanged operation owner for mandatory reads", async () => {
    const client = makeClient();
    seed(client);
    const operation = await beginOptimisticOperation(client, root, filters);
    await expect(operation.read(list, async () => initial)).rejects.toThrow(
      "MUTATION_READ_UNVERIFIED",
    );
    await expect(
      operation.read(["foreign"], () =>
        client.fetchQuery({ queryKey: ["foreign"], queryFn: async () => initial }),
      ),
    ).rejects.toThrow("MUTATION_READ_UNVERIFIED");
    await expect(
      operation.read(list, async () => {
        client.removeQueries({ queryKey: list, exact: true });
        return initial;
      }),
    ).rejects.toThrow("MUTATION_READ_UNVERIFIED");
    let release!: (value: Data) => void;
    const pending = operation.read(
      detail,
      () =>
        new Promise<Data>((resolve) => {
          release = resolve;
        }),
    );
    operation.rollback();
    release(initial);
    await expect(pending).rejects.toThrow("MUTATION_READ_UNVERIFIED");
    const stale = vi.fn(async () => initial);
    await expect(operation.read(detail, stale)).rejects.toThrow("MUTATION_OWNER_CHANGED");
    expect(stale).not.toHaveBeenCalled();
  });

  it("keeps unknown cold writes and cache entries without query functions unconfirmed", async () => {
    const client = makeClient();
    const cold = await beginOptimisticOperation(client, root, filters);
    await cold.reject(new Error("lost"));
    expect(cold.active).toBe(true);
    await client.fetchQuery({ queryKey: list, queryFn: async () => initial });
    await vi.waitFor(() => expect(cold.active).toBe(false));
    client.setQueryData(detail, initial);
    const operation = await beginOptimisticOperation(client, root, filters, patch("a"));
    await operation.reject(Object.assign(new Error("unknown"), { status: "500" }));
    expect(operation.active).toBe(true);
    operation.rollback();
  });
});
