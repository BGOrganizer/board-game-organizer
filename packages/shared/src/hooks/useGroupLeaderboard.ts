import type { GroupLeaderboardResponse } from "@board-game-organizer/schemas";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiHeaders, withProtectionBypass } from "../api";

export function useGroupLeaderboard({
  apiUrl,
  getToken,
  userId,
  groupId,
  gameId,
  protectionBypass,
}: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  userId?: string | null;
  groupId: string;
  gameId: number | null;
  protectionBypass?: string | null;
}) {
  async function load(game: number | null, cursor?: number): Promise<GroupLeaderboardResponse> {
    const token = await getToken();
    if (!token) throw new Error("No session token");
    const params = new URLSearchParams({
      ...(game !== null ? { gameId: String(game) } : {}),
      ...(cursor ? { cursor: String(cursor) } : {}),
    });
    const response = await fetch(
      withProtectionBypass(
        `${apiUrl}/api/groups/${encodeURIComponent(groupId)}/leaderboard?${params}`,
        protectionBypass,
      ),
      { headers: apiHeaders(token) },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as GroupLeaderboardResponse;
  }
  const key = ["group-leaderboard", groupId, apiUrl, userId] as const;
  const games = useQuery({
    queryKey: [...key, "games"],
    queryFn: () => load(null),
    enabled: Boolean(userId && groupId),
  });
  const players = useInfiniteQuery({
    queryKey: [...key, "players", gameId],
    queryFn: ({ pageParam }) => load(gameId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(userId && groupId && gameId),
  });
  return { games, players };
}
