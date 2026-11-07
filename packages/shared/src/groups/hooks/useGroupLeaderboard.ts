import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import { useInfiniteQuery } from "@tanstack/react-query";
import { communityRequest } from "../../community/communityApi";
export function useGroupLeaderboard(options: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  groupId: string;
  gameId: number | null;
  protectionBypass?: string | null;
  query?: string;
}) {
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
  return {
    games: {
      ...games,
      data: games.data ? { games: games.data.pages.flatMap((p) => p.games) } : undefined,
    },
    players,
  };
}
