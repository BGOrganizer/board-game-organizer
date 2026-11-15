import type {
  NotificationAttentionReference,
  NotificationDto,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import type { InfiniteData } from "@tanstack/react-query";
import { emptyAttentionSummary, subtractAttention } from "./notificationAttention";

/** Missing policy metadata in restored/older inboxes never grants permission to consume a decision. */
export function notificationReadProtected(row: Pick<NotificationDto, "kind" | "requiresResponse">) {
  return (
    row.requiresResponse === true ||
    (row.requiresResponse === undefined &&
      [
        "group_invitation",
        "table_invitation",
        "group_membership_requested",
        "group_review_requested",
        "event_agreement_ready",
        "event_proposal_created",
      ].includes(row.kind))
  );
}

/** Project owned inboxes and bell counters without creating missing cache data. */
export function optimisticNotificationData(
  data: unknown,
  action: "read" | "delete",
  id: string | undefined,
  readAt: string,
  knownUnread: boolean,
  wasLoaded = false,
  reference?: NotificationAttentionReference,
): unknown {
  if (!data) return data;
  const current = data as InfiniteData<NotificationListResponse>;
  const item = current.pages.flatMap((page) => page.notifications).find((row) => row.id === id);
  if (action === "read" && item && notificationReadProtected(item)) return data;
  const unread = item ? !item.readAt : knownUnread && !wasLoaded;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      unreadCount: id
        ? Math.max(0, page.unreadCount - Number(unread))
        : action === "read"
          ? page.unreadCount
          : 0,
      ...(page.attention
        ? {
            attention: !id
              ? action === "read"
                ? page.attention
                : emptyAttentionSummary()
              : reference && unread
                ? subtractAttention(page.attention, reference, 1)
                : page.attention,
          }
        : {}),
      nextCursor: action === "delete" && !id ? null : page.nextCursor,
      notifications:
        action === "delete"
          ? page.notifications.filter((row) => id && row.id !== id)
          : page.notifications.map((row) =>
              (!id || row.id === id) && !notificationReadProtected(row)
                ? { ...row, readAt: row.readAt ?? readAt }
                : row,
            ),
    })),
  };
}
