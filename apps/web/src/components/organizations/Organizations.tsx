"use client";

import { organizationListRoles } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  formatLocationAddress,
  useListSearch,
  useOrganizationList,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import {
  Building2,
  CalendarDays,
  Check,
  Crown,
  Mail,
  MapPin,
  Send,
  UsersRound,
} from "lucide-react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListPage } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { OrganizationArtwork } from "./OrganizationArtwork";
import { OrganizationStatusBadge } from "./OrganizationStatusBadge";

export function Organizations({ scope = "mine" }: { scope?: "mine" | "public" }) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const filters = useListSearch(organizationListRoles);
  const search = filters.search;
  const list = useOrganizationList(options, scope, search, filters.selected);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });
  return (
    <ListPage>
      <ListSearch
        query={filters.query}
        onQueryChange={filters.setQuery}
        label={t`Search organizations`}
        placeholder={t`Search organizations`}
        selected={filters.selected}
        onToggle={filters.toggle}
        options={
          scope === "mine"
            ? [
                { key: "admin", label: t`Admin`, icon: Crown },
                { key: "invited", label: t`Invited`, icon: Mail },
                { key: "accepted", label: t`Accepted`, icon: Check },
                { key: "requested", label: t`Requested`, icon: Send },
              ]
            : []
        }
      />
      {scope === "public" && !search ? (
        !filters.query.trim() ? (
          <p className="text-sm text-default-500">{t`Enter at least 4 characters to search`}</p>
        ) : null
      ) : list.isPending ? (
        <div className="space-y-3">
          {[1, 2, 3].map((id) => (
            <Skeleton key={id} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : null}
      {(communityAccessDenied(list.error) ? [] : list.items).map((organization) => (
        <LinkedListCard
          key={organization.id}
          href={`/organizations/${organization.id}`}
          label={`${t`Open organization`}: ${organization.name}`}
        >
          <OrganizationArtwork organization={organization} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex items-center gap-1 font-semibold">
              <Building2 className="size-4 shrink-0 text-default-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{organization.name}</span>
              <span className="shrink-0">
                <OrganizationStatusBadge organization={organization} />
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm text-default-500">
              <MapPin className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 break-words">
                {formatLocationAddress(organization.location.address)}
              </span>
            </span>
            <span className="flex items-center gap-1 text-sm text-default-500">
              <UsersRound className="size-4" aria-hidden />
              {organization.memberCount} {t`members`}
            </span>
            <span className="flex items-center gap-1 text-sm text-default-500">
              <CalendarDays className="size-4" aria-hidden />
              {organization.publishedEventCount} {t`Published events`}
            </span>
            {organization.role === "invited" ? (
              <span className="block text-xs text-warning">{t`Invitation received`}</span>
            ) : organization.role === "requested" ? (
              <span className="block text-xs text-warning">{t`Membership requested`}</span>
            ) : null}
          </span>
        </LinkedListCard>
      ))}
      {!list.isPending && !list.isError && !list.items.length && (scope !== "public" || search) ? (
        <EmptyList icon={<Building2 className="size-7" />}>{t`No organizations found`}</EmptyList>
      ) : null}
      {list.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-danger">{t`Could not load organizations`}</p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={sentinel} />
      {list.isFetchingNextPage ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : list.hasNextPage ? (
        <Button variant="outline" onPress={() => void list.fetchNextPage()}>
          {list.isFetchNextPageError ? t`Could not load organizations. Retry` : t`Load more`}
        </Button>
      ) : null}
    </ListPage>
  );
}
