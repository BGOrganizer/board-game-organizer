"use client";

import type {
  GroupLeaderboardResponse,
  LeaderboardDirection,
  LeaderboardSort,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  resolveApiUrl,
  useLeaderboard,
  useRecordListWindow,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { LeaderboardView } from "./LeaderboardView";

const leaderboardPlayers = (page: GroupLeaderboardResponse) => page.players;

const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
const protectionBypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;

export function Leaderboard({ groupId, groupName }: { groupId?: string; groupName?: string }) {
  const { getToken, userId } = useAuth();
  const { i18n } = useLingui();
  const [sort, setSort] = useState<LeaderboardSort>("rating");
  const [direction, setDirection] = useState<LeaderboardDirection>("desc");
  const [gameId, setGameId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const endRef = useRef<HTMLDivElement>(null);
  const { games, players } = useLeaderboard({
    apiUrl,
    getToken,
    userId,
    groupId: groupId ?? null,
    gameId,
    sort,
    direction,
    protectionBypass,
    query: debouncedSearch,
  });
  const playerWindow = useRecordListWindow({
    scope: JSON.stringify([apiUrl, userId, groupId, gameId, sort, direction]),
    pages: players.data?.pages,
    getItems: leaderboardPlayers,
    pageSize: 25,
    hasNextPage: players.hasNextPage,
    isFetching: players.isFetching,
    fetchNextPage: () => players.fetchNextPage({ cancelRefetch: false }),
  });
  const selectedGame = games.data?.games.find((game) => game.id === gameId) ?? games.selectedGame;
  const filteredGames =
    debouncedSearch.length >= 4
      ? games.data?.games.filter((game) =>
          game.name
            .toLocaleLowerCase(i18n.locale)
            .includes(debouncedSearch.toLocaleLowerCase(i18n.locale)),
        )
      : games.data?.games;
  useEffect(() => {
    const node = endRef.current;
    if (
      !node ||
      !playerWindow.hasNextPage ||
      players.isFetchNextPageError ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !players.isFetchingNextPage) void playerWindow.fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    playerWindow.hasNextPage,
    players.isFetchingNextPage,
    players.isFetchNextPageError,
    playerWindow.fetchNextPage,
  ]);

  return (
    <LeaderboardView
      group={groupId ? { name: groupName } : undefined}
      gameId={gameId}
      endRef={endRef}
      games={{
        items: filteredGames ?? [],
        selected: selectedGame,
        search,
        query: debouncedSearch,
        isPending: games.isPending,
        isError: games.isError,
        isPlaceholderData: games.isPlaceholderData,
        hasNextPage: games.hasNextPage,
        isFetchingNextPage: games.isFetchingNextPage,
        onSearch: setSearch,
        onClose: () => {
          setSearch("");
          setDebouncedSearch("");
        },
        onChange: setGameId,
        onRetry: () => void games.refetch(),
        onMore: () => void games.fetchNextPage(),
      }}
      players={{
        items: playerWindow.items,
        isPending: players.isPending,
        isError: players.isError && (!players.data || communityAccessDenied(players.error)),
        hasNextPage: playerWindow.hasNextPage,
        isFetchingNextPage: players.isFetchingNextPage,
        isFetchNextPageError: players.isFetchNextPageError,
        onMore: () => void playerWindow.fetchNextPage(),
        onRetry: () => void players.refetch(),
      }}
      sorting={{
        sort,
        direction,
        onSort: (metric, order) => {
          setSort(metric);
          setDirection(order);
        },
      }}
    />
  );
}
