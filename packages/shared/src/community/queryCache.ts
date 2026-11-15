import type { CommunityPageResponse } from "@board-game-organizer/schemas";
import { hashKey, type InfiniteData, type QueryKey, replaceEqualDeep } from "@tanstack/react-query";

/** Call only for owned entity-detail or paginated-entity keys, not arbitrary Query caches. */
export function mapCommunityCache<T>(data: unknown, change: (row: T) => T): unknown {
  if (!data || typeof data !== "object") return data;
  if (!("pages" in data)) return change(data as T);
  if (!Array.isArray(data.pages)) return data;
  const pages = data as InfiniteData<CommunityPageResponse<T>>;
  return {
    ...pages,
    pages: pages.pages.map((page) => ({ ...page, items: page.items.map(change) })),
  };
}
/** Filter owned source pages without changing server cursors or unrelated page metadata. */
export function filterCommunityPages<T>(data: unknown, keep: (row: T) => boolean): unknown {
  if (!data || typeof data !== "object" || !("pages" in data) || !Array.isArray(data.pages))
    return data;
  const value = data as InfiniteData<CommunityPageResponse<T>>;
  return {
    ...value,
    pages: value.pages.map((page) => ({ ...page, items: page.items.filter(keep) })),
  };
}

/** Freeze only the rows known at mutation start; newer authoritative versions always win. */
export function versionedCommunityChange<T extends object>(
  change: (row: T, key: QueryKey) => T,
  identity: (row: T) => string,
) {
  const versions = new Map<string, Map<string, string>>();
  let capturing = true;
  function apply<R extends T>(
    data: unknown,
    key: QueryKey,
    transform: (row: R, key: QueryKey) => R,
  ): unknown {
    const query = hashKey(key);
    return mapCommunityCache<R>(data, (row) => {
      const record = row as Record<string, unknown>;
      const nestedVersion = (name: string) =>
        (record[name] as { version?: number } | null | undefined)?.version;
      const version = JSON.stringify([
        record.version ?? record.updatedAt,
        nestedVersion("membership"),
        nestedVersion("myMembership"),
        nestedVersion("myRegistration"),
        nestedVersion("registration"),
      ]);
      const id = identity(row);
      let known = versions.get(id);
      if (capturing) {
        if (!known) {
          known = new Map();
          versions.set(id, known);
        }
        known.set(query, version);
      } else if (known && !known.has(query) && [...known.values()].includes(version)) {
        // A newly opened view may project a known server snapshot, but a newer
        // version in an existing view must never inherit an older view's intent.
        known.set(query, version);
      }
      return known?.get(query) === version ? transform(row, key) : row;
    });
  }
  return {
    seal() {
      capturing = false;
    },
    change: (data: unknown, key: QueryKey) => apply(data, key, change),
    apply,
  };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype,
  );
}
/** Restore affected fields recursively; a newer authoritative entity version always wins. */
export function restoreCommunityFields<T extends object>(current: T, before: T, optimistic: T): T {
  if (
    "version" in before &&
    "version" in current &&
    "version" in optimistic &&
    before.version === optimistic.version &&
    current.version !== before.version
  )
    return current;
  if (
    "updatedAt" in before &&
    "updatedAt" in current &&
    "updatedAt" in optimistic &&
    before.updatedAt === optimistic.updatedAt &&
    current.updatedAt !== before.updatedAt
  )
    return current;
  const restored = { ...current };
  for (const key of Object.keys(optimistic) as Array<keyof T>) {
    const previous = before[key],
      pending = optimistic[key],
      value = current[key];
    if (Object.is(replaceEqualDeep(previous, pending), previous)) continue;
    if (plainRecord(value) && plainRecord(previous) && plainRecord(pending))
      restored[key] = restoreCommunityFields(value, previous, pending) as T[typeof key];
    else if (Object.is(replaceEqualDeep(value, pending), value)) restored[key] = previous;
  }
  return restored;
}
