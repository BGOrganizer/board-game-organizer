import type {
  NotificationAttentionReference,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
  NotificationChangesPage,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import type { InfiniteData, QueryClient, QueryKey } from "@tanstack/react-query";
import type { CommunityApiOptions } from "../community/communityApi";
import {
  attentionKey,
  attentionMatches,
  attentionReference,
  projectAttentionSnapshot,
  subtractAttention,
} from "./notificationAttention";

export const attentionRoot = (o: Pick<CommunityApiOptions, "apiUrl" | "userId">) =>
  ["notification-attention", o.apiUrl, o.userId] as const;
export const notificationFilters = (o: Pick<CommunityApiOptions, "apiUrl" | "userId">) => ({
  predicate: ({ queryKey }: { queryKey: QueryKey }) =>
    ["notifications", "notification-attention", "notification-changes"].includes(
      String(queryKey[0]),
    ) &&
    queryKey[1] === o.apiUrl &&
    queryKey[2] === o.userId,
});
export function cachedAttention(
  client: QueryClient,
  o: Pick<CommunityApiOptions, "apiUrl" | "userId">,
  target: NotificationAttentionTarget,
) {
  return client
    .getQueryCache()
    .findAll({ queryKey: attentionRoot(o) })
    .map((query) => {
      const snapshot = query.state.data as NotificationAttentionSnapshot | undefined;
      return {
        snapshot,
        row: snapshot?.targets.find((row) => attentionKey(row.target) === attentionKey(target)),
        updatedAt: query.state.dataUpdatedAt,
      };
    })
    .filter(
      (
        value,
      ): value is {
        snapshot: NotificationAttentionSnapshot;
        row: NotificationAttentionSnapshot["targets"][number];
        updatedAt: number;
      } => Boolean(value.snapshot && value.row),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
function genericInformation(notification: NotificationListResponse["notifications"][number]) {
  return (
    notification.attentionItems === undefined &&
    !notification.attention?.itemIds?.length &&
    notification.kind !== "group_invitation" &&
    notification.kind !== "table_invitation" &&
    !notification.requiresResponse &&
    ![
      "group_membership_requested",
      "group_review_requested",
      "event_agreement_ready",
      "event_proposal_created",
    ].includes(notification.kind)
  );
}
/** Only actual shared source notices are dependencies; never serialize an owner's whole inbox. */
export function notificationReadAliases(
  client: QueryClient,
  o: CommunityApiOptions,
  target: NotificationAttentionTarget,
  through: string,
) {
  const aliases = client
    .getQueriesData<InfiniteData<NotificationListResponse>>({
      queryKey: ["notifications", o.apiUrl, o.userId],
    })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.notifications) ?? [])
    .filter(
      (notification) =>
        !notification.readAt &&
        Date.parse(notification.createdAt) <= Date.parse(through) &&
        (target.kind === "item" || genericInformation(notification)) &&
        attentionMatches(attentionReference(notification), target, true),
    )
    .map((notification) => ["notifications", o.apiUrl, o.userId, "item", notification.id]);
  if (target.kind === "item")
    for (const [, data] of client.getQueriesData<InfiniteData<NotificationChangesPage>>({
      queryKey: ["notification-changes", o.apiUrl, o.userId],
    }))
      for (const page of data?.pages ?? [])
        for (const row of page.changes)
          if (row.itemId === target.id && row.effectiveAt <= through)
            aliases.push(["notifications", o.apiUrl, o.userId, "item", row.notificationId]);
  return aliases;
}
export function projectAttentionRead(
  data: unknown,
  key: QueryKey,
  reference: NotificationAttentionReference,
  count: number,
  through: string,
  readAt: string,
): unknown {
  if (!data || key[0] === "notification-changes") return data;
  if (key[0] === "notification-attention")
    return projectAttentionSnapshot(data as NotificationAttentionSnapshot, reference, count);
  const inbox = data as InfiniteData<NotificationListResponse>;
  return {
    ...inbox,
    pages: inbox.pages.map((page) => ({
      ...page,
      unreadCount: Math.max(0, page.unreadCount - count),
      ...(page.attention ? { attention: subtractAttention(page.attention, reference, count) } : {}),
      notifications: page.notifications.map((notification) =>
        Date.parse(notification.createdAt) <= Date.parse(through) &&
        genericInformation(notification) &&
        attentionMatches(attentionReference(notification), reference.target, true)
          ? { ...notification, readAt: notification.readAt ?? readAt }
          : notification,
      ),
    })),
  };
}
