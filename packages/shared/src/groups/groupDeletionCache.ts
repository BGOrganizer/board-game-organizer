import type { CommunityPageResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
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
  if (typeof row.resourceHref !== "string") return false;
  const [, section, resource] = row.resourceHref.split(/[?#]/)[0].split("/");
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
