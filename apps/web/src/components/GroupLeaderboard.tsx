"use client";

import { resolveApiUrl, useGroupLeaderboard } from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar, Button, Label, ListBox, Select, Skeleton, Table } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Clock3, Gamepad2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
const protectionBypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;

function GameCover({ imageUrl }: { imageUrl: string | null }) {
  return imageUrl ? (
    <img src={imageUrl} alt="" className="size-5 shrink-0 rounded object-cover" />
  ) : (
    <Gamepad2 className="size-5 shrink-0 text-default-500" aria-hidden="true" />
  );
}

export function GroupLeaderboard({ groupId }: { groupId: string }) {
  const { getToken, userId } = useAuth();
  const { t, i18n } = useLingui();
  const [gameId, setGameId] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { games, players } = useGroupLeaderboard({
    apiUrl,
    getToken,
    userId,
    groupId,
    gameId,
    protectionBypass,
  });
  const rows = players.data?.pages.flatMap((page) => page.players) ?? [];
  const selectedGame = games.data?.games.find((game) => game.id === gameId);
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
  if (!games.data?.games.length)
    return <p className="text-sm text-default-500">{t`No matches played in this group yet`}</p>;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Select
          className="w-full"
          placeholder={t`Select a board game`}
          value={gameId === null ? null : String(gameId)}
          onChange={(value) => setGameId(value === null ? null : Number(value))}
        >
          <Label>{t`Board game`}</Label>
          <Select.Trigger className={selectedGame ? "w-full items-center gap-2 pe-10" : "w-full"}>
            {selectedGame ? <GameCover imageUrl={selectedGame.imageUrl} /> : null}
            <Select.Value className="sr-only" />
            <span
              aria-hidden="true"
              data-slot="selected-game-name"
              className="min-w-0 flex-1 truncate text-left"
            >
              {selectedGame?.name ?? t`Select a board game`}
            </span>
            {!selectedGame ? <Select.Indicator /> : null}
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {games.data.games.map((game) => (
                <ListBox.Item key={game.id} id={String(game.id)} textValue={game.name}>
                  <span className="flex items-center gap-2">
                    <GameCover imageUrl={game.imageUrl} />
                    <span className="min-w-0 flex-1 truncate">{game.name}</span>
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {selectedGame ? (
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            className="absolute end-1 bottom-1 z-10"
            aria-label={t`Clear board game selection`}
            onPress={() => setGameId(null)}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
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
                    {rows.map((player) => (
                      <Table.Row
                        key={player.userId}
                        className={player.left ? "opacity-60" : undefined}
                      >
                        <Table.Cell>
                          <span className="flex items-center gap-3">
                            <Avatar size="sm" color="accent">
                              <Avatar.Image src={player.avatarUrl ?? undefined} alt="" />
                              <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
                            </Avatar>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{player.name}</span>
                              <span className="block truncate text-sm text-default-500">
                                {player.username ? `@${player.username}` : "—"}
                              </span>
                              {player.left ? (
                                <span className="block text-xs">{t`Former group member`}</span>
                              ) : null}
                            </span>
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
                    ))}
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
