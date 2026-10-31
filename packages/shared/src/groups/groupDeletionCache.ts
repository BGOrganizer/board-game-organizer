import type {
  CommunityPageResponse,
  GroupRecordResponse,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import type { InfiniteData } from "@tanstack/react-query";

type GroupPages = InfiniteData<CommunityPageResponse<GroupRecordResponse>>;
function paged(data: unknown): data is GroupPages {
  return Boolean(
    data &&
      typeof data === "object" &&
      "pages" in data &&
      Array.isArray(data.pages) &&
      data.pages.every((page) => page && Array.isArray(page.items)) &&
      "pageParams" in data &&
      Array.isArray(data.pageParams),
  );
}
function inbox(data: unknown): data is InfiniteData<NotificationListResponse> {
  const pages = data && typeof data === "object" && "pages" in data ? data.pages : null;
  return Boolean(
    Array.isArray(pages) &&
      pages.every((page) => page && Array.isArray(page.notifications)) &&
      data &&
      typeof data === "object" &&
      "pageParams" in data &&
      Array.isArray(data.pageParams),
  );
}
/** Discover only already-cached Events/Tables; never fetch or scan additional pages. */
export function cachedGroupEventIds(data: unknown, groupId: string): string[] {
  const rows: unknown[] = paged(data) ? data.pages.flatMap((page) => page.items) : [data];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object" || !("groupId" in value) || value.groupId !== groupId)
      return [];
    if ("eventId" in value && typeof value.eventId === "string") return [value.eventId];
    return "dates" in value && "id" in value && typeof value.id === "string" ? [value.id] : [];
  });
}
/** Only use for the deleting actor's Group/Event/Table/notification cache scopes. */
export function belongsToDeletedGroup(value: unknown, id: string, eventIds: ReadonlySet<string>) {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.id === id || row.groupId === id) return true;
  if (
    (typeof row.id === "string" && eventIds.has(row.id)) ||
    (typeof row.eventId === "string" && eventIds.has(row.eventId))
  )
    return true;
  const href = typeof row.href === "string" ? row.href : row.resourceHref;
  if (typeof href !== "string") return false;
  const [, section, resource] = href.split(/[?#]/)[0].split("/");
  return (
    ((section === "groups" || section === "moderation") && resource === id) ||
    (section === "events" && eventIds.has(resource ?? ""))
  );
}
export function removeDeletedGroupData(
  data: unknown,
  id: string,
  eventIds: ReadonlySet<string>,
): unknown {
  if (inbox(data)) {
    const unread = new Set(
      data.pages.flatMap((page) =>
        page.notifications
          .filter((row) => !row.readAt && belongsToDeletedGroup(row, id, eventIds))
          .map((row) => row.id),
      ),
    ).size;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        notifications: page.notifications.filter(
          (row) => !belongsToDeletedGroup(row, id, eventIds),
        ),
        unreadCount: Math.max(0, page.unreadCount - unread),
      })),
    };
  }
  if (!paged(data)) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((row) => !belongsToDeletedGroup(row, id, eventIds)),
    })),
  };
}
/** Restore only the removed Group, retaining other edits, later pages and newer detail versions. */
export function restoreDeletedGroup(
  current: unknown,
  before: unknown,
  id: string,
  latest?: GroupRecordResponse,
): unknown {
  if (
    !paged(current) ||
    !paged(before) ||
    current.pages.some((page) => page.items.some((row) => row.id === id))
  )
    return current;
  return {
    ...current,
    pages: current.pages.map((page, pageIndex) => {
      const oldIndex = before.pageParams.indexOf(current.pageParams[pageIndex]);
      const old = before.pages[oldIndex];
      const position = old?.items.findIndex((row) => row.id === id) ?? -1;
      if (position < 0) return page;
      const previous = old.items[position];
      const restored = latest && latest.version >= previous.version ? latest : previous;
      return {
        ...page,
        items: [...page.items.slice(0, position), restored, ...page.items.slice(position)],
      };
    }),
  };
}
