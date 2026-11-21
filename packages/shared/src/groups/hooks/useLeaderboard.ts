import type {
  GroupLeaderboardResponse,
  LeaderboardDirection,
  LeaderboardSort,
} from "@board-game-organizer/schemas";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { communityRequest } from "../../community/communityApi";
import { useRecordListWindow } from "../../events/hooks/useRecordListWindow";

const leaderboardGames = (page: GroupLeaderboardResponse) => page.games;

export const globalLeaderboardKey = (apiUrl: string, userId?: string | null) =>
  ["community", apiUrl, userId, "rankings"] as const;

export function useLeaderboard(options: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  groupId: string | null;
  sort?: LeaderboardSort;
  direction?: LeaderboardDirection;
  gameId: number | null;
  protectionBypass?: string | null;
  query?: string;
}) {
  const client = useQueryClient();
  const { apiUrl, userId, groupId, gameId, sort = "rating", direction = "desc" } = options;
  const enabled = Boolean(apiUrl && userId && (groupId === null || groupId));
  const raw = options.query?.trim() ?? "";
  const query = raw.length >= 4 ? raw : "";
  const root =
    groupId === null
      ? [...globalLeaderboardKey(apiUrl, userId), null]
      : ["groups", apiUrl, userId, "rankings", groupId];
  const gameKey = [...root, "games", query];
  const playerKey = [...root, "players", gameId, sort, direction];
  const endpoint =
    groupId === null
      ? "community/leaderboard"
      : `groups/${encodeURIComponent(groupId)}/leaderboard`;
  const page = (game: number | null, cursor: number, signal: AbortSignal) => {
    const params = new URLSearchParams({ limit: "25", cursor: String(cursor) });
    if (game !== null) {
      params.set("gameId", String(game));
      params.set("sort", sort);
      params.set("direction", direction);
    } else if (query) {
      params.set("query", query);
    }
    return communityRequest<GroupLeaderboardResponse>(
      { ...options, userId: userId ?? null },
      `${endpoint}?${params}`,
      "GET",
      undefined,
      signal,
    );
  };
  const games = useInfiniteQuery({
    queryKey: gameKey,
    queryFn: ({ pageParam, signal }) => page(null, pageParam, signal),
    // A new search must not unmount its focused selector or bridge an API/account/group switch.
    placeholderData: (previous, previousQuery) =>
      root.every((part, index) => previousQuery?.queryKey[index] === part) ? previous : undefined,
    enabled,
    initialPageParam: 0,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
  const players = useInfiniteQuery({
    queryKey: playerKey,
    queryFn: ({ pageParam, signal }) => page(gameId, pageParam, signal),
    enabled: enabled && gameId !== null,
    initialPageParam: 0,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
  const gameWindow = useRecordListWindow({
    scope: JSON.stringify(gameKey),
    pages: games.data?.pages,
    getItems: leaderboardGames,
    pageSize: 25,
    hasNextPage: games.hasNextPage,
    isFetching: games.isFetching,
    fetchNextPage: () => games.fetchNextPage({ cancelRefetch: false }),
  });
  const selectedGame = useMemo(() => {
    if (gameId === null) return undefined;
    for (const page of games.data?.pages ?? []) {
      const game = page.games.find((item) => item.id === gameId);
      if (game) return game;
    }
    // Selection survives closing a filtered search without expanding its option window.
    const sources = client.getQueriesData<InfiniteData<GroupLeaderboardResponse>>({
      queryKey: [
        groupId === null ? "community" : "groups",
        apiUrl,
        userId,
        "rankings",
        groupId,
        "games",
      ],
    });
    for (const [, source] of sources) {
      if (source === games.data) continue;
      for (const page of source?.pages ?? []) {
        const game = page.games.find((item) => item.id === gameId);
        if (game) return game;
      }
    }
    return undefined;
  }, [client, games.data, gameId, apiUrl, userId, groupId]);
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
