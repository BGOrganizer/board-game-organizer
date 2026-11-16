import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { communityRequest } from "../../community/communityApi";
import { useRecordListWindow } from "../../events/hooks/useRecordListWindow";

const leaderboardGames = (page: GroupLeaderboardResponse) => page.games;

export function useGroupLeaderboard(options: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  groupId: string;
  gameId: number | null;
  protectionBypass?: string | null;
  query?: string;
}) {
  const client = useQueryClient();
  const enabled = Boolean(options.apiUrl && options.userId && options.groupId),
    raw = options.query?.trim() ?? "",
    query = raw.length >= 4 ? raw : "";
  const page = (gameId: number | null, cursor: number, signal: AbortSignal) =>
    communityRequest<GroupLeaderboardResponse>(
      { ...options, userId: options.userId ?? null },
      `groups/${encodeURIComponent(options.groupId)}/leaderboard?${new URLSearchParams({ limit: "25", cursor: String(cursor), ...(gameId === null ? (query.length >= 4 ? { query } : {}) : { gameId: String(gameId) }) })}`,
      "GET",
      undefined,
      signal,
    );
  const games = useInfiniteQuery({
    queryKey: [
      "groups",
      options.apiUrl,
      options.userId,
      "rankings",
      options.groupId,
      "games",
      query,
    ],
    queryFn: ({ pageParam, signal }) => page(null, pageParam, signal),
    // A new search must not unmount its focused selector. Never bridge a private owner/group switch.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === options.apiUrl &&
      previousQuery.queryKey[2] === options.userId &&
      previousQuery.queryKey[4] === options.groupId
        ? previous
        : undefined,
    enabled,
    initialPageParam: 0,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
  const players = useInfiniteQuery({
    queryKey: [
      "groups",
      options.apiUrl,
      options.userId,
      "rankings",
      options.groupId,
      "players",
      options.gameId,
    ],
    queryFn: ({ pageParam, signal }) => page(options.gameId, pageParam, signal),
    enabled: enabled && options.gameId !== null,
    initialPageParam: 0,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
  const gameWindow = useRecordListWindow({
    scope: JSON.stringify([
      "groups",
      options.apiUrl,
      options.userId,
      "rankings",
      options.groupId,
      "games",
      query,
    ]),
    pages: games.data?.pages,
    getItems: leaderboardGames,
    pageSize: 25,
    hasNextPage: games.hasNextPage,
    isFetching: games.isFetching,
    fetchNextPage: () => games.fetchNextPage({ cancelRefetch: false }),
  });
  const selectedGame = useMemo(() => {
    if (options.gameId === null) return undefined;
    for (const page of games.data?.pages ?? []) {
      const game = page.games.find((item) => item.id === options.gameId);
      if (game) return game;
    }
    // Selection survives closing a filtered search without expanding its option window.
    const sources = client.getQueriesData<InfiniteData<GroupLeaderboardResponse>>({
      queryKey: ["groups", options.apiUrl, options.userId, "rankings", options.groupId, "games"],
    });
    for (const [, source] of sources) {
      if (source === games.data) continue;
      for (const page of source?.pages ?? []) {
        const game = page.games.find((item) => item.id === options.gameId);
        if (game) return game;
      }
    }
    return undefined;
  }, [client, games.data, options.gameId, options.apiUrl, options.userId, options.groupId]);
  return {
    games: {
      ...games,
      ...gameWindow,
      selectedGame,
      data: games.data ? { games: gameWindow.items } : undefined,
    },
    players,
  };
}
