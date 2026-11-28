"use client";

import type {
  GroupLeaderboardResponse,
  LeaderboardDirection,
  LeaderboardSort,
} from "@board-game-organizer/schemas";
import { formatUsername, groupLeaderboardRoles } from "@board-game-organizer/shared";
import { Accordion, Button, Card, Dropdown, Label, Skeleton, Table } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  ArrowDown,
  ArrowUp,
  ChartNoAxesColumnIncreasing,
  Clock3,
  Dices,
  Medal,
  Trophy,
  UserRoundX,
} from "lucide-react";
import { type Ref, useMemo, useSyncExternalStore } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { RankPositionBadge } from "@/components/common/ui/RankPositionBadge";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { RatingGameSelect } from "@/components/ratings/RatingGameSelect";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";

const narrowQuery = "(max-width: 639px)";
function subscribeToWidth(change: () => void) {
  const media = window.matchMedia?.(narrowQuery);
  media?.addEventListener?.("change", change);
  return () => media?.removeEventListener?.("change", change);
}
const usesAccordion = () => window.matchMedia?.(narrowQuery)?.matches ?? false;
const serverUsesAccordion = () => false;

export type LeaderboardPlayer = Omit<GroupLeaderboardResponse["players"][number], "left"> & {
  left?: boolean;
};
type Game = GroupLeaderboardResponse["games"][number];
type PageControls = {
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError?: boolean;
  onRetry: () => void;
  onMore: () => void;
};

export function LeaderboardView({
  group,
  gameId,
  games,
  players,
  sorting,
  endRef,
}: {
  group?: { name?: string };
  gameId: number | null;
  games?: PageControls & {
    items: readonly Game[];
    selected?: Game;
    search: string;
    query: string;
    isPlaceholderData: boolean;
    onSearch: (value: string) => void;
    onClose: () => void;
    onChange: (id: number | null) => void;
  };
  players: PageControls & { items: readonly LeaderboardPlayer[] };
  sorting?: {
    sort: LeaderboardSort;
    direction: LeaderboardDirection;
    onSort: (sort: LeaderboardSort, direction: LeaderboardDirection) => void;
  };
  endRef?: Ref<HTMLDivElement>;
}) {
  const { t, i18n } = useLingui();
  const compact = useSyncExternalStore(subscribeToWidth, usesAccordion, serverUsesAccordion);
  const sort = sorting?.sort ?? "rating";
  const direction = sorting?.direction ?? "desc";
  const rows = players.items;
  const number = useMemo(
    () =>
      new Intl.NumberFormat(i18n.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [i18n.locale],
  );
  const metricLabels = {
    rating: {
      label: "OpenSkill",
      short: "OpenSkill",
      icon: ChartNoAxesColumnIncreasing,
      color: "text-accent",
    },
    gamesPlayed: { label: t`Games played`, short: t`Played`, icon: Dices, color: "text-muted" },
    gamesWon: { label: t`Games won`, short: t`Wins`, icon: Trophy, color: "text-warning" },
    nd: { label: t`ND`, short: t`ND`, icon: UserRoundX, color: "text-muted" },
  } satisfies Record<
    LeaderboardSort,
    { label: string; short: string; icon: typeof Dices; color: string }
  >;
  const metrics = ["gamesPlayed", "gamesWon", "nd", "rating"] as const;
  const CurrentIcon = metricLabels[sort].icon;
  const OrderIcon = direction === "asc" ? ArrowUp : ArrowDown;
  const label = games ? (group ? t`Group leaderboard` : t`Global leaderboard`) : t`Rankings`;
  const sortButtonLabel = direction === "asc" ? t`Sort descending` : t`Sort ascending`;

  function identity(player: LeaderboardPlayer) {
    const name = formatUsername(player.username, t`Username unavailable`);
    const roles =
      player.left === undefined ? [] : groupLeaderboardRoles({ ...player, left: player.left });
    const primary = roles[0];
    const secondary = player.left
      ? t`Former group member`
      : primary
        ? i18n._(recordUserRoleMessages[primary])
        : null;
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="inline-flex min-w-6 shrink-0 justify-center">
          {player.position != null ? <RankPositionBadge rank={player.position} /> : null}
        </span>
        <UserIdentity
          name={name}
          avatarUrl={player.avatarUrl}
          secondary={secondary}
          badge={roles.length ? <UserRoleBadge roles={roles} /> : undefined}
        >
          {group && !player.left && player.groupRole === undefined ? (
            <Skeleton aria-label={t`Loading…`} className="mt-1 h-4 w-22 rounded" />
          ) : null}
        </UserIdentity>
      </div>
    );
  }

  function rating(player: LeaderboardPlayer) {
    return (
      <span className="flex items-center justify-end gap-1 font-semibold tabular-nums">
        {player.provisional ? (
          <span role="img" aria-label={t`Provisional rating`} title={t`Provisional rating`}>
            <Clock3 className="size-4 text-warning" aria-hidden="true" />
          </span>
        ) : null}
        {player.rating === null ? (
          <span className="font-normal text-muted">{t`Not rated`}</span>
        ) : (
          number.format(player.rating)
        )}
      </span>
    );
  }

  const help = (
    <HelpPopover
      label={t`How OpenSkill works`}
      title={t`How OpenSkill works`}
      titleIcon={
        <ChartNoAxesColumnIncreasing className="size-4 shrink-0 text-accent" aria-hidden />
      }
      size="compact"
      placement="bottom end"
      className="max-w-80"
    >
      <div className="mt-2 space-y-2">
        <p>{t`OpenSkill estimates your skill separately for each game. After a rated match, it uses your finish and the other players’ ratings to update your score. The displayed score accounts for uncertainty, which decreases as you play.`}</p>
        <div className="flex items-start gap-2">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>{t`The clock marks a provisional rating until you have five rated results. ND means you did not finish and is counted separately from completed games.`}</p>
        </div>
        <p>
          {group
            ? t`This leaderboard only includes rated results from this group’s events.`
            : t`For each game, the global leaderboard includes all rated matches from private and public events.`}
        </p>
      </div>
    </HelpPopover>
  );
  return (
    <SectionHeaderCard
      title={t`Rankings`}
      description={games ? (group ? group.name : t`Global`) : undefined}
      leading={
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
          <Medal className="size-5" aria-hidden />
        </span>
      }
      action={games ? help : undefined}
    >
      {games?.isPending && gameId === null ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : games?.isError && gameId === null ? (
        <Button
          variant="outline"
          onPress={games.onRetry}
        >{t`Could not load leaderboards. Retry`}</Button>
      ) : games && !games.items.length && !games.query && gameId === null ? (
        <EmptyList icon={<Dices className="size-7" />}>
          {group ? t`No rated tables played in this group yet` : t`No rated tables played yet`}
        </EmptyList>
      ) : (
        <>
          {games ? (
            <RatingGameSelect
              selectedId={gameId}
              value={games.selected}
              games={games.items}
              onChange={games.onChange}
              onClose={games.onClose}
              focusUnderHeader
              footer={
                games.hasNextPage ? (
                  <Button
                    variant="secondary"
                    isDisabled={games.isFetchingNextPage || games.isPlaceholderData}
                    onPress={games.onMore}
                  >
                    {games.isFetchNextPageError
                      ? t`Could not load leaderboards. Retry`
                      : t`Load more games`}
                  </Button>
                ) : undefined
              }
              empty={
                games.isPlaceholderData ? (
                  <Skeleton className="h-11 w-full rounded-xl" />
                ) : (
                  <p className="text-muted">{t`No games found`}</p>
                )
              }
            >
              <SearchInput
                value={games.search}
                onChange={games.onSearch}
                label={<Label className="sr-only">{t`Search board games`}</Label>}
                placeholder={t`Search board games`}
              />
            </RatingGameSelect>
          ) : null}
          {games?.isError && gameId !== null ? (
            <Button
              variant="outline"
              onPress={games.onRetry}
            >{t`Could not load leaderboards. Retry`}</Button>
          ) : null}
          {gameId === null ? (
            <EmptyList
              icon={<Dices className="size-7" />}
            >{t`Choose a game to see the leaderboard`}</EmptyList>
          ) : (
            <>
              {sorting ? (
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <span className="text-sm text-muted">{t`Sort by`}</span>
                  <div className="flex items-center gap-1">
                    <Dropdown>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11 min-w-11 px-0 sm:min-h-8"
                        aria-label={t`Sort by ${metricLabels[sort].label}`}
                        data-testid="ranking-sort-metric"
                      >
                        <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-surface-secondary px-2 text-xs">
                          <CurrentIcon
                            className={`size-3.5 ${metricLabels[sort].color}`}
                            aria-hidden="true"
                          />
                          {metricLabels[sort].short}
                        </span>
                      </Button>
                      <Dropdown.Popover placement="bottom end">
                        <Dropdown.Menu
                          aria-label={t`Sort by`}
                          selectionMode="single"
                          disallowEmptySelection
                          selectedKeys={[sort]}
                        >
                          {metrics.map((metric) => {
                            const { icon: Icon, label, color } = metricLabels[metric];
                            return (
                              <Dropdown.Item
                                key={metric}
                                id={metric}
                                textValue={label}
                                onAction={() => sorting.onSort(metric, direction)}
                              >
                                <Icon className={`size-4 ${color}`} aria-hidden="true" />
                                <Label>{label}</Label>
                                <Dropdown.ItemIndicator />
                              </Dropdown.Item>
                            );
                          })}
                        </Dropdown.Menu>
                      </Dropdown.Popover>
                    </Dropdown>
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      className="min-h-11 min-w-11 p-0 sm:min-h-8 sm:min-w-8"
                      aria-label={sortButtonLabel}
                      data-testid="ranking-sort-direction"
                      onPress={() => sorting.onSort(sort, direction === "asc" ? "desc" : "asc")}
                    >
                      <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-secondary">
                        <OrderIcon className="size-3.5" aria-hidden="true" />
                      </span>
                    </Button>
                  </div>
                </div>
              ) : null}
              {players.isPending ? (
                <Skeleton className="h-32 w-full rounded-xl" />
              ) : players.isError ? (
                <Button
                  variant="outline"
                  onPress={players.onRetry}
                >{t`Could not load leaderboards. Retry`}</Button>
              ) : rows.length === 0 ? (
                <EmptyList
                  icon={<Medal className="size-7" />}
                >{t`No leaderboard for this game yet`}</EmptyList>
              ) : (
                <>
                  {compact ? (
                    <ul aria-label={label} key={gameId} className="space-y-2">
                      {rows.map((player) => (
                        <li
                          key={player.userId}
                          data-testid={`group-ranking-player-${player.userId}`}
                        >
                          <Card className={`gap-0 p-0 ${player.left ? "opacity-60" : ""}`}>
                            <Accordion hideSeparator>
                              <Accordion.Item id={player.userId}>
                                {({ isExpanded }) => (
                                  <>
                                    <div className="flex items-center gap-1 py-3 pe-3 ps-4">
                                      {identity(player)}
                                      <Accordion.Heading className="shrink-0">
                                        <Accordion.Trigger className="min-h-11 gap-1.5 ps-2">
                                          <span className="sr-only">
                                            {t`Game statistics`}:{" "}
                                            {formatUsername(
                                              player.username,
                                              t`Username unavailable`,
                                            )}
                                          </span>
                                          <span className="shrink-0 text-right">
                                            <span className="inline-flex items-center gap-1 text-xs text-muted">
                                              <ChartNoAxesColumnIncreasing
                                                className="size-3 text-accent"
                                                aria-hidden
                                              />
                                              OpenSkill
                                            </span>
                                            {rating(player)}
                                          </span>
                                          <Accordion.Indicator
                                            aria-hidden
                                            className="ml-0 size-4 shrink-0 text-muted"
                                          />
                                        </Accordion.Trigger>
                                      </Accordion.Heading>
                                    </div>
                                    <Accordion.Panel>
                                      {isExpanded ? (
                                        <Accordion.Body className="pt-0 pe-3 pb-3 ps-4">
                                          <dl className="grid grid-cols-3 gap-2 border-separator border-t pt-2">
                                            {(["gamesPlayed", "gamesWon", "nd"] as const).map(
                                              (metric) => {
                                                const {
                                                  icon: Icon,
                                                  short,
                                                  color,
                                                } = metricLabels[metric];
                                                return (
                                                  <div
                                                    key={metric}
                                                    className="flex flex-wrap items-center justify-between gap-x-1"
                                                  >
                                                    <dt className="flex items-center gap-1 text-sm text-muted">
                                                      <Icon
                                                        className={`size-4 shrink-0 ${color}`}
                                                        aria-hidden
                                                      />
                                                      {short}
                                                    </dt>
                                                    <dd className="text-base font-semibold tabular-nums">
                                                      {metric === "gamesPlayed"
                                                        ? Math.max(
                                                            0,
                                                            player.gamesPlayed - player.nd,
                                                          )
                                                        : player[metric]}
                                                    </dd>
                                                  </div>
                                                );
                                              },
                                            )}
                                          </dl>
                                        </Accordion.Body>
                                      ) : null}
                                    </Accordion.Panel>
                                  </>
                                )}
                              </Accordion.Item>
                            </Accordion>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Table variant="secondary">
                      <Table.ScrollContainer>
                        <Table.Content
                          aria-label={label}
                          sortDescriptor={
                            sorting
                              ? {
                                  column: sort,
                                  direction: direction === "asc" ? "ascending" : "descending",
                                }
                              : undefined
                          }
                          onSortChange={({ column, direction: value }) => {
                            const metric = metrics.find((metric) => metric === column);
                            if (metric)
                              sorting?.onSort(metric, value === "ascending" ? "asc" : "desc");
                          }}
                        >
                          <Table.Header>
                            <Table.Column isRowHeader className="bg-surface">
                              {t`Player`}
                            </Table.Column>
                            {metrics.map((metric) => {
                              const { icon: Icon, short, color } = metricLabels[metric];
                              return (
                                <Table.Column
                                  id={metric}
                                  key={metric}
                                  allowsSorting={Boolean(sorting)}
                                  className="bg-surface"
                                >
                                  {sorting ? (
                                    <Table.SortableColumnHeader className="justify-end gap-1">
                                      <Icon
                                        className={`size-3.5 shrink-0 ${color}`}
                                        aria-hidden="true"
                                      />
                                      {short}
                                    </Table.SortableColumnHeader>
                                  ) : (
                                    <span className="flex justify-end gap-1">
                                      <Icon
                                        className={`size-3.5 shrink-0 ${color}`}
                                        aria-hidden="true"
                                      />
                                      {short}
                                    </span>
                                  )}
                                </Table.Column>
                              );
                            })}
                          </Table.Header>
                          <Table.Body>
                            {rows.map((player) => (
                              <Table.Row
                                key={player.userId}
                                data-testid={`group-ranking-player-${player.userId}`}
                                className={player.left ? "opacity-60" : undefined}
                              >
                                <Table.Cell className="min-w-0 py-3 ps-4">
                                  {identity(player)}
                                </Table.Cell>
                                <Table.Cell className="px-3 py-3 text-right tabular-nums">
                                  {Math.max(0, player.gamesPlayed - player.nd)}
                                </Table.Cell>
                                <Table.Cell className="px-3 py-3 text-right tabular-nums">
                                  {player.gamesWon}
                                </Table.Cell>
                                <Table.Cell className="px-3 py-3 text-right tabular-nums">
                                  {player.nd}
                                </Table.Cell>
                                <Table.Cell className="py-3 pe-3">{rating(player)}</Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  )}
                  <div ref={endRef} />
                  {players.hasNextPage ? (
                    <Button
                      variant="outline"
                      isDisabled={players.isFetchingNextPage}
                      onPress={players.onMore}
                    >
                      {players.isFetchNextPageError
                        ? t`Could not load leaderboards. Retry`
                        : t`Load more`}
                    </Button>
                  ) : null}
                </>
              )}
            </>
          )}
        </>
      )}
    </SectionHeaderCard>
  );
}
