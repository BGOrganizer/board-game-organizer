"use client";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
export function GroupModeration() {
  const { t } = useLingui(),
    o = useCommunityApi(),
    f = useListSearch<never>([]),
    q = useGroupRecords(o, "moderation", f.search),
    end = useInfiniteScroll({
      hasNextPage: !!q.hasNextPage,
      isFetchingNextPage: q.isFetchingNextPage,
      isFetchNextPageError: q.isFetchNextPageError,
      fetchNextPage: q.fetchNextPage,
    });
  return (
    <div className="space-y-4">
      <ListSearch
        query={f.query}
        onQueryChange={f.setQuery}
        label={t`Search groups`}
        placeholder={t`Search groups`}
        options={[]}
        selected={[]}
        onToggle={f.toggle}
      />
      {(communityAccessDenied(q.error) ? [] : q.items).map((row) => (
        <Link
          key={row.id}
          href={`/moderation/${row.id}`}
          className="block rounded-xl bg-default-100 p-4 text-accent"
        >
          {row.name}
        </Link>
      ))}
      {q.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !q.isError && !q.items.length ? (
        <p>{t`No pending reviews`}</p>
      ) : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load moderation queue`}</p>
          <Button onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={end} />
      {q.hasNextPage ? (
        <Button
          isDisabled={q.isFetchingNextPage}
          onPress={() => void q.fetchNextPage()}
        >{t`Load more`}</Button>
      ) : null}
    </div>
  );
}
