import type { CommunityPageResponse } from "@board-game-organizer/schemas";
import { type InfiniteData, replaceEqualDeep } from "@tanstack/react-query";

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
