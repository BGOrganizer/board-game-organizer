"use client";
import {
  type GroupRecord,
  groupRecordMemberRoles,
  type RecordListOrder,
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
  Search,
  SearchX,
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
  const minimumLength = scope === "public" ? 4 : 0;
  const [order, setOrder] = useState<RecordListOrder>({ sort: "date", direction: "desc" });
  const filters = useListSearch(groupRecordMemberRoles, minimumLength),
    list = useGroupRecords(options, scope, filters.search, filters.selected, type, order);
  const needsQuery = filters.query.trim().length < minimumLength;
  const searchable = !needsQuery && (scope === "mine" || Boolean(filters.search));
  const items = searchable && !communityAccessDenied(list.error) ? list.items : [];
  const EmptyIcon = scope === "public" ? SearchX : UsersRound;
  const sentinel = useInfiniteScroll({
    hasNextPage: searchable && Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });
  const sectionHelp =
    scope === "public"
      ? {
          title: t`Search`,
          label: t`Group search help`,
          icon: Search,
          description: t`Search for approved public groups by name. Enter at least four characters.`,
        }
      : type === "PRIVATE"
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
      <ListPage hasFloatingActions={scope === "mine"}>
        {sectionHelp ? (
          <HelpSectionCard
            title={sectionHelp.title}
            label={sectionHelp.label}
            icon={sectionHelp.icon}
          >
            <p>{sectionHelp.description}</p>
          </HelpSectionCard>
        ) : null}
        <ListSearch
          query={filters.query}
          onQueryChange={filters.setQuery}
          label={scope === "mine" ? t`Filter` : t`Search groups`}
          placeholder={scope === "mine" ? t`Filter groups` : t`Search groups`}
          mode={scope === "mine" ? "filter" : "search"}
          showSearchGuidance={false}
          selected={filters.selected}
          onToggle={filters.toggle}
          options={
            scope === "mine"
              ? [
                  {
                    key: "administrator",
                    label: t({ id: "list.filter.admin", message: "Admin" }),
                    icon: Crown,
                  },
                  { key: "moderator", label: t`Moderator`, icon: ShieldCheck },
                  { key: "member", label: t`Member`, icon: Check },
                  { key: "pending", label: t`Pending`, icon: Clock3 },
                ]
              : []
          }
        />
        {scope === "mine" ? <ListOrdering order={order} onChange={setOrder} /> : null}
        {needsQuery ? (
          <EmptyList icon={<Search className="size-7" />}>
            {t`Enter at least 4 characters to search`}
          </EmptyList>
        ) : null}
        {searchable && list.isPending ? (
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
            checking={list.isFetching}
            onVerify={() => void list.refetch({ cancelRefetch: false })}
          />
        ))}
        {searchable &&
        !list.isPending &&
        !list.isError &&
        !list.hasNextPage &&
        !list.items.length ? (
          <EmptyList icon={<EmptyIcon className="size-7" />}>{t`No groups found`}</EmptyList>
        ) : null}
        {searchable && list.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-danger">{t`Could not load groups`}</p>
            <Button variant="outline" onPress={() => void list.refetch()}>{t`Try again`}</Button>
          </div>
        ) : null}
        <div ref={sentinel} />
        {searchable && list.isFetchingNextPage ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : searchable && list.hasNextPage ? (
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
