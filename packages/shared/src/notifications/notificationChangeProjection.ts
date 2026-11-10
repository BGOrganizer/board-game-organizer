import type {
  NotificationChangeReference,
  NotificationChangesPage,
} from "@board-game-organizer/schemas";
import type { InfiniteData } from "@tanstack/react-query";

export function sameNotificationChange(
  a: NotificationChangeReference,
  b: NotificationChangeReference,
) {
  return (
    a.notificationId === b.notificationId &&
    a.itemId === b.itemId &&
    a.revision === b.revision &&
    a.effectiveAt === b.effectiveAt
  );
}
/** Only captured rows are projected. Source-complete counts await the authoritative read/refetch. */
export function projectNotificationChanges(
  data: unknown,
  references: readonly NotificationChangeReference[],
): unknown {
  if (!data) return data;
  const current = data as InfiniteData<NotificationChangesPage>;
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      changes: page.changes.filter(
        (row) =>
          row.requiresResponse ||
          !references.some((reference) => sameNotificationChange(row.readReference, reference)),
      ),
    })),
  };
}
/** Retained pages are not a rendering budget: visit only the last three revealed pages. */
export function notificationChangesWindow(pages: readonly NotificationChangesPage[], end: number) {
  const rows: NotificationChangesPage["changes"] = [];
  for (let index = Math.max(0, end - 2); index <= end && index < pages.length; index++) {
    for (const row of pages[index].changes) {
      if (rows.length === 50) return rows;
      rows.push(row);
    }
  }
  return rows;
}
