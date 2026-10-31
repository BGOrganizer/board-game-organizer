import type { NotificationListResponse } from "@board-game-organizer/schemas";
import type { InfiniteData } from "@tanstack/react-query";

/** Project owned inboxes and bell counters without creating missing cache data. */
export function optimisticNotificationData(
  data: unknown,
  action: "read" | "delete",
  id: string | undefined,
  readAt: string,
  knownUnread: boolean,
  wasLoaded = false,
): unknown {
  if (!data) return data;
  const current = data as InfiniteData<NotificationListResponse>;
  const item = current.pages.flatMap((page) => page.notifications).find((row) => row.id === id);
  const unread = item ? !item.readAt : knownUnread && !wasLoaded;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      unreadCount: id ? Math.max(0, page.unreadCount - Number(unread)) : 0,
      nextCursor: action === "delete" && !id ? null : page.nextCursor,
      notifications:
        action === "delete"
          ? page.notifications.filter((row) => id && row.id !== id)
          : page.notifications.map((row) =>
              !id || row.id === id ? { ...row, readAt: row.readAt ?? readAt } : row,
            ),
    })),
  };
}
