"use client";
import type { BggCollectionCounts } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useBggCollection,
  useBggCollectionFilters,
} from "@board-game-organizer/shared";
import { Button, ListBox, Skeleton } from "@heroui/react";
import { Collection, ListBoxLoadMoreItem, ListLayout, Virtualizer } from "@heroui/react/rac";
import { useLingui } from "@lingui/react/macro";
import { Gamepad2, Heart, Puzzle, UsersRound } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListCard } from "@/components/games/GameListCard";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileStats } from "./ProfileStats";

const layoutOptions = { estimatedRowHeight: 76, gap: 8 };
export function ProfileCollection({
  snapshot,
  counts: knownCounts,
  subjectId,
  viewerSnapshot,
}: {
  snapshot: string;
  counts?: BggCollectionCounts;
  subjectId?: string;
  viewerSnapshot?: string;
}) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi();
  const other = Boolean(subjectId && subjectId !== o.userId);
  const filter = useBggCollectionFilters(viewerSnapshot);
  const q = useBggCollection({
    ...o,
    subjectId,
    snapshot,
    query: filter.search,
    types: filter.types,
    wishlist: filter.wishlist,
    commonSnapshot: other ? filter.commonSnapshot : undefined,
  });
  const scope = JSON.stringify([
    o.apiUrl,
    o.userId,
    subjectId,
    snapshot,
    filter.search,
    filter.types,
    filter.wishlist,
    filter.commonSnapshot,
  ]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [window, setWindow] = useState({ scope, pages: 1 });
  if (window.scope !== scope) setWindow({ scope, pages: 1 });
  const count = window.scope === scope ? window.pages : 1;
  const pages = communityAccessDenied(q.error) ? undefined : q.data?.pages;
  const items = useMemo(
    () => pages?.slice(0, count).flatMap((page) => page.items) ?? [],
    [pages, count],
  );
  const cachedMore = (pages?.length ?? 0) > count;
  const hasMore = cachedMore || q.hasNextPage;
  const loadMore = useCallback(() => {
    if (
      scopeRef.current !== scope ||
      (!cachedMore && (!q.hasNextPage || q.isFetching || q.isError))
    )
      return;
    setWindow((old) =>
      old.scope === scope && old.pages < count + 1 ? { scope, pages: count + 1 } : old,
    );
    if (!cachedMore) void q.fetchNextPage({ cancelRefetch: false });
  }, [scope, cachedMore, q.hasNextPage, q.isFetching, q.isError, q.fetchNextPage, count]);
  const counts = communityAccessDenied(q.error) ? undefined : (pages?.[0]?.counts ?? knownCounts);
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 2 });
  return (
    <section data-input-scope className="space-y-4" aria-label={t`Collection`}>
      {q.isPending && !counts ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : (
        <ProfileStats
          items={[
            {
              label: t`Games without expansions`,
              value: counts ? number.format(counts.withoutExpansions) : t`N/A`,
            },
            {
              label: t`Games including expansions`,
              value: counts ? number.format(counts.withExpansions) : t`N/A`,
            },
            { label: t`Wishlist`, value: counts ? number.format(counts.wishlist) : t`N/A` },
          ]}
        />
      )}
      {pages?.[0]?.counts === null && !knownCounts && !other ? (
        <p className="text-sm text-muted">{t`Synchronize again to include expansions and collection counts.`}</p>
      ) : null}
      <div data-collection-filters className="sticky top-0 z-10 space-y-2 bg-background py-2">
        <SearchInput
          value={filter.query}
          onChange={filter.setQuery}
          label={t`Filter collection`}
          placeholder={t`Filter collection games`}
          inputProps={{
            maxLength: 120,
          }}
        />
        <FilterChips
          selected={filter.selected}
          onToggle={filter.toggle}
          options={[
            { key: "games", label: t`Games`, icon: Gamepad2 },
            { key: "expansions", label: t`Expansions`, icon: Puzzle },
            { key: "wishlist", label: t`Wishlist`, icon: Heart },
            ...(other
              ? [
                  {
                    key: "common" as const,
                    label: t`In common`,
                    icon: UsersRound,
                    disabled: !viewerSnapshot,
                  },
                ]
              : []),
          ]}
        />
        {other && !viewerSnapshot ? (
          <p className="text-sm text-muted">{t`Synchronize your BGG collection to find games in common.`}</p>
        ) : null}
      </div>
      <div className="min-h-[var(--input-results-height,60dvh)]">
        {q.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-danger">{t`Could not load collection`}</p>
            <Button variant="secondary" onPress={() => void q.refetch()}>{t`Try again`}</Button>
          </div>
        ) : null}
        {q.isPending && !pages ? <Skeleton className="h-24 w-full rounded-xl" /> : null}
        {!q.isPending && !q.isError && !hasMore && items.length === 0 ? (
          <p role="status" className="text-muted">{t`No games found`}</p>
        ) : null}
        {items.length ? (
          <Virtualizer layout={ListLayout} layoutOptions={layoutOptions} shouldObserveItemSize>
            <ListBox
              key={scope}
              aria-label={t`Collection games`}
              selectionMode="none"
              data-input-results
              className="h-[var(--input-results-height,60dvh)] min-h-24 w-full overflow-auto"
            >
              <Collection items={items}>
                {(item) => {
                  const rating = item.userRating === null ? t`N/A` : number.format(item.userRating);
                  return (
                    <ListBox.Item id={item.id} textValue={item.name} className="p-0">
                      <GameListCard
                        name={item.name}
                        imageUrl={item.imageUrl}
                        year={item.year}
                        average={item.average}
                        rank={item.rank}
                        actions={
                          <span className="min-w-11 text-center font-semibold tabular-nums">
                            <span className="sr-only">{`${t`Personal BGG rating`}: `}</span>
                            {rating}
                          </span>
                        }
                      />
                    </ListBox.Item>
                  );
                }}
              </Collection>
              {hasMore && !q.isError ? (
                <ListBoxLoadMoreItem onLoadMore={loadMore} isLoading={q.isFetchingNextPage}>
                  {q.isFetchingNextPage ? <Skeleton className="h-12 w-full rounded-xl" /> : null}
                </ListBoxLoadMoreItem>
              ) : null}
            </ListBox>
          </Virtualizer>
        ) : null}
      </div>
    </section>
  );
}
