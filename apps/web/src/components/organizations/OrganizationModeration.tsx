"use client";
import {
  CommunityApiError,
  communityAccessDenied,
  formatLocationAddress,
  useOrganizationList,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ShieldCheck } from "lucide-react";

import { EmptyList } from "@/components/common/ui/EmptyList";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { OrganizationArtwork } from "@/components/organizations/OrganizationArtwork";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useInfiniteScroll } from "@/lib/useInfiniteScroll";

export function OrganizationModeration() {
  const { t } = useLingui();
  const options = useCommunityApi();
  const list = useOrganizationList(options, "moderation");
  const sentinel = useInfiniteScroll({
    hasNextPage: Boolean(list.hasNextPage),
    isFetchingNextPage: list.isFetchingNextPage,
    isFetchNextPageError: list.isFetchNextPageError,
    fetchNextPage: list.fetchNextPage,
  });
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 pb-28">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5" />
        {t`Organization moderation`}
      </h1>
      {list.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {(communityAccessDenied(list.error) ? [] : list.items).map((organization) => (
        <LinkedListCard
          key={organization.id}
          href={`/moderation/${organization.id}`}
          label={`${t`Review organization`}: ${organization.name}`}
        >
          <OrganizationArtwork organization={organization} />
          <span className="min-w-0 space-y-1">
            <span className="block truncate font-semibold">{organization.name}</span>
            <span className="block truncate text-sm text-default-500">
              {formatLocationAddress(organization.location.address)}
            </span>
            <span className="block text-xs text-warning">
              {organization.status === "MODIFIED" ? t`Proposed changes` : t`New organization`}
            </span>
          </span>
        </LinkedListCard>
      ))}
      {!list.isPending && !list.isError && !list.items.length ? (
        <EmptyList
          icon={<ShieldCheck className="size-7" />}
        >{t`No organizations awaiting review`}</EmptyList>
      ) : null}
      {list.isError ? (
        <div role="alert">
          <p className="text-danger">
            {list.error instanceof CommunityApiError && list.error.status === 403
              ? t`Moderator access required`
              : t`Could not load organization reviews`}
          </p>
          <Button variant="outline" onPress={() => void list.refetch()}>{t`Try again`}</Button>
        </div>
      ) : null}
      <div ref={sentinel} />
      {list.isFetchingNextPage ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : list.hasNextPage ? (
        <Button variant="outline" onPress={() => void list.fetchNextPage()}>
          {list.isFetchNextPageError ? t`Could not load organization reviews. Retry` : t`Load more`}
        </Button>
      ) : null}
    </main>
  );
}
