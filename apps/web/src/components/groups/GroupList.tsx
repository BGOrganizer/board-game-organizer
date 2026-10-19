"use client";
import { groupRecordListRoles } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useGroupRecordActions,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Check, Crown, Mail, Plus, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { GroupCard } from "./GroupCard";
export function GroupList({ scope = "mine" }: { scope?: "mine" | "public" }) {
  const { t } = useLingui(),
    options = useCommunityApi();
  const filters = useListSearch(groupRecordListRoles),
    list = useGroupRecords(options, scope, filters.search, filters.selected),
    actions = useGroupRecordActions(options);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });
  const searchable = scope !== "public" || Boolean(filters.search);
  return (
    <ListPage>
      <ListSearch
        query={filters.query}
        onQueryChange={filters.setQuery}
        label={t`Search groups`}
        placeholder={t`Search groups`}
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
      {scope === "mine" ? (
        <Link href="/groups/search" className="inline-flex items-center gap-2 text-sm text-accent">
          <Search className="size-4" aria-hidden />
          {t`Search public groups`}
        </Link>
      ) : !filters.search && !filters.query.trim() ? (
        <p className="text-sm text-default-500">{t`Enter at least 4 characters to search`}</p>
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
          pending={actions.busy}
          onRespond={(action) => {
            if (group.myMembership)
              actions.membership.mutate({
                id: group.id,
                userId: group.myMembership.userId,
                input: { action, version: group.myMembership.version },
              });
          }}
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
          <Plus className="size-6" />
        </FloatingActions>
      ) : null}
    </ListPage>
  );
}
