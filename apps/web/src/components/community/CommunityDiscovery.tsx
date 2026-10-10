"use client";
import {
  communityAccessDenied,
  useListSearch,
  useOrganizationList,
  usePublicGroups,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";

import { Building2, Search, UsersRound } from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";

const kinds = ["groups", "organizations"] as const;
export function CommunityDiscovery() {
  const { t } = useLingui();
  const options = useCommunityApi();
  const filters = useListSearch(kinds);
  const search = filters.search;
  const groupsEnabled = filters.selected.includes("groups");
  const organizationsEnabled = filters.selected.includes("organizations");
  const groups = usePublicGroups(
    { ...options, enabled: options.enabled !== false && groupsEnabled },
    search,
  );
  const organizations = useOrganizationList(
    { ...options, enabled: options.enabled !== false && organizationsEnabled },
    "public",
    search,
  );
  const g = groupsEnabled && search && !communityAccessDenied(groups.error) ? groups.items : [];
  const o =
    organizationsEnabled && search && !communityAccessDenied(organizations.error)
      ? organizations.items
      : [];
  return (
    <ListPage>
      <ListSearch
        query={filters.query}
        onQueryChange={filters.setQuery}
        label={t`Search groups and organizations`}
        placeholder={t`Search groups and organizations`}
        selected={filters.selected}
        onToggle={filters.toggle}
        options={[
          { key: "groups", label: t`Groups`, icon: UsersRound },
          { key: "organizations", label: t`Organizations`, icon: Building2 },
        ]}
      />
      {!search && !filters.query.trim() ? <p>{t`Enter at least 4 characters to search`}</p> : null}
      {search &&
      ((groupsEnabled && groups.isPending) || (organizationsEnabled && organizations.isPending)) ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : null}
      {g.map((group) => (
        <div key={group.id} className="rounded-xl border border-border p-4">
          <p className="font-semibold">{group.name}</p>
          <p>
            {t`Public group`} · {group.memberCount} {t`members`}
          </p>
          <p className="text-sm text-default-500">{t`Group join requests will be available later`}</p>
        </div>
      ))}
      {o.map((org) => (
        <LinkedListCard
          key={org.id}
          href={`/organizations/${org.id}`}
          label={`${t`Open organization`}: ${org.name}`}
        >
          <span className="font-semibold">{org.name}</span>
        </LinkedListCard>
      ))}
      {search &&
      (!groupsEnabled || !groups.isPending) &&
      (!organizationsEnabled || !organizations.isPending) &&
      !g.length &&
      !o.length &&
      (!groupsEnabled || !groups.isError) &&
      (!organizationsEnabled || !organizations.isError) ? (
        <EmptyList icon={<Search className="size-7" />}>{t`No results found`}</EmptyList>
      ) : null}
      {[groupsEnabled ? groups : null, organizationsEnabled ? organizations : null].map((list) =>
        list && search ? (
          <div key={list === groups ? "groups" : "organizations"}>
            {list.isError ? (
              <div role="alert">
                <p>{t`Search failed`}</p>
                <Button variant="outline" onPress={() => void list.refetch()}>{t`Retry`}</Button>
              </div>
            ) : null}
            {list.hasNextPage ? (
              <Button
                isDisabled={list.isFetchingNextPage}
                onPress={() => void list.fetchNextPage()}
              >{t`Load more`}</Button>
            ) : null}
            {list.isFetchingNextPage ? <Skeleton className="h-16 w-full rounded-xl" /> : null}
          </div>
        ) : null,
      )}
    </ListPage>
  );
}
