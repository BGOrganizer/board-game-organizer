"use client";

import type { MatchCardStatus } from "@board-game-organizer/shared";
import {
  formatLocationAddress,
  formatMatchDateTime,
  matchCardData,
  matchCardStatusColor,
  resolveApiUrl,
  useListFilters,
  useMatches,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Avatar as DiceBearAvatar, Style } from "@dicebear/core";
import waves from "@dicebear/styles/waves.json" with { type: "json" };
import { Button, Chip, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  CalendarDays,
  Check,
  Crown,
  Dices,
  MapPin,
  Medal,
  Plus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListSearchFilters } from "@/components/common/ui/ListSearchFilters";
import { MatchWizard } from "@/components/matches/MatchWizard";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useMutationFeedback } from "@/lib/useMutationFeedback";

const wavesStyle = new Style(waves);

function MatchArtwork({ name, adminLabel }: { name: string; adminLabel?: string }) {
  const src = useMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(new DiceBearAvatar(wavesStyle, { seed: name, size: 72 }).toString())}`,
    [name],
  );
  return (
    <span className="relative size-16 shrink-0">
      <span className="block size-16 overflow-hidden rounded-xl bg-accent/10" aria-hidden="true">
        {/* biome-ignore lint/performance/noImgElement: Locally generated DiceBear SVG. */}
        <img src={src} alt="" className="match-waves relative -top-1 -left-1 size-[72px]" />
      </span>
      {adminLabel && (
        <span
          className="absolute top-0 left-0 rounded-br-lg bg-surface p-1 shadow-sm"
          role="img"
          aria-label={adminLabel}
        >
          <Crown className="h-4 w-4 text-warning" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

function apiUrl(): string {
  return resolveApiUrl(process.env.NEXT_PUBLIC_API_URL);
}

function protectionBypass(): string | undefined {
  return process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS;
}

export function Matches() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const { t, i18n } = useLingui();
  const mutationFeedback = useMutationFeedback();
  const filters = useListFilters();
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let active = true;
    getToken()
      .then((tok) => active && setToken(tok ?? null))
      .catch(() => active && setToken(null));
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const matches = useMatches({
    apiUrl: apiUrl(),
    token,
    getToken,
    protectionBypass: protectionBypass(),
    userId,
    feedback: mutationFeedback,
    listFilters: filters.filters,
  });
  const endRef = useInfiniteScroll({
    hasNextPage: matches.paging?.hasNextPage,
    isFetchingNextPage: matches.paging?.isFetchingNextPage,
    isFetchNextPageError: matches.paging?.isFetchNextPageError,
    fetchNextPage: () => matches.paging?.fetchNextPage() ?? Promise.resolve(),
  });

  if (creating) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <MatchWizard onCreated={() => setCreating(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-24">
      <ListSearchFilters
        query={filters.query}
        onQueryChange={filters.setQuery}
        roles={filters.roles}
        onToggle={filters.toggleRole}
        label={t`Search matches`}
        placeholder={t`Search matches`}
      />

      {matches.list.isPending && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}
      {matches.list.isError && <p className="text-sm text-danger">{t`Could not load matches`}</p>}
      {matches.list.data && matches.list.data.length === 0 && !matches.list.isError && (
        <EmptyList icon={<Dices className="size-7" />}>
          {filters.roles.length === 3 && !filters.filters.query
            ? t`No matches yet — create your first one!`
            : t`No matches match your filters`}
        </EmptyList>
      )}

      <div
        className={`grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${matches.list.data?.length ? "min-h-36" : ""}`}
      >
        {matches.list.data?.map((match) => {
          const invitation = match.invitations.find(
            (candidate) => candidate.inviteeUserId === userId,
          );
          const card = matchCardData(match);
          const statusLabels: Record<MatchCardStatus, string> = {
            PLANNING: t`Planning`,
            CREATED: t`Confirmed`,
            IN_PROGRESS: t`In progress`,
            TERMINATED: t`Terminated`,
            CANCELLED: t`Cancelled`,
          };
          const gameLabel =
            card.gameCount === undefined
              ? (card.selectedGameName ?? t`Game unavailable`)
              : `${card.gameCount} ${card.gameCount === 1 ? t`game` : t`games`}`;
          const dateLabel = card.date ? formatMatchDateTime(card.date, i18n.locale) : null;
          const playersLabel =
            match.status === "PLANNING"
              ? `${card.players}/${card.maxPlayers}`
              : String(card.players);
          const extraLocations = card.additionalLocations
            ? `+${card.additionalLocations} ${card.additionalLocations === 1 ? t`location` : t`locations`}`
            : "";
          const extraDates = card.additionalDates
            ? `+${card.additionalDates} ${card.additionalDates === 1 ? t`date` : t`dates`}`
            : "";
          return (
            <LinkedListCard
              key={match.id}
              href={match.optimistic ? "/matches" : `/matches/${match.id}`}
              label={`${t`Open match`}: ${match.name}, ${statusLabels[match.status]}, ${dateLabel ? `${dateLabel.date} ${dateLabel.time}` : ""} ${extraDates}, ${t`Players`}: ${playersLabel}, ${gameLabel}${match.adminUserId === userId ? `, ${t`Administrator`}` : ""}${card.winnerNames?.length ? `, ${card.winnerNames.length === 1 ? t`Winner` : t`Winners`}: ${card.winnerNames.join(", ")}` : ""}`}
              disabled={match.optimistic}
              actions={
                !match.eventTable && invitation?.status === "PENDING" ? (
                  <>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="outline"
                      className="h-8 min-h-8 w-8 min-w-8"
                      aria-label={t`Decline`}
                      isDisabled={matches.respondInvitation.isPending}
                      onPress={() =>
                        matches.respondInvitation.mutate({
                          invitationId: invitation.id,
                          decision: "decline",
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="outline"
                      className="h-8 min-h-8 w-8 min-w-8 bg-surface text-success"
                      aria-label={t`Accept`}
                      isDisabled={matches.respondInvitation.isPending}
                      onPress={() =>
                        matches.respondInvitation.mutate({
                          invitationId: invitation.id,
                          decision: "accept",
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : undefined
              }
            >
              <MatchArtwork
                name={match.name}
                adminLabel={match.adminUserId === userId ? t`Administrator` : undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{match.name}</p>
                    {match.eventTable ? (
                      <span className="text-sm text-muted">{t`Event table`}</span>
                    ) : null}
                  </div>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={matchCardStatusColor[match.status]}
                    className="shrink-0"
                  >
                    {statusLabels[match.status]}
                  </Chip>
                </div>
                {card.date && dateLabel && (
                  <div className="mt-2 flex min-w-0 items-center gap-1 whitespace-nowrap text-xs text-default-600">
                    <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <time className="min-w-0 truncate" dateTime={card.date}>
                      {dateLabel.date}
                    </time>
                    <time className="shrink-0" dateTime={card.date}>
                      {dateLabel.time}
                    </time>
                    {extraDates && <span className="ml-auto shrink-0">{extraDates}</span>}
                  </div>
                )}
                {card.location && (
                  <div
                    className="mt-2 flex min-w-0 items-start gap-1 text-xs text-default-600"
                    data-testid="match-location"
                  >
                    <MapPin className="size-4 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1">
                        <span
                          className="min-w-0 flex-1 truncate font-medium"
                          title={card.location.name}
                        >
                          {card.location.name}
                        </span>
                        {extraLocations && (
                          <span className="shrink-0 whitespace-nowrap">{extraLocations}</span>
                        )}
                      </div>
                      <p className="truncate text-default-500" title={card.location.address}>
                        {formatLocationAddress(card.location.address)}
                      </p>
                    </div>
                  </div>
                )}
                <div
                  className={`mt-2 flex min-w-0 items-center gap-3 overflow-hidden text-xs text-default-500 ${invitation?.status === "PENDING" ? "pr-20" : ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <UsersRound className="h-4 w-4" aria-hidden="true" />
                    {playersLabel}
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Dices className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="max-w-[25ch] truncate" title={gameLabel}>
                      {gameLabel}
                    </span>
                  </span>
                </div>
                {card.winnerNames && card.winnerNames.length > 0 && (
                  <div className="mt-2 flex min-w-0 items-start gap-1 text-xs">
                    <Medal
                      className="h-4 w-4 shrink-0 text-warning"
                      aria-label={card.winnerNames.length === 1 ? t`Winner` : t`Winners`}
                    />
                    <span className="min-w-0">
                      <strong className="block whitespace-pre-line text-default-foreground">
                        {card.winnerNames.join("\n")}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            </LinkedListCard>
          );
        })}
      </div>

      {matches.paging?.hasNextPage && (
        <>
          <div ref={endRef} className="h-px" aria-hidden="true" />
          {matches.paging.isFetchingNextPage ? (
            <Skeleton className="mt-3 h-16 w-full rounded-xl" />
          ) : (
            <Button
              variant="outline"
              className="mt-3"
              onPress={() => void matches.paging?.fetchNextPage()}
            >
              {matches.paging.isFetchNextPageError
                ? t`Could not load matches. Retry`
                : t`Load more`}
            </Button>
          )}
        </>
      )}
      {matches.respondInvitation.isError && (
        <p className="mt-3 text-sm text-danger">{t`Could not update the invitation`}</p>
      )}

      <Button
        aria-label={t`Create a match`}
        onPress={() => setCreating(true)}
        className="fixed right-4 bottom-4 z-40 h-12 w-12 rounded-full shadow-lg sm:right-6 sm:bottom-6 sm:h-14 sm:w-14"
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
