import { notifyManager, type QueryClient } from "@tanstack/react-query";
import {
  cancelOptimisticResource,
  optimisticBaseData,
  updateOptimisticBase,
} from "../common/optimisticOperation";
import {
  belongsToDeletedGroup,
  cachedGroupEventIds,
  removeDeletedGroupData,
} from "./groupDeletionCache";

/** Apply verified access loss only to this API/actor; retain authorized public basics. */
export function revokeCachedGroupAccess(
  client: QueryClient,
  owner: { apiUrl: string; userId?: string | null },
  groupId: string,
  keepBasic: boolean,
) {
  const owned = client.getQueryCache().findAll({
    predicate: (query) =>
      query.queryKey[1] === owner.apiUrl &&
      query.queryKey[2] === owner.userId &&
      ["groups", "events", "tables"].includes(String(query.queryKey[0])),
  });
  const eventIds = new Set(
    owned
      .filter((query) => query.queryKey[0] !== "groups")
      .flatMap((query) => cachedGroupEventIds(optimisticBaseData(client, query.queryKey), groupId)),
  );
  notifyManager.batch(() => {
    for (const id of eventIds)
      cancelOptimisticResource(client, ["events", owner.apiUrl, owner.userId, id]);
    for (const query of owned) {
      const key = query.queryKey;
      if (key[0] === "groups") {
        if (key[3] === "list") {
          if (!keepBasic || key[4] === "mine")
            updateOptimisticBase(client, key, (data) =>
              removeDeletedGroupData(data, groupId, eventIds),
            );
        } else if (key[4] === groupId && (!keepBasic || key[3] !== "detail"))
          client.removeQueries({ queryKey: key, exact: true });
        continue;
      }
      const scope = key[4];
      if (
        (typeof scope === "string" && eventIds.has(scope)) ||
        (scope && typeof scope === "object" && "groupId" in scope && scope.groupId === groupId) ||
        belongsToDeletedGroup(query.state.data, groupId, eventIds)
      )
        client.removeQueries({ queryKey: key, exact: true });
      else
        updateOptimisticBase(client, key, (data) =>
          removeDeletedGroupData(data, groupId, eventIds),
        );
    }
  });
}
