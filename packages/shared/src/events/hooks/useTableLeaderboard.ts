"use client";
import type { TableLeaderboardResponse } from "@board-game-organizer/schemas";
import { infiniteQueryOptions, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityRequest,
} from "../../community/communityApi";
import { eventRecordKeys } from "./useEventRecords";

export function tableLeaderboardQuery(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  gameId?: number,
) {
  return infiniteQueryOptions({
    queryKey: [...eventRecordKeys.root(o), "leaderboard", eventId, tableId, gameId ?? null],
    queryFn: async ({ pageParam, signal }) => {
      const data = await communityRequest<TableLeaderboardResponse>(
        o,
        `events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}/leaderboard?${new URLSearchParams({ limit: "20", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        "GET",
        undefined,
        signal,
      );
      if (data.gameId !== gameId) throw new CommunityApiError(409, "TABLE_GAME_CHANGED");
      return data;
    },
    enabled: Boolean(o.apiUrl && o.userId && eventId && tableId && gameId && o.enabled !== false),
    initialPageParam: "",
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    // Current ratings may change through another Event; reopen cache-first, revalidate immediately.
    staleTime: 0,
    gcTime: 30 * 60_000,
  });
}
export function useTableLeaderboard(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  gameId?: number,
) {
  const client = useQueryClient();
  const q = useInfiniteQuery(tableLeaderboardQuery(o, eventId, tableId, gameId));
  const items = useMemo(() => q.data?.pages.flatMap((page) => page.items) ?? [], [q.data]);
  const retry = () =>
    q.error instanceof CommunityApiError && q.error.code === "TABLE_GAME_CHANGED"
      ? client.invalidateQueries({
          queryKey: eventRecordKeys.table(o, eventId, tableId),
          exact: true,
        })
      : q.refetch();
  return { ...q, items, retry };
}
