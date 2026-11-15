import type {
  NotificationAttentionSnapshot,
  NotificationAttentionSummary,
  NotificationChangesPage,
  NotificationChangesReceipt,
  NotificationListResponse,
  ReadNotificationChangesInput,
} from "@board-game-organizer/schemas";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";
import { attentionKey } from "./notificationAttention";
import { projectNotificationChanges } from "./notificationChangeProjection";

const minus = (before: number, after: number) => Math.max(0, before - after);
function subtractSummary(a: NotificationAttentionSummary, b: NotificationAttentionSummary) {
  return {
    tables: minus(a.tables, b.tables),
    events: minus(a.events, b.events),
    groups: minus(a.groups, b.groups),
    contacts: minus(a.contacts, b.contacts),
    sections: {
      connections: minus(a.sections.connections, b.sections.connections),
      requests: minus(a.sections.requests, b.sections.requests),
      search: minus(a.sections.search, b.sections.search),
    },
  };
}
function subtractTabs(
  a: NotificationChangesPage["tabCounts"],
  b: NotificationChangesPage["tabCounts"],
) {
  return {
    details: minus(a.details, b.details),
    members: minus(a.members, b.members),
    tables: minus(a.tables, b.tables),
    participants: minus(a.participants, b.participants),
  };
}
/** Same-transaction, same-eligibility-time union difference, never a sum of individual point effects. */
export function notificationChangesReadEffect(
  before: Pick<NotificationChangesReceipt, "snapshot" | "tabCounts">,
  after: Pick<NotificationChangesReceipt, "snapshot" | "tabCounts">,
): NotificationChangesReceipt["effects"] {
  return {
    unread: minus(before.snapshot.unreadCount, after.snapshot.unreadCount),
    summary: subtractSummary(before.snapshot.summary, after.snapshot.summary),
    tabCounts: subtractTabs(before.tabCounts, after.tabCounts),
    targets: before.snapshot.targets.map((row) => {
      const next = after.snapshot.targets.find(
        (value) => attentionKey(value.target) === attentionKey(row.target),
      );
      return {
        target: row.target,
        count: minus(row.count, next?.count ?? 0),
        direct: minus(row.direct, next?.direct ?? 0),
        events: minus(row.events, next?.events ?? 0),
      };
    }),
  };
}
/** Commit only this read's source-proven union delta, preserving disjoint committed decisions and later arrivals. */
export function reconcileNotificationChangesRead(
  data: unknown,
  key: QueryKey,
  receipt: NotificationChangesReceipt,
  input: ReadNotificationChangesInput,
): unknown {
  if (!data) return data;
  const effect = receipt.effects;
  if (key[0] === "notification-changes") {
    const current = projectNotificationChanges(
      data,
      receipt.readReferences,
    ) as InfiniteData<NotificationChangesPage>;
    if (key[3] !== input.scope.kind || key[4] !== input.scope.id) return current;
    return {
      ...current,
      pages: current.pages.map((page) =>
        page.asOf > receipt.snapshot.asOf
          ? page
          : {
              ...page,
              tabCounts: subtractTabs(page.tabCounts, effect.tabCounts),
            },
      ),
    };
  }
  if (key[0] === "notification-attention") {
    const snapshot = data as NotificationAttentionSnapshot;
    if (snapshot.asOf > receipt.snapshot.asOf) return data;
    return {
      ...snapshot,
      unreadCount: minus(snapshot.unreadCount, effect.unread),
      summary: subtractSummary(snapshot.summary, effect.summary),
      targets: snapshot.targets.map((row) => {
        const delta = effect.targets.find(
          (next) => attentionKey(next.target) === attentionKey(row.target),
        );
        return delta
          ? {
              ...row,
              count: minus(row.count, delta.count),
              direct: minus(row.direct, delta.direct),
              events: minus(row.events, delta.events),
            }
          : row;
      }),
    };
  }
  const current = data as InfiniteData<NotificationListResponse>;
  // A server refresh may already include this ACK or a newer revision of a selected point.
  // In that case retain its aggregates rather than subtracting twice; exact markers still reconcile.
  return {
    ...current,
    pages: current.pages.map((page) => {
      // Retained pages may represent different source snapshots. A refreshed later page
      // must not suppress the owned union effect on an older first-page/bell aggregate.
      const refreshedSelection = page.notifications.some((row) =>
        receipt.readReferences.some(
          (ref) =>
            ref.notificationId === row.id &&
            (Boolean(row.readAt) ||
              (!ref.itemId
                ? row.createdAt !== ref.effectiveAt
                : row.attentionItems?.some(
                    (item) =>
                      item.id === ref.itemId &&
                      (Boolean(item.readAt) ||
                        item.revision !== ref.revision ||
                        (item.changedAt ?? row.createdAt) !== ref.effectiveAt),
                  ))),
        ),
      );
      return {
        ...page,
        ...(!refreshedSelection
          ? {
              unreadCount: minus(page.unreadCount, effect.unread),
              ...(page.attention
                ? { attention: subtractSummary(page.attention, effect.summary) }
                : {}),
            }
          : {}),
        notifications: page.notifications.map((row) => {
          if (row.readAt || row.requiresResponse) return row;
          const references = receipt.readReferences.filter((ref) => ref.notificationId === row.id);
          if (!references.length) return row;
          const readAt = receipt.snapshot.asOf;
          if (!row.attentionItems?.length)
            return references.some((ref) => ref.effectiveAt === row.createdAt)
              ? { ...row, readAt }
              : row;
          const attentionItems = row.attentionItems.map((item) =>
            references.some(
              (ref) =>
                ref.itemId === item.id &&
                ref.revision === item.revision &&
                ref.effectiveAt === (item.changedAt ?? row.createdAt),
            )
              ? { ...item, readAt: item.readAt ?? readAt }
              : item,
          );
          return {
            ...row,
            attentionItems,
            readAt: attentionItems.every((item) => item.readAt) ? readAt : null,
          };
        }),
      };
    }),
  };
}
