import {
  matchQuery,
  notifyManager,
  type Query,
  type QueryClient,
  type QueryFilters,
  type QueryKey,
  replaceEqualDeep,
} from "@tanstack/react-query";

import type { MutationFeedbackAction } from "./mutationFeedback";

export type OptimisticChange = (data: unknown, key: QueryKey) => unknown;
type Entry = { query: Query; base: unknown; readRevision: number };
type Operation = {
  resource: QueryKey;
  aliases: readonly QueryKey[];
  controller: AbortController;
  filters: QueryFilters;
  change: OptimisticChange;
  ready: boolean;
  uncertain: boolean;
  reconciling: boolean;
  recover: () => Promise<void>;
  cancel: () => void;
};
type Journal = {
  entries: Map<string, Entry>;
  operations: Set<Operation>;
  listeners: Set<() => void>;
  revision: number;
  readRevision: number;
  writing: boolean;
};
// Only in-flight rollback snapshots/flags live here. Query remains the server-data owner.
const journals = new WeakMap<QueryClient, Journal>();
const prefix = (a: QueryKey, b: QueryKey) => a.every((value, index) => value === b[index]);
const overlaps = (a: QueryKey, b: QueryKey) => prefix(a, b) || prefix(b, a);
function responseStatus(error: unknown) {
  if (!(error instanceof Error)) return null;
  if ("status" in error && typeof error.status === "number") return error.status;
  const legacy = /^HTTP (\d{3})$/.exec(error.message);
  return legacy ? Number(legacy[1]) : null;
}
/** A transport/5xx failure cannot honestly be presented as a rejected write. */
export function optimisticFailureAction(
  error: Error,
  action: MutationFeedbackAction,
): MutationFeedbackAction {
  if (["MUTATION_IN_PROGRESS", "MUTATION_OWNER_CHANGED"].includes(error.message)) return action;
  const status = responseStatus(error);
  return status !== null && status >= 400 && status < 500 && status !== 408
    ? action
    : "verify_saved_changes";
}
function cancelReads(client: QueryClient, filters: QueryFilters) {
  const invalidated = client
    .getQueryCache()
    .findAll(filters)
    .filter((query) => query.state.isInvalidated);
  const cancelled = client.cancelQueries(filters);
  // SDK cancellation restores its fetch-start snapshot, including an obsolete fresh flag.
  for (const query of invalidated)
    if (client.getQueryCache().get(query.queryHash) === query) query.invalidate();
  return cancelled;
}
function changed(journal: Journal) {
  journal.revision++;
  for (const listener of journal.listeners) listener();
}
function publishLocalData(client: QueryClient, query: Query, data: unknown) {
  if (client.getQueryCache().get(query.queryHash) !== query) return;
  const next = replaceEqualDeep(query.state.data, data);
  if (next === query.state.data) return;
  const { dataUpdatedAt, isInvalidated } = query.state;
  // A local projection/partial ACK is not a fresh GET and must not clear a pending refresh.
  client.setQueryData(query.queryKey, next, { updatedAt: dataUpdatedAt });
  if (isInvalidated) query.invalidate();
}
function project(client: QueryClient, journal: Journal, entry: Entry) {
  let data = entry.base;
  for (const operation of journal.operations)
    if (operation.ready && matchQuery(operation.filters, entry.query))
      data = operation.change(data, entry.query.queryKey);
  journal.writing = true;
  try {
    publishLocalData(client, entry.query, data);
  } finally {
    journal.writing = false;
  }
}
function journalFor(client: QueryClient): Journal {
  const existing = journals.get(client);
  if (existing) return existing;
  const journal: Journal = {
    entries: new Map(),
    operations: new Set(),
    listeners: new Set(),
    revision: 0,
    readRevision: 0,
    writing: false,
  };
  journals.set(client, journal);
  client.getQueryCache().subscribe((event) => {
    if (event.type === "removed") {
      journal.entries.delete(event.query.queryHash);
      // Individual resource eviction must not cancel an unrelated operation sharing a list.
      if (!client.getQueryCache().getAll().length) {
        for (const operation of journal.operations) operation.controller.abort();
        journal.operations.clear();
      }
      changed(journal);
      return;
    }
    if (event.type === "added" && event.query.state.data !== undefined && journal.operations.size) {
      if ([...journal.operations].some((operation) => matchQuery(operation.filters, event.query))) {
        const entry = { query: event.query, base: event.query.state.data, readRevision: 0 };
        journal.entries.set(event.query.queryHash, entry);
        project(client, journal, entry);
      }
      return;
    }
    if (event.type !== "updated" || event.action.type !== "success" || journal.writing) return;
    if (!journal.operations.size) return;
    const relevant = [...journal.operations].filter((operation) =>
      matchQuery(operation.filters, event.query),
    );
    if (!relevant.length) return;
    // Query fetches are authoritative. Other manual writers must use updateOptimisticBase.
    if (event.action.manual) return;
    const entry = {
      query: event.query,
      base: event.query.state.data,
      readRevision: ++journal.readRevision,
    };
    journal.entries.set(event.query.queryHash, entry);
    project(client, journal, entry);
    for (const operation of relevant)
      if (operation.uncertain && !operation.reconciling) void operation.recover();
  });
  return journal;
}

/** Clear transient operations before private Query data on an authentication/session change. */
export function clearSessionQueryCache(client: QueryClient) {
  const journal = journalFor(client);
  for (const operation of journal.operations) operation.controller.abort();
  journal.operations.clear();
  journal.entries.clear();
  client.clear();
  changed(journal);
}

/** A committed cascade invalidates in-flight writers for the deleted resource too. */
export function cancelOptimisticResource(client: QueryClient, resource: QueryKey) {
  for (const operation of [...journalFor(client).operations])
    if ([operation.resource, ...operation.aliases].some((key) => overlaps(key, resource)))
      operation.cancel();
}

/** A fresh-token resolution must not send an old operation under a changed session. */
export function optimisticOperationSignal(client: QueryClient, resource: QueryKey): AbortSignal {
  const operation = [...journalFor(client).operations].find((value) =>
    [value.resource, ...value.aliases].some((key) => overlaps(key, resource)),
  );
  if (operation) return operation.controller.signal;
  const cancelled = new AbortController();
  cancelled.abort();
  return cancelled.signal;
}

/** Seed another query from the server snapshot, never from a pending projection. */
export function optimisticBaseData(client: QueryClient, key: QueryKey): unknown {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  const entry = query && journalFor(client).entries.get(query.queryHash);
  return entry ? entry.base : client.getQueryData(key);
}

/** Publish an acknowledged write without absorbing another operation's pending changes. */
export function updateOptimisticBase(
  client: QueryClient,
  key: QueryKey,
  change: (data: unknown) => unknown,
) {
  const journal = journalFor(client);
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  const entry = query && journal.entries.get(query.queryHash);
  if (entry) {
    entry.base = change(entry.base);
    project(client, journal, entry);
  } else if (query) publishLocalData(client, query, change(query.state.data));
  else client.setQueryData(key, change);
}

/** One operation across every affected cache. Independent commits survive its rollback. */
export async function beginOptimisticOperation(
  client: QueryClient,
  resource: QueryKey,
  filters: QueryFilters,
  change: OptimisticChange = (data) => data,
  aliases: readonly QueryKey[] = [],
  onReadDenied?: (key: QueryKey) => void,
) {
  const journal = journalFor(client);
  if (
    [...journal.operations].some((operation) =>
      [operation.resource, ...operation.aliases].some((existing) =>
        [resource, ...aliases].some((target) => overlaps(existing, target)),
      ),
    )
  )
    throw new Error("MUTATION_IN_PROGRESS");
  const operation: Operation = {
    resource,
    aliases,
    controller: new AbortController(),
    filters,
    change,
    ready: false,
    uncertain: false,
    reconciling: false,
    recover,
    cancel: () => {
      operation.controller.abort();
      finish(false);
    },
  };
  journal.operations.add(operation);
  changed(journal);
  let acknowledged = false;
  function acknowledge() {
    if (!journal.operations.has(operation) || acknowledged) return;
    acknowledged = true;
    // Cancel pre-ACK reads once, never the post-ACK refreshes during metadata recovery.
    void cancelReads(client, filters);
  }
  function finish(commit: boolean, reconcile?: OptimisticChange) {
    if (!journal.operations.delete(operation)) return;
    notifyManager.batch(() => {
      for (const [hash, entry] of journal.entries) {
        if (commit && matchQuery(filters, entry.query)) {
          const next = change(entry.base, entry.query.queryKey);
          entry.base = reconcile ? reconcile(next, entry.query.queryKey) : next;
        }
        project(client, journal, entry);
        if (![...journal.operations].some((other) => matchQuery(other.filters, entry.query)))
          journal.entries.delete(hash);
      }
      changed(journal);
    });
  }
  async function read<T>(key: QueryKey, fetch: () => Promise<T>): Promise<T> {
    if (!journal.operations.has(operation)) throw new Error("MUTATION_OWNER_CHANGED");
    const revision = journal.readRevision;
    const result = await fetch();
    const query = client.getQueryCache().find({ queryKey: key, exact: true });
    // Cancellation can fulfill fetchQuery with an optimistic cache projection.
    // Require a real server read, not just a fulfilled SDK promise.
    if (
      !journal.operations.has(operation) ||
      !query ||
      (journal.entries.get(query.queryHash)?.readRevision ?? 0) <= revision
    )
      throw new Error("MUTATION_READ_UNVERIFIED");
    return result;
  }
  async function recover() {
    if (!journal.operations.has(operation) || operation.reconciling) return;
    operation.reconciling = true;
    try {
      // Never execute an intentionally disabled/placeholder-only query just because
      // a hook registered it. Only materialized caches need authoritative readback.
      const queries = client
        .getQueryCache()
        .findAll(filters)
        .filter((query) => query.state.data !== undefined);
      if (!queries.length) throw new Error("MUTATION_OUTCOME_UNKNOWN");
      await cancelReads(client, filters);
      if (!journal.operations.has(operation)) return;
      const reads = await Promise.allSettled(
        queries.map((query) =>
          typeof query.options.queryFn === "function"
            ? read(query.queryKey, () =>
                client.fetchQuery({
                  ...query.options,
                  queryKey: query.queryKey,
                  staleTime: 0,
                  retry: false,
                  networkMode: "always",
                }),
              ).catch((error: unknown) => {
                if (![401, 403, 404].includes(responseStatus(error) ?? 0)) throw error;
                const entry = journal.entries.get(query.queryHash);
                if (entry) entry.base = undefined;
                query.setState({
                  data: undefined,
                  error: error as Error,
                  status: "error",
                  dataUpdatedAt: 0,
                });
                if (
                  journal.operations.has(operation) &&
                  client.getQueryCache().get(query.queryHash) === query
                )
                  onReadDenied?.(query.queryKey);
              })
            : Promise.reject(new Error("MUTATION_OUTCOME_UNKNOWN")),
        ),
      );
      if (reads.some((read) => read.status === "rejected"))
        throw new Error("MUTATION_OUTCOME_UNKNOWN");
      finish(false);
    } catch {
      if (!journal.operations.has(operation)) return;
      operation.uncertain = true;
      changed(journal);
      void client.invalidateQueries({ ...filters, refetchType: "none" });
    } finally {
      operation.reconciling = false;
    }
  }
  try {
    await cancelReads(client, filters);
    if (!journal.operations.has(operation)) throw new Error("MUTATION_OWNER_CHANGED");
    let modified = false;
    if (journal.operations.has(operation)) {
      operation.ready = true;
      notifyManager.batch(() => {
        for (const query of client.getQueryCache().findAll(filters)) {
          const entry = journal.entries.get(query.queryHash) ?? {
            query,
            base: query.state.data,
            readRevision: 0,
          };
          journal.entries.set(query.queryHash, entry);
          const before = query.state.data;
          modified ||= replaceEqualDeep(before, change(before, query.queryKey)) !== before;
          project(client, journal, entry);
        }
      });
    }
    return {
      resource,
      get active() {
        return journal.operations.has(operation);
      },
      modified,
      read,
      acknowledge,
      commit: (reconcile?: OptimisticChange) => {
        if (!journal.operations.has(operation)) return;
        acknowledge();
        finish(true, reconcile);
      },
      rollback: () => finish(false),
      /** A lost response/5xx cannot prove rejection. Read back before dropping its overlay. */
      async reject(error: Error) {
        const status = responseStatus(error);
        if (status !== null && status >= 400 && status < 500 && ![403, 404, 408].includes(status)) {
          finish(false);
          if (status === 401)
            notifyManager.batch(() => {
              for (const query of client.getQueryCache().findAll(filters)) {
                query.setState({ data: undefined, error, status: "error", dataUpdatedAt: 0 });
                client.removeQueries({ queryKey: query.queryKey, exact: true });
              }
            });
          return;
        }
        await operation.recover();
      },
    };
  } catch (error) {
    finish(false);
    throw error;
  }
}

export function optimisticOperationState(client: QueryClient, resource: QueryKey) {
  const journal = journalFor(client);
  return {
    subscribe: (listener: () => void) => {
      journal.listeners.add(listener);
      return () => {
        journal.listeners.delete(listener);
      };
    },
    snapshot: () => journal.revision,
    busy: (target: QueryKey = resource) =>
      [...journal.operations].some((operation) =>
        [operation.resource, ...operation.aliases].some((key) => overlaps(key, target)),
      ),
  };
}
