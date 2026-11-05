import {
  communityAccessDenied,
  isRetiredActivityFeed,
  optimisticBaseData,
} from "@board-game-organizer/shared";
import {
  dehydrate,
  hashKey,
  hydrate,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

export const CACHE_BUSTER = "bgo-mobile-query-v1";
export const CACHE_MAX_AGE = 24 * 60 * 60_000;
export const CACHE_MAX_BYTES = 8 * 1024 * 1024;
export const CACHE_MAX_QUERIES = 200;
const SNAPSHOT = "queries";
export type CacheOwner = { apiUrl: string; userId: string };
export type CacheStorage = {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
};

/** No credentials, raw address-book values, transient drafts, or licensed provider searches. */
export function ownsPersistedQuery(key: QueryKey, owner: CacheOwner) {
  if (isRetiredActivityFeed(key)) return false;
  if (key[0] === "contacts") return key[2] === owner.apiUrl && key[3] === owner.userId;
  return (
    [
      "events",
      "groups",
      "notifications",
      "notification-attention",
      "profile",
      "favoriteLocations",
      "bgg-account",
      "bgg-picker",
      "bgg-collection",
    ].includes(String(key[0])) &&
    key[1] === owner.apiUrl &&
    key[2] === owner.userId
  );
}

/** Native infinite refetches start at page one; do not walk all pages restored from disk. */
export function configureMobileCache(client: QueryClient, owner?: CacheOwner) {
  const defaults = { ...client.getDefaultOptions().queries, pages: 1 };
  client.setDefaultOptions({ ...client.getDefaultOptions(), queries: defaults });
  // Factory-specific gcTime must not shorten persisted data retention; raw contacts stay unchanged.
  const retain = (query: Query) => {
    if (owner && ownsPersistedQuery(query.queryKey, owner))
      query.setOptions({ ...query.options, gcTime: Math.max(CACHE_MAX_AGE, query.gcTime) });
  };
  client.getQueryCache().getAll().forEach(retain);
  return client.getQueryCache().subscribe((event) => {
    if (event.type === "added") retain(event.query);
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function storedState(data: unknown, updatedAt: number) {
  return {
    data,
    dataUpdateCount: 1,
    dataUpdatedAt: updatedAt,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: true,
    status: "success" as const,
    fetchStatus: "idle" as const,
  };
}

/** Rebuild state, never trust serialized promises, errors, mutations, hashes or runtime metadata. */
export function decodeCache(
  text: string,
  owner: CacheOwner,
  now = Date.now(),
): PersistedClient | undefined {
  if (text.length * 3 > CACHE_MAX_BYTES) return undefined;
  const input: unknown = JSON.parse(text);
  if (
    !record(input) ||
    input.buster !== CACHE_BUSTER ||
    typeof input.timestamp !== "number" ||
    !Number.isFinite(input.timestamp) ||
    input.timestamp <= 0 ||
    input.timestamp > now ||
    now - input.timestamp > CACHE_MAX_AGE ||
    !record(input.clientState) ||
    !Array.isArray(input.clientState.queries) ||
    input.clientState.queries.length > CACHE_MAX_QUERIES
  )
    return undefined;
  const queries: PersistedClient["clientState"]["queries"] = [];
  for (const value of input.clientState.queries) {
    if (record(value) && Array.isArray(value.queryKey) && isRetiredActivityFeed(value.queryKey))
      continue;
    if (
      !record(value) ||
      !Array.isArray(value.queryKey) ||
      !ownsPersistedQuery(value.queryKey, owner) ||
      !record(value.state) ||
      value.state.data === undefined ||
      typeof value.state.dataUpdatedAt !== "number" ||
      !Number.isFinite(value.state.dataUpdatedAt) ||
      value.state.dataUpdatedAt <= 0 ||
      value.state.dataUpdatedAt > now
    )
      return undefined;
    if (now - value.state.dataUpdatedAt > CACHE_MAX_AGE) continue;
    queries.push({
      queryKey: value.queryKey,
      queryHash: hashKey(value.queryKey),
      state: storedState(value.state.data, value.state.dataUpdatedAt),
    });
  }
  return {
    timestamp: input.timestamp,
    buster: CACHE_BUSTER,
    clientState: { mutations: [], queries },
  };
}

/** TanStack timestamp arbitration also handles late disk reads after the splash deadline. */
export function restoreSessionCache(
  client: QueryClient,
  saved: PersistedClient,
  removed: ReadonlySet<string>,
) {
  const queries = saved.clientState.queries.flatMap((row) => {
    const current = client.getQueryState(row.queryKey);
    if (removed.has(row.queryHash) || communityAccessDenied(current?.error)) return [];
    return [
      {
        ...row,
        state:
          current?.status === "error"
            ? {
                ...row.state,
                ...current,
                data: row.state.data,
                dataUpdatedAt: row.state.dataUpdatedAt,
                isInvalidated: true,
              }
            : row.state,
      },
    ];
  });
  hydrate(client, { mutations: [], queries });
}

export function createSessionPersister(
  client: QueryClient,
  owner: CacheOwner,
  storage: CacheStorage,
  onError: () => void,
): Omit<Persister, "restoreClient"> & {
  restoreClient(): PersistedClient | undefined;
  flush(): void;
  schedule(): void;
  stop(): void;
} {
  let active = true,
    queued = false;
  const removeClient = () => {
    if (active) storage.remove(SNAPSHOT);
  };
  const flush = () => {
    if (!active) return;
    queued = false;
    try {
      const now = Date.now();
      const state = dehydrate(client, {
        shouldDehydrateMutation: () => false,
        shouldDehydrateQuery: (query) =>
          ownsPersistedQuery(query.queryKey, owner) &&
          query.state.data !== undefined &&
          query.state.dataUpdatedAt > 0 &&
          now - query.state.dataUpdatedAt <= CACHE_MAX_AGE &&
          !communityAccessDenied(query.state.error),
      });
      const queries = state.queries.flatMap((query) => {
        const data = optimisticBaseData(client, query.queryKey);
        return data === undefined
          ? []
          : [
              {
                queryKey: query.queryKey,
                queryHash: query.queryHash,
                // Preserve Query timestamps, but force revalidation; cache metadata is never an ACK.
                state: storedState(data, query.state.dataUpdatedAt),
              },
            ];
      });
      queries.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
      queries.splice(CACHE_MAX_QUERIES);
      let value: string;
      // ponytail: bounded whole-cache snapshots; use indexed entries only if serialization is measured costly.
      do {
        value = JSON.stringify({
          timestamp: Date.now(),
          buster: CACHE_BUSTER,
          clientState: { mutations: [], queries },
        });
        if (value.length * 3 <= CACHE_MAX_BYTES) break;
        queries.pop();
      } while (queries.length);
      if (value.length * 3 <= CACHE_MAX_BYTES) storage.set(SNAPSHOT, value);
      else removeClient();
    } catch {
      onError();
    }
  };
  const schedule = () => {
    if (!active || queued) return;
    queued = true;
    // Allow the optimistic journal to publish its authoritative base first; no timed debounce.
    queueMicrotask(flush);
  };
  return {
    persistClient: schedule,
    restoreClient: () => {
      if (!active) return undefined;
      try {
        const text = storage.getString(SNAPSHOT);
        if (!text) return undefined;
        const value = decodeCache(text, owner);
        if (!value) removeClient();
        return value;
      } catch {
        try {
          removeClient();
        } catch {
          /* RAM/network remain usable. */
        }
        onError();
        return undefined;
      }
    },
    removeClient,
    flush,
    schedule,
    stop: () => {
      active = false;
    },
  };
}
