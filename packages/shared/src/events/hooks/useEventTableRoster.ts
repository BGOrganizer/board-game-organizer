"use client";
import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { useState } from "react";
import type { CommunityApiOptions } from "../../community/communityApi";
import { eventTableRoster } from "../eventTableRoster";
import { useTableSeats } from "./useEventRecords";
export function useEventTableRoster(o: CommunityApiOptions, table: PlannedTableResponse) {
  const [limit, setLimit] = useState(20);
  const accepted = useTableSeats(o, table.eventId, table.id);
  const pending = useTableSeats(
    {
      ...o,
      enabled:
        o.enabled !== false && table.eventStatus === "PLANNING" && table.adminUserId === o.userId,
    },
    table.eventId,
    table.id,
    true,
  );
  const ownerPending = table.eventStatus === "PLANNING" && table.adminUserId === o.userId;
  const pages = ownerPending ? [accepted, pending] : [accepted];
  const view = eventTableRoster(
    table,
    accepted.items,
    ownerPending ? pending.items : [],
    o.userId ?? "",
    limit,
  );
  const fetching = pages.some((page) => page.isFetchingNextPage);
  const failedPage = pages.some((page) => page.isFetchNextPageError);
  return {
    ...view,
    isPending: pages.some((page) => page.isPending && !page.data),
    isError: pages.some((page) => page.isError),
    isFetchingNextPage: fetching,
    isFetchNextPageError: failedPage,
    hasNextPage: pages.some((page) => page.hasNextPage) || view.total > limit,
    refetch: () => {
      for (const page of pages) if (page.isError) void page.refetch();
    },
    more: () => {
      if (fetching) return;
      const page = pages.find((page) => page.hasNextPage);
      if (page) void page.fetchNextPage();
      setLimit((old) => old + 20);
    },
  };
}
