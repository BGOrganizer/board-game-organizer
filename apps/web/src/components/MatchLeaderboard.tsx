"use client";

import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { useMatchLeaderboard } from "@board-game-organizer/shared";
import { Button, Label, ListBox, Select, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChartNoAxesCombined, Gamepad2 } from "lucide-react";
import { useState } from "react";
import { EmptyList } from "@/components/EmptyList";
import { GroupedList, GroupedRow } from "@/components/GroupedList";
import { GameRating, MatchStandingIdentity } from "@/components/MatchStandingIdentity";

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
  const { t } = useLingui();
  const [selection, setSelection] = useState<number | null>(null);
  const { match, games } = data;
  const gameId =
    match.status === "PLANNING"
      ? games.some((game) => game.id === selection)
        ? selection
        : null
      : (match.selectedGameId ?? null);
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
          {games.find((game) => game.id === gameId)?.name ?? t`Board game`}
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
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {games.map((game) => (
                <ListBox.Item key={game.id} id={String(game.id)} textValue={game.name}>
                  {game.name}
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
          <GroupedList>
            {leaderboard.data.ratings.map((rating) => {
              const player = participants.find((participant) => participant.id === rating.userId);
              return player ? (
                <GroupedRow key={rating.userId}>
                  <MatchStandingIdentity player={player} />
                  <GameRating rating={rating} />
                </GroupedRow>
              ) : null;
            })}
          </GroupedList>
        ))}
    </div>
  );
}
