"use client";

import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { useMatchLeaderboard } from "@board-game-organizer/shared";
import { Avatar, Button, Label, ListBox, Select, Skeleton, Table } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChartNoAxesCombined, Clock3, Gamepad2 } from "lucide-react";
import { useState } from "react";
import { EmptyList } from "@/components/EmptyList";
import { LeaderboardGameCover } from "@/components/LeaderboardGameCover";

export function MatchLeaderboard({
  data,
  apiUrl,
  token,
  getToken,
  userId,
  protectionBypass,
}: {
  data: MatchDetailResponse;
  apiUrl: string;
  token: string | null;
  getToken: () => Promise<string | null>;
  userId: string | null | undefined;
  protectionBypass?: string | null;
}) {
  const { t, i18n } = useLingui();
  const number = new Intl.NumberFormat(i18n.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [selection, setSelection] = useState<number | null>(null);
  const { match, games } = data;
  const gameId =
    match.status === "PLANNING"
      ? games.some((game) => game.id === selection)
        ? selection
        : null
      : (match.selectedGameId ?? null);
  const selected = games.find((game) => game.id === gameId);
  const leaderboard = useMatchLeaderboard(
    { apiUrl, token, getToken, userId, protectionBypass, matchId: match.id },
    gameId,
  );
  const participants = [
    data.administrator,
    ...data.invitedPlayers.filter((player) => player.invitation.status === "ACCEPTED"),
  ];

  return (
    <div className="space-y-4">
      {match.status !== "PLANNING" && (
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gamepad2 className="size-4" aria-hidden="true" />
          {selected?.name ?? t`Board game`}
        </h2>
      )}
      {match.status === "PLANNING" && (
        <Select
          className="max-w-sm"
          placeholder={t`Select a board game`}
          value={gameId === null ? null : String(gameId)}
          onChange={(value) => setSelection(value === null ? null : Number(value))}
        >
          <Label>{t`Board game`}</Label>
          <Select.Trigger className="w-full items-center gap-2">
            {selected ? <LeaderboardGameCover imageUrl={selected.thumbnail} /> : null}
            <Select.Value className="min-w-0 flex-1 truncate" />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {games.map((game) => (
                <ListBox.Item key={game.id} id={String(game.id)} textValue={game.name}>
                  <span className="flex items-center gap-2">
                    <LeaderboardGameCover imageUrl={game.thumbnail} />
                    <span className="min-w-0 flex-1 truncate">{game.name}</span>
                  </span>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}
      {gameId !== null &&
        (leaderboard.isPending ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : leaderboard.isError ? (
          <Button variant="ghost" onPress={() => void leaderboard.refetch()}>
            {t`Could not load leaderboards. Retry`}
          </Button>
        ) : !leaderboard.data?.ratings.length ? (
          <EmptyList
            icon={<ChartNoAxesCombined className="size-7" />}
          >{t`No rankings available`}</EmptyList>
        ) : (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label={t`Match leaderboard`} className="min-w-[710px]">
                <Table.Header>
                  <Table.Column isRowHeader>{t`Player`}</Table.Column>
                  <Table.Column>{t`Games played`}</Table.Column>
                  <Table.Column>{t`Games won`}</Table.Column>
                  <Table.Column>{t`ND`}</Table.Column>
                  <Table.Column>{t`Ranking`}</Table.Column>
                </Table.Header>
                <Table.Body>
                  {leaderboard.data.ratings.map((rating) => {
                    const player = participants.find(
                      (participant) => participant.id === rating.userId,
                    );
                    return player ? (
                      <Table.Row key={rating.userId}>
                        <Table.Cell>
                          <span className="flex items-center gap-3">
                            <Avatar size="sm" color="accent">
                              <Avatar.Image src={player.avatarUrl ?? undefined} alt="" />
                              <Avatar.Fallback>{player.name.charAt(0) || "?"}</Avatar.Fallback>
                            </Avatar>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{player.name}</span>
                              <span className="block truncate text-sm text-default-500">
                                {player.email ?? t`Email unavailable`}
                              </span>
                            </span>
                          </span>
                        </Table.Cell>
                        <Table.Cell>{rating.gamesPlayed}</Table.Cell>
                        <Table.Cell>{rating.gamesWon}</Table.Cell>
                        <Table.Cell>{rating.nd}</Table.Cell>
                        <Table.Cell>
                          <span className="flex items-center gap-1">
                            {number.format(rating.score)}
                            {rating.provisional ? (
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
                    ) : null;
                  })}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        ))}
    </div>
  );
}
