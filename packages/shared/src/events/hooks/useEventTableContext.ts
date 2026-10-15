"use client";

import { type CommunityApiOptions, communityAccessDenied } from "../../community/communityApi";
import { useEvent, useEventTable } from "./useEvents";
import { useEventWindow } from "./useEventWindow";

export function useEventTableContext(
  options: CommunityApiOptions,
  eventId: string,
  tableId: string,
) {
  const eventQuery = useEvent(options, eventId);
  const event =
    options.enabled === false || communityAccessDenied(eventQuery.error)
      ? undefined
      : eventQuery.data;
  const tableQuery = useEventTable(
    { ...options, enabled: options.enabled !== false && Boolean(event) },
    eventId,
    tableId,
  );
  const table = !event || communityAccessDenied(tableQuery.error) ? undefined : tableQuery.data;
  const open = useEventWindow(event);
  return { eventQuery, tableQuery, event, table, open };
}
