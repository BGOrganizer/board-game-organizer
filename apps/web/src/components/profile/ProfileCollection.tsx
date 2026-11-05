"use client";
import type { BggCollectionCounts } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useBggCollection,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, ListBox, Skeleton } from "@heroui/react";
import { Collection, ListBoxLoadMoreItem, ListLayout, Virtualizer } from "@heroui/react/rac";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useRef, useState } from "react";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { GameListRow } from "@/components/games/GameListRow";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileStats } from "./ProfileStats";

const noFilters: readonly string[] = [];
const layoutOptions = { estimatedRowHeight: 76, gap: 8 };
export function ProfileCollection({
  snapshot,
  counts: knownCounts,
}: {
  snapshot: string;
  counts?: BggCollectionCounts;
}) {
  const { t, i18n } = useLingui(),
    o = useCommunityApi();
  const filter = useListSearch(noFilters, 0);
  const q = useBggCollection({ ...o, snapshot, query: filter.search });
  const scope = JSON.stringify([o.apiUrl, o.userId, snapshot, filter.search]);
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
    <section className="space-y-4" aria-label={t`Collection`}>
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
      {pages?.[0]?.counts === null && !knownCounts ? (
        <p className="text-sm text-muted">{t`Synchronize again to include expansions and collection counts.`}</p>
      ) : null}
      <SearchInput
        value={filter.query}
        onChange={filter.setQuery}
        label={t`Filter collection`}
        placeholder={t`Filter games in your collection`}
        inputProps={{ maxLength: 120 }}
      />
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
            className="h-[60vh] min-h-64 w-full overflow-auto"
          >
            <Collection items={items}>
              {(item) => {
                const rating = item.userRating === null ? t`N/A` : number.format(item.userRating);
                return (
                  <ListBox.Item id={item.id} textValue={item.name} className="p-0">
                    <GroupedList>
                      <GameListRow
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
                    </GroupedList>
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
      {hasMore ? (
        <Button
          variant="secondary"
          isDisabled={!cachedMore && (q.isFetching || q.isError)}
          onPress={loadMore}
        >{t`Load more games`}</Button>
      ) : null}
    </section>
  );
}
