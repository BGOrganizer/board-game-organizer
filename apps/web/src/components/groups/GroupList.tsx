"use client";
import { type GroupRecord, groupRecordMemberRoles } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Crown, Mail, Plus, UsersRound } from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { GroupCard } from "./GroupCard";
export function GroupList({
  scope = "mine",
  type,
}: {
  scope?: "mine" | "public";
  type?: GroupRecord["type"];
}) {
  const { t } = useLingui(),
    options = useCommunityApi();
  const filters = useListSearch(groupRecordMemberRoles, scope === "mine" ? 0 : 4),
    list = useGroupRecords(options, scope, filters.search, filters.selected, type);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });
  const searchable = scope !== "public" || Boolean(filters.search);
  return (
    <NotificationAttentionScope
      options={options}
      targets={(communityAccessDenied(list.error) ? [] : list.items)
        .filter((row) => !row.optimistic)
        .map((row) => ({ kind: "group", id: row.id }))}
    >
      <ListPage>
        <ListSearch
          query={filters.query}
          onQueryChange={filters.setQuery}
          label={scope === "mine" ? t`Filter` : t`Search groups`}
          placeholder={scope === "mine" ? t`Filter groups` : t`Search groups`}
          mode={scope === "mine" ? "filter" : "search"}
          selected={filters.selected}
          onToggle={filters.toggle}
          options={
            scope === "mine"
              ? [
                  { key: "admin", label: t`Admin`, icon: Crown },
                  { key: "invited", label: t`Invited`, icon: Mail },
                  { key: "accepted", label: t`Accepted`, icon: Check },
                ]
              : []
          }
        />
        {scope === "public" && !filters.search && !filters.query.trim() ? (
          <p className="text-sm text-muted">{t`Enter at least 4 characters to search`}</p>
        ) : null}
        {searchable && list.isPending ? (
          <div className="space-y-3">
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : null}
        {(communityAccessDenied(list.error) ? [] : list.items).map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            checking={list.isFetching}
            onVerify={() => void list.refetch({ cancelRefetch: false })}
          />
        ))}
        {searchable && !list.isPending && !list.isError && !list.items.length ? (
          <EmptyList icon={<UsersRound className="size-7" />}>{t`No groups found`}</EmptyList>
        ) : null}
        {list.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-danger">{t`Could not load groups`}</p>
            <Button variant="outline" onPress={() => void list.refetch()}>{t`Try again`}</Button>
          </div>
        ) : null}
        <div ref={sentinel} />
        {list.isFetchingNextPage ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : list.hasNextPage ? (
          <Button variant="outline" onPress={() => void list.fetchNextPage()}>
            {list.isFetchNextPageError ? t`Could not load groups. Retry` : t`Load more`}
          </Button>
        ) : null}
        {scope === "mine" ? (
          <FloatingActions href="/groups/new" label={t`Create group`}>
            <Plus className="size-6" aria-hidden />
          </FloatingActions>
        ) : null}
      </ListPage>
    </NotificationAttentionScope>
  );
}
