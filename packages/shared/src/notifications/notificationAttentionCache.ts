import type {
  NotificationAttentionReference,
  NotificationAttentionSnapshot,
  NotificationAttentionTarget,
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
    ["notifications", "notification-attention"].includes(String(queryKey[0])) &&
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
export function projectAttentionRead(
  data: unknown,
  key: QueryKey,
  reference: NotificationAttentionReference,
  count: number,
  through: string,
  readAt: string,
): unknown {
  if (!data) return data;
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
        attentionMatches(attentionReference(notification), reference.target, true)
          ? { ...notification, readAt: notification.readAt ?? readAt }
          : notification,
      ),
    })),
  };
}
