import type { QueryClient } from "@tanstack/react-query";
import { beginOptimisticOperation } from "../common/optimisticOperation";
import type { CommunityApiOptions } from "../community/communityApi";
import { attentionKey } from "./notificationAttention";
import {
  cachedAttention,
  notificationFilters,
  notificationReadAliases,
} from "./notificationAttentionCache";
import { projectNotificationItemRead } from "./notificationItemRead";

/** A consent decision can consume only its captured source point, including inactive container caches. */
export async function beginNotificationItemRead(
  client: QueryClient,
  options: CommunityApiOptions,
  itemId: string,
) {
  const target = { kind: "item", id: itemId } as const;
  const source = cachedAttention(client, options, target);
  if (!source?.row.count || !source.row.readEffect) return;
  const readAt = new Date().toISOString();
  const operation = await beginOptimisticOperation(
    client,
    ["notifications", options.apiUrl, options.userId, "target", attentionKey(target)],
    notificationFilters(options),
    (data, key) =>
      projectNotificationItemRead(data, key, source.row, source.snapshot.asOf, readAt, true),
    notificationReadAliases(client, options, target, source.snapshot.asOf),
  );
  return { operation, through: source.snapshot.asOf };
}
