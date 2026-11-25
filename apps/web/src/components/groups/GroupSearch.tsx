"use client";

import { communityAccessDenied } from "@board-game-organizer/shared";
import { Button, Label, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, LocateFixed, Search, SearchX, UsersRound } from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { ListPage } from "@/components/common/ui/ListPage";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { GroupCard } from "./GroupCard";
import { useGroupDiscoverySession } from "./GroupDiscoverySession";
import { GroupSearchDistance } from "./GroupSearchDistance";

export function GroupSearch() {
  const { t } = useLingui();
  const options = useCommunityApi();
  const { search } = useGroupDiscoverySession();
  const { list } = search;
  const items = communityAccessDenied(list.error) ? [] : list.items;
  const sentinel = useInfiniteScroll({
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });

  return (
    <NotificationAttentionScope
      options={options}
      targets={items.map((row) => ({ kind: "group", id: row.id }))}
    >
      <ListPage>
        {!search.active ? (
          <HelpSectionCard icon={Search} title={t`Group search`} label={t`Group search help`}>
            <p>
              {t`Search approved public groups by name or venue address. Use the filters to find nearby groups or groups with friends.`}
            </p>
          </HelpSectionCard>
        ) : null}
        <div className="space-y-3">
          <SearchInput
            value={search.query}
            onChange={search.setQuery}
            label={<Label className="sr-only">{t`Search groups`}</Label>}
            placeholder={t`Search groups`}
            leading={
              search.active ? (
                <Button
                  slot={null}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={t`Back`}
                  onPress={search.close}
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </Button>
              ) : undefined
            }
            inputProps={{
              onFocus: search.open,
              maxLength: 120,
              autoComplete: "off",
              onKeyDown: (event) => {
                if (search.active && event.key === "Escape") {
                  event.preventDefault();
                  event.currentTarget.blur();
                  search.close();
                }
              },
            }}
          />
          <FilterChips
            options={[
              { key: "friends", label: t`Friends`, icon: UsersRound },
              { key: "nearby", label: t`Near me`, icon: LocateFixed },
            ]}
            selected={[
              ...(search.nearby ? (["nearby"] as const) : []),
              ...(search.friends ? (["friends"] as const) : []),
            ]}
            onToggle={(key) =>
              key === "nearby" ? void search.toggleNearby() : search.toggleFriends()
            }
          >
            {search.nearby ? (
              <GroupSearchDistance radiusKm={search.radiusKm} onChange={search.setRadiusKm} />
            ) : null}
          </FilterChips>
          {search.locating ? <p role="status">{t`Loading…`}</p> : null}
          {search.locationError ? (
            <p role="alert" className="text-danger">{t`Location unavailable`}</p>
          ) : null}
        </div>
        {list.isPending ? (
          <div className="space-y-3">
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : null}
        {items.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
        {!items.length && !list.isPending && !list.isError && !list.hasNextPage ? (
          <EmptyList icon={<SearchX className="size-7" />}>
            {search.friends && !search.query.trim() && !search.nearby
              ? t`No public groups with your friends`
              : t`No groups found`}
          </EmptyList>
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
      </ListPage>
    </NotificationAttentionScope>
  );
}
