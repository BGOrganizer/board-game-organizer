import { hashKey, notifyManager, type QueryClient, type QueryKey } from "@tanstack/react-query";
import {
  cancelOptimisticResource,
  optimisticBaseData,
  updateOptimisticBase,
} from "../common/optimisticOperation";
import { CommunityApiError } from "../community/communityApi";
import {
  belongsToDeletedGroup,
  cachedGroupEventIds,
  removeDeletedGroupData,
} from "./groupDeletionCache";

/** Revocation removes private rows, not independently authorized frozen/shared projections. */
export function removeRevokedGroupData(
  data: unknown,
  groupId: string,
  eventIds: ReadonlySet<string>,
): unknown {
  if (!data || typeof data !== "object") return data;
  if ("pages" in data && Array.isArray(data.pages)) {
    const previous = data.pages;
    const pages = previous.map((page) => removeRevokedGroupData(page, groupId, eventIds));
    return pages.some((page, index) => page !== previous[index]) ? { ...data, pages } : data;
  }
  if (!("items" in data) || !Array.isArray(data.items)) return data;
  const items = data.items.filter(
    (row: unknown) =>
      (row &&
        typeof row === "object" &&
        (("personalAccessOnly" in row && row.personalAccessOnly === true) ||
          ("sharedResultsOnly" in row && row.sharedResultsOnly === true))) ||
      !belongsToDeletedGroup(row, groupId, eventIds),
  );
  return items.length === data.items.length ? data : { ...data, items };
}
function hasEventScope(data: unknown, eventId: string, scoped: boolean): boolean {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  if (
    row.personalAccessOnly !== true &&
    row.sharedResultsOnly !== true &&
    (scoped || row.id === eventId || row.eventId === eventId) &&
    (typeof row.groupId === "string" || row.groupId === null)
  )
    return true;
  const children = Array.isArray(row.pages) ? row.pages : Array.isArray(row.items) ? row.items : [];
  return children.some((child) => hasEventScope(child, eventId, scoped));
}
/** An Event ID alone cannot exempt a delayed read from a Group authority loss. */
export function isUnclassifiedEventRead(client: QueryClient, key: QueryKey): boolean {
  if (key[0] !== "events" || key[3] === "list" || typeof key[4] !== "string") return false;
  if (
    (key[3] === "proposals" && typeof key[6] === "string") ||
    (key[3] === "participants" && key[6] === "review" && typeof key[7] === "string")
  )
    return false;
  const id = key[4];
  return !client
    .getQueryCache()
    .findAll({ queryKey: key.slice(0, 3) })
    .some((query) =>
      hasEventScope(optimisticBaseData(client, query.queryKey), id, query.queryKey[4] === id),
    );
}

/** Apply verified access loss only to this API/actor; retain authorized public basics. */
export function revokeCachedGroupAccess(
  client: QueryClient,
  owner: { apiUrl: string; userId?: string | null },
  groupId: string,
  keepBasic: boolean,
  keepKey?: QueryKey,
) {
  const owned = client.getQueryCache().findAll({
    predicate: (query) =>
      query.queryKey[1] === owner.apiUrl &&
      query.queryKey[2] === owner.userId &&
      (["groups", "events", "tables"].includes(String(query.queryKey[0])) ||
        (query.queryKey[0] === "profile" &&
          ["activities", "network"].includes(String(query.queryKey[3])))),
  });
  const eventIds = new Set(
    owned
      .filter((query) => query.queryKey[0] !== "groups")
      .flatMap((query) => {
        const data = optimisticBaseData(client, query.queryKey),
          key = query.queryKey;
        return [
          ...cachedGroupEventIds(data, groupId),
          ...(key[0] === "events" &&
          key[3] === "proposals" &&
          key[6] === groupId &&
          typeof key[4] === "string"
            ? [key[4]]
            : []),
          ...(key[0] === "events" &&
          key[3] === "participants" &&
          typeof key[4] === "string" &&
          (belongsToDeletedGroup(data, groupId, new Set()) ||
            (key[6] === "review" && key[7] === groupId))
            ? [key[4]]
            : []),
        ];
      }),
  );
  notifyManager.batch(() => {
    cancelOptimisticResource(client, ["groups", owner.apiUrl, owner.userId, groupId]);
    // Unscoped lists can acquire revoked rows even when their current page is unrelated.
    // Do not interrupt another Group/Event's independently scoped detail read.
    const fetching = owned.filter((query) => {
      const key = query.queryKey;
      return (
        query.state.fetchStatus === "fetching" &&
        (!keepKey || hashKey(key) !== hashKey(keepKey)) &&
        (key[4] === groupId ||
          eventIds.has(String(key[4])) ||
          key[6] === groupId ||
          key[7] === groupId ||
          (key[4] &&
            typeof key[4] === "object" &&
            "groupId" in key[4] &&
            key[4].groupId === groupId) ||
          belongsToDeletedGroup(optimisticBaseData(client, key), groupId, eventIds) ||
          isUnclassifiedEventRead(client, key) ||
          (key[3] === "list" &&
            (!key[4] || typeof key[4] !== "object" || !("groupId" in key[4]) || !key[4].groupId)) ||
          (key[3] === "tables" && key[4] === null) ||
          (key[0] === "profile" && ["activities", "network"].includes(String(key[3]))))
      );
    });
    for (const query of fetching)
      void client.cancelQueries({ queryKey: query.queryKey, exact: true });
    for (const id of eventIds)
      cancelOptimisticResource(client, ["events", owner.apiUrl, owner.userId, id]);
    for (const query of owned) {
      const key = query.queryKey;
      if (
        (keepKey && hashKey(key) === hashKey(keepKey)) ||
        (query.state.data &&
          typeof query.state.data === "object" &&
          (("personalAccessOnly" in query.state.data &&
            query.state.data.personalAccessOnly === true) ||
            ("sharedResultsOnly" in query.state.data &&
              query.state.data.sharedResultsOnly === true)))
      )
        continue;
      const remove = () => {
        void client.cancelQueries({ queryKey: key, exact: true });
        query.setState({
          data: undefined,
          dataUpdatedAt: 0,
          error: new CommunityApiError(403, "GROUP_MEMBER_REQUIRED"),
          status: "error",
        });
        client.removeQueries({ queryKey: key, exact: true });
      };
      if (key[0] === "groups") {
        if (key[3] === "list") {
          if (!keepBasic || key[4] === "mine")
            updateOptimisticBase(client, key, (data) =>
              removeDeletedGroupData(data, groupId, eventIds),
            );
        } else if (key[4] === groupId && (!keepBasic || key[3] !== "detail")) remove();
        continue;
      }
      const scope = key[4];
      if (
        (key[3] !== "tables" && typeof scope === "string" && eventIds.has(scope)) ||
        (scope && typeof scope === "object" && "groupId" in scope && scope.groupId === groupId) ||
        key[6] === groupId ||
        key[7] === groupId ||
        belongsToDeletedGroup(optimisticBaseData(client, key), groupId, eventIds)
      )
        remove();
      else
        updateOptimisticBase(client, key, (data) =>
          removeRevokedGroupData(data, groupId, eventIds),
        );
    }
    for (const query of fetching)
      if (client.getQueryCache().find({ queryKey: query.queryKey, exact: true }) === query)
        void client.refetchQueries({ queryKey: query.queryKey, exact: true, type: "active" });
  });
}
