"use client";
import {
  CommunityApiError,
  communityAccessDenied,
  formatLocationAddress,
  useOrganizationActions,
  useOrganizationList,
  useOrganizationReview,
} from "@board-game-organizer/shared";
import { Button, Input, Label, Skeleton, TextField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, Check, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyList } from "@/components/EmptyList";
import { LinkedListCard } from "@/components/LinkedListCard";
import { OrganizationArtwork } from "@/components/Organizations";
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
export function OrganizationReview({ organizationId }: { organizationId: string }) {
  const { t } = useLingui();
  const options = useCommunityApi();
  const router = useRouter();
  const detail = useOrganizationReview(options, organizationId);
  const actions = useOrganizationActions(options);
  const [reason, setReason] = useState("");
  const organization = detail.data;
  function review(decision: "approve" | "reject") {
    if (!organization) return;
    actions.review.mutate(
      {
        id: organizationId,
        input:
          decision === "approve"
            ? { decision, version: organization.version }
            : { decision, version: organization.version, reason: reason.trim() },
      },
      { onSuccess: () => router.replace("/moderation") },
    );
  }
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 pb-28">
      <div className="flex items-center gap-2">
        <Button
          isIconOnly
          variant="ghost"
          aria-label={t`Back`}
          onPress={() => router.push("/moderation")}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t`Review organization`}</h1>
      </div>
      {!organization && detail.isPending ? <Skeleton className="h-48 w-full rounded-xl" /> : null}
      {detail.isError ? (
        <div role="alert">
          <p className="text-danger">
            {detail.error instanceof CommunityApiError && detail.error.status === 403
              ? t`Moderator access required`
              : t`Could not load organization review`}
          </p>
          <Button variant="outline" onPress={() => void detail.refetch()}>{t`Try again`}</Button>
        </div>
      ) : organization ? (
        <>
          <div className="flex gap-4">
            <OrganizationArtwork organization={organization} />
            <div>
              <h2 className="font-semibold">{organization.name}</h2>
              <p>{organization.location.name}</p>
              <p className="text-sm text-default-500">
                {formatLocationAddress(organization.location.address)}
              </p>
            </div>
          </div>
          {organization.approved ? (
            <section className="rounded-xl border border-separator p-3">
              <h2 className="font-semibold">{t`Currently approved information`}</h2>
              <p>{organization.approved.name}</p>
              <p className="text-sm text-default-500">
                {formatLocationAddress(organization.approved.location.address)}
              </p>
            </section>
          ) : null}
          {organization.reviewStatus === "PENDING" ? (
            <>
              <TextField value={reason} onChange={setReason}>
                <Label>{t`Rejection reason`}</Label>
                <Input name="rejection-reason" autoComplete="off" maxLength={1000} />
              </TextField>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  isDisabled={actions.busy}
                  onPress={() => review("approve")}
                >
                  <Check className="size-4" />
                  {t`Approve organization`}
                </Button>
                <Button
                  variant="danger"
                  isDisabled={actions.busy || !reason.trim()}
                  onPress={() => review("reject")}
                >
                  <X className="size-4" />
                  {t`Reject organization`}
                </Button>
              </div>
            </>
          ) : (
            <p role="status">{t`This proposal has already been reviewed.`}</p>
          )}
        </>
      ) : null}
    </main>
  );
}
