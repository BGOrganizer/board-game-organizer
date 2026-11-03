"use client";
import {
  communityAccessDenied,
  useProfileRating,
  useProfileRatingGames,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { Button, Label, ListBox, Select, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { ListCard } from "@/components/common/ui/ListCard";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileRatingChart } from "./ProfileRatingChart";
import { ProfileStats } from "./ProfileStats";

export function ProfilePlayer({ userId, viewKey }: { userId: string; viewKey: string }) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi();
  const gameId = useAppStore((s) => s.profileViews[viewKey]?.gameId ?? null),
    setView = useAppStore((s) => s.setProfileView);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const games = useProfileRatingGames(o, userId, query),
    history = useProfileRating(o, userId, gameId);
  const choices = communityAccessDenied(games.error)
    ? []
    : (games.data?.pages.flatMap((p) => p.items) ?? []);
  const data =
    communityAccessDenied(games.error) || communityAccessDenied(history.error)
      ? undefined
      : history.data?.pages[0];
  const selected = choices.find((g) => g.id === gameId) ?? data?.game;
  const options =
    selected && !choices.some((g) => g.id === selected.id) ? [selected, ...choices] : choices;
  const first = choices[0]?.id;
  useEffect(() => {
    if (gameId === null && first) setView(viewKey, { gameId: first });
  }, [gameId, first, setView, viewKey]);
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  const points = [...(history.data?.pages ?? [])].reverse().flatMap((p) => p.points);
  return (
    <section className="space-y-3" aria-label={t`OpenSkill statistics`}>
      <h2 className="font-semibold">{t`OpenSkill statistics`}</h2>
      <Select
        className="w-full"
        placeholder={t`Select a board game`}
        value={gameId === null ? null : String(gameId)}
        onChange={(value) => {
          if (value !== null) setView(viewKey, { gameId: Number(value) });
        }}
      >
        <Label>{t`Board game`}</Label>
        <Select.Trigger className="w-full">
          <Select.Value className="sr-only" />
          <span className="min-w-0 flex-1 truncate text-left" aria-hidden>
            {selected?.name ?? t`Select a board game`}
          </span>
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <SearchInput
            value={search}
            onChange={setSearch}
            label={t`Filter games`}
            placeholder={t`Filter games`}
          />
          <ListBox
            className="max-h-72 overflow-auto"
            renderEmptyState={() => (games.isError ? null : t`No rated games yet`)}
          >
            {options.map((game) => (
              <ListBox.Item key={game.id} id={String(game.id)} textValue={game.name}>
                {game.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
          {games.hasNextPage ? (
            <Button
              variant="secondary"
              isDisabled={games.isFetchingNextPage}
              onPress={() => void games.fetchNextPage()}
            >{t`Load more games`}</Button>
          ) : null}
        </Select.Popover>
      </Select>
      {games.isPending ? <Skeleton className="h-12 w-full rounded-xl" /> : null}
      {games.isError || history.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load rating history`}</p>
          <Button
            variant="secondary"
            onPress={() => {
              void games.refetch();
              if (gameId) void history.refetch();
            }}
          >{t`Try again`}</Button>
        </div>
      ) : null}
      {!choices.length && !games.isPending && !games.isError && !query ? (
        <p className="text-muted">{t`No rated games yet`}</p>
      ) : null}
      {gameId && history.isPending ? <Skeleton className="h-44 w-full rounded-xl" /> : null}
      {data ? (
        <>
          <ListCard>
            <div className="space-y-3 p-4">
              <p className="font-semibold">
                {t`Current rating`}:{" "}
                {data.rating === null ? t`Unknown` : number.format(data.rating)}
              </p>
              <p className="text-sm text-muted">
                {t`Last rated game change`}:{" "}
                {data.delta === null
                  ? "—"
                  : `${data.delta >= 0 ? "+" : ""}${number.format(data.delta)}`}
              </p>
              <ProfileRatingChart points={points} />
            </div>
          </ListCard>
          <ProfileStats
            items={[
              { label: t`Games played`, value: number.format(data.stats.gamesPlayed) },
              { label: t`Games won`, value: number.format(data.stats.gamesWon) },
            ]}
          />
          {history.hasNextPage ? (
            <Button
              variant="secondary"
              isDisabled={history.isFetchingNextPage}
              onPress={() => void history.fetchNextPage()}
            >{t`Earlier rated games`}</Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
