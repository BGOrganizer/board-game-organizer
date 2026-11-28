"use client";
import {
  type GroupRecord,
  groupRecordMemberRoles,
  type RecordListOrder,
  recordListSortFields,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Check,
  Clock3,
  Crown,
  Globe,
  LockKeyhole,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { ListOrdering } from "@/components/common/ui/ListOrdering";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { useListSearchHeader } from "@/lib/useListSearchHeader";
import { GroupCard } from "./GroupCard";
export function GroupList({
  type,
  onSearchActiveChange,
}: {
  type?: GroupRecord["type"];
  onSearchActiveChange?: (active: boolean) => void;
}) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const [order, setOrder] = useState<RecordListOrder>({ sort: "date", direction: "desc" });
  const filters = useListSearch(groupRecordMemberRoles, 0);
  const list = useGroupRecords(options, "mine", filters.search, filters.selected, type, order);
  const headerSearch = useListSearchHeader(filters.reset, onSearchActiveChange);
  const items = communityAccessDenied(list.error) ? [] : list.items;
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });
  const sectionHelp =
    type === "PRIVATE"
      ? {
          title: t`Private groups`,
          label: t`Private groups help`,
          icon: LockKeyhole,
          description: t`Private groups you manage, belong to or have a pending invitation to join.`,
        }
      : type === "PUBLIC"
        ? {
            title: t`Public groups`,
            label: t`Public groups help`,
            icon: Globe,
            description: t`Public groups you manage or belong to, and groups with a pending request or invitation. Groups you manage may still be awaiting approval.`,
          }
        : null;
  return (
    <NotificationAttentionScope
      options={options}
      targets={items.filter((row) => !row.optimistic).map((row) => ({ kind: "group", id: row.id }))}
    >
      <ListPage hasFloatingActions>
        {sectionHelp && !headerSearch.active ? (
          <HelpSectionCard
            title={sectionHelp.title}
            label={sectionHelp.label}
            icon={sectionHelp.icon}
          >
            <p>{sectionHelp.description}</p>
          </HelpSectionCard>
        ) : null}
        <div className="space-y-2">
          <ListSearch
            headerSearch={headerSearch}
            query={filters.query}
            onQueryChange={filters.setQuery}
            label={t`Filter`}
            placeholder={t`Filter groups`}
            mode="filter"
            showSearchGuidance={false}
            selected={filters.selected}
            onToggle={filters.toggle}
            options={[
              {
                key: "administrator",
                label: t({ id: "list.filter.admin", message: "Admin" }),
                icon: Crown,
              },
              { key: "moderator", label: t`Moderator`, icon: ShieldCheck },
              { key: "member", label: t`Member`, icon: Check },
              { key: "pending", label: t`Pending`, icon: Clock3 },
            ]}
          />
          <ListOrdering fields={recordListSortFields} order={order} onChange={setOrder} />
        </div>
        {list.isPending ? (
          <div className="space-y-3">
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : null}
        {items.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            checking={group.optimistic?.phase === "verifying" && list.isFetching}
            onVerify={
              group.optimistic?.phase === "verifying"
                ? () => void list.refetch({ cancelRefetch: false })
                : undefined
            }
          />
        ))}
        {!list.isPending && !list.isError && !list.hasNextPage && !list.items.length ? (
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
        <FloatingActions href="/groups/new" label={t`Create group`}>
          <Plus className="size-6" aria-hidden />
        </FloatingActions>
      </ListPage>
    </NotificationAttentionScope>
  );
}
