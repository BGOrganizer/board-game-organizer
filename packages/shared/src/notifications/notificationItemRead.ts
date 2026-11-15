import type {
  NotificationAttentionCount,
  NotificationAttentionSnapshot,
  NotificationAttentionSummary,
  NotificationChangesPage,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import { attentionKey } from "./notificationAttention";
import { notificationChangeTab } from "./notificationChanges";

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
        (field === "game" && parentField === "games") ||
        (field === "member" && parentField === "members"))
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
  decision = false,
): unknown {
  const effect = row.readEffect;
  if (!data || !effect) return data;
  if (key[0] === "notification-changes") {
    if (!decision || row.target.kind !== "item") return data;
    const [kind, id] = JSON.parse(row.target.id) as ["group" | "event" | "table", string];
    const tab = notificationChangeTab({ kind, id }, "", row.target.id);
    const current = data as InfiniteData<NotificationChangesPage>;
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        changes: page.changes.filter(
          (change) => !(change.itemId === row.target.id && change.effectiveAt <= through),
        ),
        ...(tab && key[3] === kind && key[4] === id && page.asOf <= through
          ? {
              tabCounts: { ...page.tabCounts, [tab]: Math.max(0, page.tabCounts[tab] - row.count) },
            }
          : {}),
      })),
    };
  }
  if (key[0] === "notification-attention") {
    const snapshot = data as NotificationAttentionSnapshot;
    if (
      snapshot.targets.some(
        (value) =>
          attentionKey(value.target) === attentionKey(row.target) &&
          value.signal &&
          Date.parse(value.signal.slice(0, 24)) > Date.parse(through),
      )
    )
      return data;
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
  if (
    inbox.pages.some((page) =>
      page.notifications.some(
        (notification) =>
          !notification.readAt &&
          Date.parse(notification.createdAt) <= Date.parse(through) &&
          notification.attentionItems?.some(
            (item) =>
              !item.readAt &&
              (item.id === row.target.id || item.sectionId === row.target.id) &&
              Date.parse(item.changedAt ?? notification.createdAt) > Date.parse(through),
          ),
      ),
    )
  )
    return data;
  return {
    ...inbox,
    pages: inbox.pages.map((page) => ({
      ...page,
      unreadCount: Math.max(0, page.unreadCount - effect.unread),
      ...(page.attention ? { attention: subtract(page.attention, effect.summary) } : {}),
      notifications: page.notifications.map((notification) => {
        if (
          !notification.readAt &&
          !notification.attentionItems?.length &&
          Date.parse(notification.createdAt) <= Date.parse(through) &&
          notification.attention?.itemIds?.includes(row.target.id)
        )
          return { ...notification, readAt };
        if (
          notification.readAt ||
          Date.parse(notification.createdAt) > Date.parse(through) ||
          !notification.attentionItems?.some(
            (item) =>
              (item.id === row.target.id || item.sectionId === row.target.id) &&
              !item.readAt &&
              Date.parse(item.changedAt ?? notification.createdAt) <= Date.parse(through),
          )
        )
          return notification;
        const attentionItems = notification.attentionItems.map((item) =>
          (item.id === row.target.id || item.sectionId === row.target.id) &&
          Date.parse(item.changedAt ?? notification.createdAt) <= Date.parse(through)
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
