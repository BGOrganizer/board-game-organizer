"use client";
import type { TableLeaderboardResponse } from "@board-game-organizer/schemas";
import {
  hashKey,
  infiniteQueryOptions,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  CommunityApiError,
  type CommunityApiOptions,
  communityAccessDenied,
  communityRequest,
} from "../../community/communityApi";
import { eventRecordKeys } from "./useEventRecords";
import { useRecordListWindow } from "./useRecordListWindow";

export function tableLeaderboardQuery(
  o: CommunityApiOptions,
  eventId: string,
  tableId: string,
  gameId?: number,
  playerIds?: readonly string[],
) {
  const roster = playerIds ? [...playerIds].sort() : undefined;
  return infiniteQueryOptions({
    queryKey: [
      ...eventRecordKeys.root(o),
      "leaderboard",
      eventId,
      tableId,
      gameId ?? null,
      ...(roster ? [roster] : []),
    ],
    queryFn: async ({ pageParam, signal }) => {
      const data = await communityRequest<TableLeaderboardResponse>(
        o,
        `events/${encodeURIComponent(eventId)}/tables/${encodeURIComponent(tableId)}/leaderboard?${new URLSearchParams({ limit: "20", ...(pageParam ? { cursor: pageParam } : {}) })}`,
        "GET",
        undefined,
        signal,
      );
      if (data.gameId !== gameId) throw new CommunityApiError(409, "TABLE_GAME_CHANGED");
      if (roster && data.items.some((row) => !roster.includes(row.userId)))
        throw new CommunityApiError(409, "TABLE_ROSTER_CHANGED");
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
  playerIds?: readonly string[],
) {
  const client = useQueryClient();
  const options = tableLeaderboardQuery(o, eventId, tableId, gameId, playerIds);
  const q = useInfiniteQuery(options);
  const scope = hashKey(options.queryKey);
  const pages = communityAccessDenied(q.error) ? undefined : q.data?.pages;
  const window = useRecordListWindow({
    scope,
    pages,
    hasNextPage: q.hasNextPage,
    isFetching: q.isFetching || q.isError,
    fetchNextPage: () => q.fetchNextPage({ cancelRefetch: false }),
  });
  const loadMore = useCallback(() => {
    void window.fetchNextPage();
  }, [window.fetchNextPage]);
  const retry = () =>
    q.error instanceof CommunityApiError &&
    ["TABLE_GAME_CHANGED", "TABLE_ROSTER_CHANGED"].includes(q.error.code)
      ? client.invalidateQueries({
          queryKey: eventRecordKeys.table(o, eventId, tableId),
          exact: true,
        })
      : q.refetch();
  return {
    ...q,
    items: window.items,
    retry,
    loadMore,
    cachedMore: window.cachedMore,
    hasMore: window.hasNextPage,
  };
}
