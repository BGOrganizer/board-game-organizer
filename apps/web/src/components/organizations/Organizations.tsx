"use client";

import {
  communityAccessDenied,
  formatLocationAddress,
  useOrganizationList,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Building2, Search, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";
import { OrganizationArtwork } from "./OrganizationArtwork";

export function Organizations({ scope = "mine" }: { scope?: "mine" | "public" }) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timeout);
  }, [query]);
  const list = useOrganizationList(options, scope, search);
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
  });
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-28">
      <TextField value={query} onChange={setQuery} className="w-full">
        <Label>{t`Search organizations`}</Label>
        <div className="flex items-center gap-2">
          <Search aria-hidden className="size-4" />
          <Input name="organization-search" autoComplete="off" maxLength={120} />
          {query ? (
            <Button
              isIconOnly
              variant="ghost"
              aria-label={t`Clear search`}
              onPress={() => setQuery("")}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </TextField>
      {scope === "public" && !search ? (
        <p className="text-sm text-default-500">{t`Enter at least 4 characters to search`}</p>
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
            <span className="block truncate font-semibold">{organization.name}</span>
            <span className="block truncate text-sm text-default-500">
              {formatLocationAddress(organization.location.address)}
            </span>
            <span className="flex items-center gap-1 text-sm text-default-500">
              <UsersRound className="size-4" />
              {organization.memberCount} {t`members`}
            </span>
            {organization.status === "PENDING" || organization.status === "MODIFIED" ? (
              <span className="block text-xs text-warning">
                {organization.reviewStatus === "REJECTED"
                  ? t`Changes rejected`
                  : t`Awaiting review`}
              </span>
            ) : null}
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
    </section>
  );
}
