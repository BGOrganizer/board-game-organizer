import type { NotificationListResponse } from "@board-game-organizer/schemas";
import type { InfiniteData } from "@tanstack/react-query";

/** A single owner's notification writes share a counter and are serialized. */
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
      notifications:
        action === "delete"
          ? page.notifications.filter((row) => row.id !== id)
          : page.notifications.map((row) =>
              !id || row.id === id ? { ...row, readAt: row.readAt ?? readAt } : row,
            ),
    })),
  };
}
