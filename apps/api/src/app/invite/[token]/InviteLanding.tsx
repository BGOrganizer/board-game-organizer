"use client";

import {
  CommunityApiError,
  communityAccessDenied,
  useInviteClaim,
} from "@board-game-organizer/shared";
import { useAuth } from "@clerk/nextjs";
import { Button, Skeleton } from "@heroui/react";
import { useLingui } from "@lingui/react";
import { useCallback } from "react";
import ClaimInvite from "./claim";
import { InviteShell } from "./InviteShell";
import { inviteMessages as messages } from "./inviteMessages";
import { TableInviteClaim } from "./TableInviteClaim";

export function InviteLanding({ token }: { token: string }) {
  const { userId } = useAuth();
  return <LandingContent key={JSON.stringify([userId, token])} token={token} />;
}

function LandingContent({ token }: { token: string }) {
  const { i18n } = useLingui();
  const { userId, getToken, isLoaded, isSignedIn } = useAuth();
  const { review, claim } = useInviteClaim(
    {
      apiUrl: typeof window === "undefined" ? "" : window.location.origin,
      userId,
      getToken,
      enabled: Boolean(isLoaded && isSignedIn),
    },
    token,
  );
  const claimFriend = useCallback(() => claim.mutateAsync({}), [claim.mutateAsync]);
  if (!isLoaded || !isSignedIn) return <ClaimInvite token={token} onClaim={claimFriend} />;
  if (claim.isSuccess)
    return (
      <InviteShell title={i18n._(messages.successTitle)}>
        <p role="status" style={{ color: "var(--success)" }}>
          {i18n._(claim.data.table ? messages.tableSuccess : messages.friendSuccess)}
        </p>
        {claim.data.table ? (
          <p>
            {i18n._(claim.data.table.position === "WAITING" ? messages.waiting : messages.seated)}
          </p>
        ) : null}
      </InviteShell>
    );
  const unavailable =
    communityAccessDenied(review.error) ||
    (review.error instanceof CommunityApiError && [409, 410].includes(review.error.status));
  if (unavailable || (review.isError && !review.data))
    return (
      <InviteShell title={i18n._(messages.unavailable)}>
        <p role="alert" style={{ color: "var(--danger)" }}>
          {i18n._(unavailable ? messages.unavailable : messages.readFailure)}
        </p>
        <Button variant="secondary" onPress={() => void review.refetch()}>
          {i18n._(messages.retry)}
        </Button>
      </InviteShell>
    );
  if (!review.data)
    return (
      <InviteShell title={i18n._(messages.title)}>
        <div role="status" aria-label={i18n._(messages.loading)}>
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        </div>
      </InviteShell>
    );
  const warning = review.isError ? (
    <div role="alert" style={{ maxWidth: 640, padding: 24, margin: "0 auto" }}>
      <p style={{ color: "var(--danger)" }}>{i18n._(messages.readFailure)}</p>
      <Button variant="secondary" onPress={() => void review.refetch()}>
        {i18n._(messages.retry)}
      </Button>
    </div>
  ) : null;
  if (review.data.kind === "FRIEND")
    return (
      <>
        {warning}
        <ClaimInvite token={token} onClaim={claimFriend} />
      </>
    );
  return (
    <>
      {warning}
      <TableInviteClaim
        key={JSON.stringify([review.data.event.version, review.data.ownRegistration?.version])}
        review={review.data}
        busy={claim.isPending}
        disabled={review.isError || review.isFetching || review.isPlaceholderData}
        failed={claim.isError}
        onClaim={claim.mutateAsync}
        onRefresh={() => void review.refetch()}
      />
    </>
  );
}
