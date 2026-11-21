"use client";
import {
  communityAccessDenied,
  groupUserRoles,
  useGroupPeople,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { UserRoundPlus, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
export function GroupMemberPicker({
  groupId,
  disabled = false,
  excludeIds = [],
  children,
  onSelect,
}: {
  groupId: string;
  disabled?: boolean;
  excludeIds?: readonly string[];
  children?: ReactNode;
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
      {children}
      <ListSearch
        query={f.query}
        onQueryChange={f.setQuery}
        label={t`Search members`}
        placeholder={t`Search members`}
        options={[]}
        selected={[]}
        onToggle={f.toggle}
      />
      <GroupedList>
        {(communityAccessDenied(q.error) ? [] : q.items)
          .filter((row) => !excludeIds.includes(row.userId))
          .map((row) => (
            <UserListRow
              key={row.userId}
              name={row.name ?? row.userId}
              avatarUrl={row.avatarUrl}
              badge={<UserRoleBadge roles={groupUserRoles(row)} />}
              actions={
                <Button
                  isIconOnly
                  size="sm"
                  aria-label={`${t`Select user`}: ${row.name ?? row.userId}`}
                  isDisabled={disabled}
                  onPress={() =>
                    onSelect({
                      id: row.userId,
                      name: row.name ?? row.userId,
                      avatarUrl: row.avatarUrl,
                    })
                  }
                >
                  <UserRoundPlus className="size-4" />
                </Button>
              }
            />
          ))}
      </GroupedList>
      {q.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : !q.isError && !q.items.length ? (
        <EmptyList icon={<UsersRound className="size-7" />}>{t`No members found`}</EmptyList>
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
