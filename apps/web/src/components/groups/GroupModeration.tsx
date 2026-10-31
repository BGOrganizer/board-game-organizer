"use client";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UsersRound } from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { GroupCard } from "./GroupCard";
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
    <ListPage>
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
        <GroupCard key={row.id} group={row} href={`/moderation/${row.id}`} />
      ))}
      {q.isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !q.isError && !q.items.length ? (
        <EmptyList icon={<UsersRound className="size-7" />}>{t`No pending reviews`}</EmptyList>
      ) : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load moderation queue`}</p>
          <Button variant="outline" onPress={() => void q.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={end} />
      {q.isFetchingNextPage ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : q.hasNextPage ? (
        <Button variant="outline" onPress={() => void q.fetchNextPage()}>{t`Load more`}</Button>
      ) : null}
    </ListPage>
  );
}
