import type {
  NotificationAttentionCount,
  NotificationAttentionSnapshot,
  NotificationAttentionSummary,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import { attentionKey } from "./notificationAttention";

function isSectionChild(id: string, section: string) {
  try {
    const [resource, scope, field] = JSON.parse(id) as [string, string, string];
    const [parentResource, parentScope, parentField, option] = JSON.parse(section) as [
      string,
      string,
      string,
      unknown,
    ];
    return (
      resource === parentResource &&
      scope === parentScope &&
      option === null &&
      ((field === "date" && parentField === "dates") ||
        (field === "location" && parentField === "locations") ||
        (field === "game" && parentField === "games"))
    );
  } catch {
    return false;
  }
}

function subtract(
  summary: NotificationAttentionSummary,
  delta: NotificationAttentionSummary,
): NotificationAttentionSummary {
  return {
    tables: Math.max(0, summary.tables - delta.tables),
    events: Math.max(0, summary.events - delta.events),
    groups: Math.max(0, summary.groups - delta.groups),
    contacts: summary.contacts,
    sections: summary.sections,
  };
}
/** Effects are source aggregates, not guesses from loaded inbox pages. */
export function projectNotificationItemRead(
  data: unknown,
  key: QueryKey,
  row: NotificationAttentionCount,
  through: string,
  readAt: string,
): unknown {
  const effect = row.readEffect;
  if (!data || !effect) return data;
  if (key[0] === "notification-attention") {
    const snapshot = data as NotificationAttentionSnapshot;
    return {
      ...snapshot,
      unreadCount: Math.max(0, snapshot.unreadCount - effect.unread),
      summary: subtract(snapshot.summary, effect.summary),
      targets: snapshot.targets.map((value) => {
        if (
          value.target.kind === "item" &&
          row.target.kind === "item" &&
          Date.parse(snapshot.asOf) <= Date.parse(through) &&
          isSectionChild(value.target.id, row.target.id)
        )
          return { ...value, count: 0, direct: 0 };
        const delta = effect.targets.find(
          (entry) => attentionKey(entry.target) === attentionKey(value.target),
        );
        return delta
          ? {
              ...value,
              count: Math.max(0, value.count - delta.count),
              direct: Math.max(0, value.direct - delta.direct),
              events: Math.max(0, value.events - delta.events),
            }
          : value;
      }),
    };
  }
  const inbox = data as InfiniteData<NotificationListResponse>;
  return {
    ...inbox,
    pages: inbox.pages.map((page) => ({
      ...page,
      unreadCount: Math.max(0, page.unreadCount - effect.unread),
      ...(page.attention ? { attention: subtract(page.attention, effect.summary) } : {}),
      notifications: page.notifications.map((notification) => {
        if (
          notification.readAt ||
          Date.parse(notification.createdAt) > Date.parse(through) ||
          !notification.attentionItems?.some(
            (item) =>
              (item.id === row.target.id || item.sectionId === row.target.id) && !item.readAt,
          )
        )
          return notification;
        const attentionItems = notification.attentionItems.map((item) =>
          item.id === row.target.id || item.sectionId === row.target.id
            ? { ...item, readAt }
            : item,
        );
        return {
          ...notification,
          attentionItems,
          readAt: attentionItems.every((item) => item.readAt) ? readAt : null,
        };
      }),
    })),
  };
}
