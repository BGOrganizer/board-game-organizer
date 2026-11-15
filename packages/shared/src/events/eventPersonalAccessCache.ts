import { hashKey, notifyManager, type QueryClient, type QueryKey } from "@tanstack/react-query";
import {
  cancelOptimisticResource,
  optimisticBaseData,
  updateOptimisticBase,
} from "../common/optimisticOperation";
import { CommunityApiError } from "../community/communityApi";
import {
  isUnclassifiedEventRead,
  removeRevokedGroupData,
  revokeCachedGroupAccess,
} from "../groups/groupAccessCache";
import { belongsToDeletedGroup } from "../groups/groupDeletionCache";
import { revokeProposalReview } from "./eventProposalCache";

type Owner = { apiUrl: string; userId?: string | null };
type Snapshot = { queryKey: QueryKey; state: { data: unknown } };
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!record(value)) return [];
  const children = Array.isArray(value.pages)
    ? value.pages
    : Array.isArray(value.items)
      ? value.items
      : [];
  return [value, ...children.flatMap(rows)];
}
function independent(value: unknown) {
  return record(value) && (value.personalAccessOnly === true || value.sharedResultsOnly === true);
}
function owned(key: QueryKey, owner: Owner) {
  return (
    key[1] === owner.apiUrl &&
    key[2] === owner.userId &&
    (["events", "groups", "tables"].includes(String(key[0])) ||
      (key[0] === "profile" && ["activities", "network"].includes(String(key[3]))))
  );
}
function vulnerableRead(key: QueryKey, eventIds: ReadonlySet<string>) {
  return (
    eventIds.has(String(key[4])) ||
    (key[3] === "list" && (!record(key[4]) || !key[4].groupId)) ||
    (key[3] === "tables" && key[4] === null)
  );
}
function revocationScope(personal: Record<string, unknown>[], snapshots: Snapshot[]) {
  const eventIds = new Set(
    personal.flatMap((row) =>
      typeof row.eventId === "string" ? [row.eventId] : typeof row.id === "string" ? [row.id] : [],
    ),
  );
  const groups = new Set(
    personal.flatMap((row) =>
      typeof row.accessRevokedGroupId === "string" ? [row.accessRevokedGroupId] : [],
    ),
  );
  for (const {
    queryKey: key,
    state: { data },
  } of snapshots) {
    const scoped = typeof key[4] === "string" && eventIds.has(key[4]);
    if (scoped && key[3] === "proposals" && typeof key[6] === "string") groups.add(key[6]);
    if (scoped && key[3] === "participants" && key[6] === "review" && typeof key[7] === "string")
      groups.add(key[7]);
    for (const row of rows(data))
      if (
        typeof row.groupId === "string" &&
        (scoped || eventIds.has(String(row.id)) || eventIds.has(String(row.eventId)))
      )
        groups.add(row.groupId);
  }
  return { eventIds, groups };
}
function privilegedScope(
  key: QueryKey,
  eventIds: ReadonlySet<string>,
  groups: ReadonlySet<string>,
) {
  const list = ["list", "tables"].includes(String(key[3]));
  const groupScope =
    typeof key[4] === "object" && key[4] && "groupId" in key[4] ? key[4].groupId : key[4];
  return (
    (!list && key[0] === "events" && eventIds.has(String(key[4]))) ||
    groups.has(String(groupScope)) ||
    groups.has(String(key[6])) ||
    groups.has(String(key[7]))
  );
}
function revokedData(
  data: unknown,
  key: QueryKey,
  eventIds: ReadonlySet<string>,
  groups: ReadonlySet<string>,
) {
  if (independent(data)) return data;
  if (privilegedScope(key, eventIds, groups)) return undefined;
  const list = ["list", "tables"].includes(String(key[3]));
  if (
    !list &&
    (eventIds.has(String(record(data) && data.id)) ||
      eventIds.has(String(record(data) && data.eventId)))
  )
    return undefined;
  for (const group of groups) {
    if (!list && belongsToDeletedGroup(data, group, eventIds)) return undefined;
    data = removeRevokedGroupData(data, group, eventIds);
  }
  return removeRevokedGroupData(data, "", eventIds);
}

/** Filter delayed disk restoration before hydrate can publish any formerly privileged bytes.
 * Only current authoritative journal bases constrain the same API/actor's saved queries.
 */
export function filterPersonalEventAccessRestore<T extends Snapshot>(
  client: QueryClient,
  saved: readonly T[],
): T[] {
  let filtered = [...saved];
  for (const query of client.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (key[0] !== "events" || typeof key[1] !== "string") continue;
    const personal = rows(optimisticBaseData(client, key)).filter(
      (row) => row.personalAccessOnly === true,
    );
    if (!personal.length) continue;
    const owner = { apiUrl: key[1], userId: key[2] as string | null | undefined };
    const current = client
      .getQueryCache()
      .getAll()
      .filter((q) => owned(q.queryKey, owner))
      .map((q) => ({
        queryKey: q.queryKey,
        state: { data: optimisticBaseData(client, q.queryKey) },
      }));
    const { eventIds, groups } = revocationScope(personal, [
      ...current,
      ...filtered.filter((row) => owned(row.queryKey, owner)),
    ]);
    filtered = filtered.flatMap((row) => {
      if (!owned(row.queryKey, owner)) return [row];
      // Pruning/journal reconciliation deliberately preserves GET timestamps. A disk snapshot
      // with a higher timestamp must not overwrite this newer authority-restricted base.
      if (hashKey(row.queryKey) === hashKey(key)) return [];
      const data = revokedData(row.state.data, row.queryKey, eventIds, groups);
      return data === undefined ? [] : [{ ...row, state: { ...row.state, data } }];
    });
  }
  return filtered;
}

/** A verified personal response revokes older privileged projections, never unrelated owners/data. */
export function reconcilePersonalEventAccess(
  client: QueryClient,
  owner: Owner,
  result: unknown,
  key: QueryKey,
  pageParam?: string,
) {
  const personal = rows(result).filter((row) => row.personalAccessOnly === true);
  if (!personal.length) return;
  const queries = client
    .getQueryCache()
    .findAll({ predicate: (query) => owned(query.queryKey, owner) });
  const snapshots = queries.map((query) => ({
    queryKey: query.queryKey,
    state: { data: optimisticBaseData(client, query.queryKey) },
  }));
  const { eventIds, groups } = revocationScope(personal, snapshots);
  // Cancellation must also cover cold writers with no materialized Query data.
  for (const id of eventIds)
    cancelOptimisticResource(client, ["events", owner.apiUrl, owner.userId, id]);
  for (const group of groups)
    cancelOptimisticResource(client, ["groups", owner.apiUrl, owner.userId, group]);
  const unsafe = queries.some((query) => {
    const data = optimisticBaseData(client, query.queryKey);
    return (
      revokedData(data, query.queryKey, eventIds, groups) !== data ||
      (query.state.fetchStatus === "fetching" &&
        (privilegedScope(query.queryKey, eventIds, groups) ||
          vulnerableRead(query.queryKey, eventIds) ||
          (groups.size > 0 && isUnclassifiedEventRead(client, query.queryKey))))
    );
  });
  if (!unsafe) return;
  notifyManager.batch(() => {
    for (const id of eventIds) revokeProposalReview(client, owner, { eventId: id }, key);
    for (const group of groups) {
      revokeProposalReview(client, owner, { groupId: group }, key);
      revokeCachedGroupAccess(client, owner, group, false, key);
    }
    for (const query of queries) {
      if (hashKey(query.queryKey) === hashKey(key)) continue;
      const base = optimisticBaseData(client, query.queryKey);
      const next = revokedData(base, query.queryKey, eventIds, groups);
      if (
        next !== base ||
        (query.state.fetchStatus === "fetching" &&
          (privilegedScope(query.queryKey, eventIds, groups) ||
            vulnerableRead(query.queryKey, eventIds)))
      ) {
        void client.cancelQueries({ queryKey: query.queryKey, exact: true });
        if (next === undefined) {
          query.setState({
            data: undefined,
            dataUpdatedAt: 0,
            error: new CommunityApiError(403, "EVENT_PERSONAL_ACCESS_ONLY"),
            status: "error",
          });
          client.removeQueries({ queryKey: query.queryKey, exact: true });
        } else {
          updateOptimisticBase(client, query.queryKey, (data) =>
            revokedData(data, query.queryKey, eventIds, groups),
          );
          void client.invalidateQueries({
            queryKey: query.queryKey,
            exact: true,
            refetchType: "none",
          });
        }
      }
    }
    // An enclosing infinite fetch captured older pages; cancel before replacing its base.
    void client.cancelQueries({ queryKey: key, exact: true });
    let data = optimisticBaseData(client, key);
    for (const group of groups) data = removeRevokedGroupData(data, group, eventIds);
    data = removeRevokedGroupData(data, "", eventIds);
    if (pageParam !== undefined) {
      const pages = record(data) && Array.isArray(data.pages) ? [...data.pages] : [];
      const pageParams = record(data) && Array.isArray(data.pageParams) ? [...data.pageParams] : [];
      const index = pageParams.indexOf(pageParam);
      if (index < 0) {
        pages.push(result);
        pageParams.push(pageParam);
      } else pages[index] = result;
      updateOptimisticBase(client, key, () => ({ pages, pageParams }));
    } else updateOptimisticBase(client, key, () => result);
    void client.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
  });
}
