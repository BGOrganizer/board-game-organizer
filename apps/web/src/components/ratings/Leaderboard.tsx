"use client";

import type {
  GroupLeaderboardResponse,
  LeaderboardDirection,
  LeaderboardSort,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatUsername,
  groupLeaderboardRoles,
  resolveApiUrl,
  useLeaderboard,
  useRecordListWindow,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { RankPositionBadge } from "@/components/common/ui/RankPositionBadge";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { SectionHeaderCard } from "@/components/common/ui/SectionHeaderCard";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { RatingGameSelect } from "@/components/ratings/RatingGameSelect";
import { recordUserRoleMessages } from "@/lib/recordUserRoleMessages";

const leaderboardPlayers = (page: GroupLeaderboardResponse) => page.players;

const apiUrl = resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
const protectionBypass = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;

type Player = GroupLeaderboardResponse["players"][number];

const narrowQuery = "(max-width: 639px)";
function subscribeToWidth(change: () => void) {
  const media = window.matchMedia?.(narrowQuery);
  media?.addEventListener?.("change", change);
  return () => media?.removeEventListener?.("change", change);
}
const usesAccordion = () => window.matchMedia?.(narrowQuery)?.matches ?? false;
const serverUsesAccordion = () => false;

export function Leaderboard({ groupId, groupName }: { groupId?: string; groupName?: string }) {
  const { getToken, userId } = useAuth();
  const { t, i18n } = useLingui();
  const compact = useSyncExternalStore(subscribeToWidth, usesAccordion, serverUsesAccordion);
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
  const rows = playerWindow.items;
  const selectedGame = games.data?.games.find((game) => game.id === gameId) ?? games.selectedGame;
  const filteredGames =
    debouncedSearch.length >= 4
      ? games.data?.games.filter((game) =>
          game.name
            .toLocaleLowerCase(i18n.locale)
            .includes(debouncedSearch.toLocaleLowerCase(i18n.locale)),
        )
      : games.data?.games;
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
  const label = groupId ? t`Group leaderboard` : t`Global leaderboard`;
  const sortButtonLabel = direction === "asc" ? t`Sort descending` : t`Sort ascending`;

  function identity(player: Player) {
    const name = formatUsername(player.username, t`Username unavailable`);
    const roles = groupLeaderboardRoles(player);
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
          {groupId && !player.left && player.groupRole === undefined ? (
            <Skeleton aria-label={t`Loading…`} className="mt-1 h-4 w-22 rounded" />
          ) : null}
        </UserIdentity>
      </div>
    );
  }

  function rating(player: Player) {
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
          {groupId
            ? t`This leaderboard only includes rated results from this group’s events.`
            : t`For each game, the global leaderboard includes all rated matches from private and public events.`}
        </p>
      </div>
    </HelpPopover>
  );
  return (
    <SectionHeaderCard
      title={t`Rankings`}
      description={groupId ? groupName : t`Global`}
      leading={
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
          <Medal className="size-5" aria-hidden />
        </span>
      }
      action={help}
    >
      {games.isPending ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : games.isError ? (
        <Button
          variant="outline"
          onPress={() => void games.refetch()}
        >{t`Could not load leaderboards. Retry`}</Button>
      ) : !games.data?.games.length && !debouncedSearch ? (
        <EmptyList icon={<Dices className="size-7" />}>
          {groupId ? t`No rated tables played in this group yet` : t`No rated tables played yet`}
        </EmptyList>
      ) : (
        <>
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
                  isDisabled={games.isFetchingNextPage || games.isPlaceholderData}
                  onPress={() => void games.fetchNextPage()}
                >{t`Load more games`}</Button>
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
          {gameId === null ? (
            <EmptyList
              icon={<Dices className="size-7" />}
            >{t`Choose a game to see the leaderboard`}</EmptyList>
          ) : (
            <>
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
                              onAction={() => setSort(metric)}
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
                    onPress={() => setDirection(direction === "asc" ? "desc" : "asc")}
                  >
                    <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-secondary">
                      <OrderIcon className="size-3.5" aria-hidden="true" />
                    </span>
                  </Button>
                </div>
              </div>
              {players.isPending ? (
                <Skeleton className="h-32 w-full rounded-xl" />
              ) : players.isError && (!players.data || communityAccessDenied(players.error)) ? (
                <Button
                  variant="outline"
                  onPress={() => void players.refetch()}
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
                                    <div className="flex items-center gap-1 ps-2">
                                      {identity(player)}
                                      <Accordion.Heading className="shrink-0">
                                        <Accordion.Trigger className="min-h-11 gap-1.5 px-2 py-1">
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
                                        <Accordion.Body className="px-2 pt-0 pb-2">
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
                          sortDescriptor={{
                            column: sort,
                            direction: direction === "asc" ? "ascending" : "descending",
                          }}
                          onSortChange={({ column, direction: value }) => {
                            const metric = metrics.find((metric) => metric === column);
                            if (!metric) return;
                            setSort(metric);
                            setDirection(value === "ascending" ? "asc" : "desc");
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
                                  allowsSorting
                                  className="bg-surface"
                                >
                                  <Table.SortableColumnHeader className="justify-end gap-1">
                                    <Icon
                                      className={`size-3.5 shrink-0 ${color}`}
                                      aria-hidden="true"
                                    />
                                    {short}
                                  </Table.SortableColumnHeader>
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
                                <Table.Cell className="min-w-0">{identity(player)}</Table.Cell>
                                <Table.Cell className="text-right tabular-nums">
                                  {Math.max(0, player.gamesPlayed - player.nd)}
                                </Table.Cell>
                                <Table.Cell className="text-right tabular-nums">
                                  {player.gamesWon}
                                </Table.Cell>
                                <Table.Cell className="text-right tabular-nums">
                                  {player.nd}
                                </Table.Cell>
                                <Table.Cell>{rating(player)}</Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  )}
                  <div ref={endRef} />
                  {playerWindow.hasNextPage ? (
                    <Button
                      variant="outline"
                      isDisabled={players.isFetchingNextPage}
                      onPress={() => void playerWindow.fetchNextPage()}
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
