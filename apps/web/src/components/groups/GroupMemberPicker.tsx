"use client";
import { communityAccessDenied, useGroupPeople, useListSearch } from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserRoundPlus } from "lucide-react";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
export function GroupMemberPicker({
  groupId,
  disabled = false,
  excludeIds = [],
  onSelect,
}: {
  groupId: string;
  disabled?: boolean;
  excludeIds?: readonly string[];
  onSelect: (person: { id: string; name: string; avatarUrl: string | null }) => void;
}) {
  const { t } = useLingui(),
    o = useCommunityApi(),
    f = useListSearch<never>([]),
    q = useGroupPeople(o, groupId, "accepted", f.search),
    end = useInfiniteScroll({
      hasNextPage: !!q.hasNextPage,
      isFetchingNextPage: q.isFetchingNextPage,
      isFetchNextPageError: q.isFetchNextPageError,
      fetchNextPage: q.fetchNextPage,
    });
  return (
    <div className="space-y-3">
      <ListSearch
        query={f.query}
        onQueryChange={f.setQuery}
        label={t`Search members`}
        placeholder={t`Search members`}
        options={[]}
        selected={[]}
        onToggle={f.toggle}
      />
      {(communityAccessDenied(q.error) ? [] : q.items)
        .filter((row) => !excludeIds.includes(row.userId))
        .map((row) => (
          <div
            key={row.userId}
            className="flex items-center justify-between gap-3 rounded-xl bg-default-100 p-3"
          >
            <span>{row.name ?? row.userId}</span>
            <Button
              isIconOnly
              size="sm"
              aria-label={`${t`Select user`}: ${row.name ?? row.userId}`}
              isDisabled={disabled}
              onPress={() =>
                onSelect({ id: row.userId, name: row.name ?? row.userId, avatarUrl: row.avatarUrl })
              }
            >
              <UserRoundPlus className="size-4" />
            </Button>
          </div>
        ))}
      {q.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !q.isError && !q.items.length ? (
        <p>{t`No members found`}</p>
      ) : null}
      {q.isError ? (
        <div role="alert">
          <p className="text-danger">{t`Could not load group members`}</p>
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
