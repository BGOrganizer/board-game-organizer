"use client";

import {
  useOrganization,
  useOrganizationActions,
  useRelationshipList,
} from "@board-game-organizer/shared";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { useRouter } from "next/navigation";

import { useCommunityApi } from "@/lib/useCommunityApi";

export function OrganizationFriendPicker({ organizationId }: { organizationId: string }) {
  const { t } = useLingui();
  const o = useCommunityApi();
  const detail = useOrganization(o, organizationId);
  const actions = useOrganizationActions(o);
  const router = useRouter();
  const friends = useRelationshipList(
    o.apiUrl,
    null,
    o.getToken,
    o.protectionBypass,
    o.userId,
    "friends",
    detail.data?.role === "admin",
  );
  if (detail.isError || detail.data?.role !== "admin")
    return detail.isPending ? (
      <Skeleton className="h-40 w-full rounded-xl" />
    ) : (
      <p role="alert">{t`Organization admin required`}</p>
    );
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-3 pb-28">
      <Button variant="ghost" onPress={() => router.back()}>{t`Back`}</Button>
      <h1>{t`Invite friends`}</h1>
      {friends.isPending ? <Skeleton className="h-32 w-full rounded-xl" /> : null}
      {friends.data?.map((row) =>
        row.profile ? (
          <Button
            key={row.profile.id}
            isDisabled={actions.busy}
            onPress={() =>
              void actions.invite
                .mutateAsync({ id: organizationId, userId: row.profile!.id })
                .then(() => router.replace(`/organizations/${organizationId}?tab=members`))
                .catch(() => {})
            }
          >
            {row.profile.username ?? t`Username unavailable`}
          </Button>
        ) : null,
      )}
      {friends.isError ? (
        <div role="alert">
          <Button onPress={() => void friends.refetch()}>{t`Could not load friends. Retry`}</Button>
        </div>
      ) : null}
      {friends.hasNextPage ? (
        <Button
          isDisabled={friends.isFetchingNextPage}
          onPress={() => void friends.fetchNextPage()}
        >{t`Load more`}</Button>
      ) : null}
      {!friends.isPending && !friends.isError && !friends.data?.length ? (
        <p>{t`No friends found`}</p>
      ) : null}
    </section>
  );
}
