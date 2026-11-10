"use client";

import {
  formatUsername,
  groupLeaderboardRoles,
  resolveApiUrl,
  useGroupLeaderboard,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Skeleton, Table } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, Dices } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { RatingGameSelect } from "@/components/ratings/RatingGameSelect";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";

const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
const protectionBypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;

export function GroupLeaderboard({ groupId }: { groupId: string }) {
  const { getToken, userId } = useAuth();
  const { t, i18n } = useLingui();
  const [gameId, setGameId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const endRef = useRef<HTMLDivElement>(null);
  const { games, players } = useGroupLeaderboard({
    apiUrl,
    getToken,
    userId,
    groupId,
    gameId,
    protectionBypass,
    query: debouncedSearch,
  });
  const rows = players.data?.pages.flatMap((page) => page.players) ?? [];
  const selectedGame = games.data?.games.find((game) => game.id === gameId);
  const filteredGames =
    debouncedSearch.length >= 4
      ? games.data?.games.filter((game) =>
          game.name
            .toLocaleLowerCase(i18n.locale)
            .includes(debouncedSearch.toLocaleLowerCase(i18n.locale)),
        )
      : games.data?.games;
  const number = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  useEffect(() => {
    const node = endRef.current;
    if (!node || !players.hasNextPage || players.isFetchNextPageError) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !players.isFetchingNextPage) void players.fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    players.hasNextPage,
    players.isFetchingNextPage,
    players.isFetchNextPageError,
    players.fetchNextPage,
  ]);

  if (games.isPending) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (games.isError)
    return (
      <Button
        variant="outline"
        onPress={() => void games.refetch()}
      >{t`Could not load leaderboards. Retry`}</Button>
    );
  if (!games.data?.games.length && !debouncedSearch)
    return (
      <EmptyList icon={<Dices className="size-7" />}>
        {t`No rated tables played in this group yet`}
      </EmptyList>
    );

  return (
    <div className="space-y-4">
      <RatingGameSelect
        selectedId={gameId}
        value={selectedGame}
        games={filteredGames ?? []}
        onChange={setGameId}
        onClose={() => {
          setSearch("");
          setDebouncedSearch("");
        }}
        footer={
          games.hasNextPage ? (
            <Button
              variant="secondary"
              isDisabled={games.isFetchingNextPage}
              onPress={() => void games.fetchNextPage()}
            >{t`Load more games`}</Button>
          ) : undefined
        }
        empty={<p className="text-muted">{t`No games found`}</p>}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          label={
            <SearchHelpLabel
              label={t`Search board games`}
              help={t`Type at least 4 characters to search`}
            />
          }
          placeholder={t`Search board games`}
        />
      </RatingGameSelect>
      {gameId !== null ? (
        players.isPending ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : players.isError && !players.data ? (
          <Button
            variant="outline"
            onPress={() => void players.refetch()}
          >{t`Could not load leaderboards. Retry`}</Button>
        ) : (
          <>
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label={t`Group leaderboard`} className="min-w-[710px]">
                  <Table.Header>
                    <Table.Column isRowHeader>{t`Player`}</Table.Column>
                    <Table.Column>{t`Games played`}</Table.Column>
                    <Table.Column>{t`Games won`}</Table.Column>
                    <Table.Column>{t`ND`}</Table.Column>
                    <Table.Column>{t`Ranking`}</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {rows.map((player) => {
                      const name = formatUsername(player.username, t`Username unavailable`);
                      const roles = groupLeaderboardRoles(player);
                      const primary = roles[0];
                      const secondary = player.left
                        ? t`Former group member`
                        : primary
                          ? i18n._(recordUserRoleMessages[primary])
                          : null;
                      return (
                        <Table.Row
                          key={player.userId}
                          className={player.left ? "opacity-60" : undefined}
                        >
                          <Table.Cell>
                            <span className="flex items-center gap-3">
                              <UserIdentity
                                name={name}
                                avatarUrl={player.avatarUrl}
                                secondary={secondary}
                                badge={roles.length ? <UserRoleBadge roles={roles} /> : undefined}
                              >
                                {!player.left && player.groupRole === undefined ? (
                                  <Skeleton
                                    aria-label={t`Loading…`}
                                    className="mt-1 h-4 w-22 rounded"
                                  />
                                ) : null}
                              </UserIdentity>
                            </span>
                          </Table.Cell>
                          <Table.Cell>{player.gamesPlayed}</Table.Cell>
                          <Table.Cell>{player.gamesWon}</Table.Cell>
                          <Table.Cell>{player.nd}</Table.Cell>
                          <Table.Cell>
                            <span className="flex items-center gap-1">
                              {player.rating === null ? t`Not rated` : number.format(player.rating)}
                              {player.provisional ? (
                                <span
                                  role="img"
                                  aria-label={t`Provisional rating`}
                                  title={t`Provisional rating`}
                                >
                                  <Clock3 className="size-4 text-warning" aria-hidden="true" />
                                </span>
                              ) : null}
                            </span>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
            <div ref={endRef} />
            {players.hasNextPage ? (
              <Button
                variant="outline"
                isDisabled={players.isFetchingNextPage}
                onPress={() => void players.fetchNextPage()}
              >
                {players.isFetchNextPageError
                  ? t`Could not load leaderboards. Retry`
                  : t`Load more`}
              </Button>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
