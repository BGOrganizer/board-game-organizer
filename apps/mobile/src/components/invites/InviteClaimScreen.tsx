import { getMobileNumber } from "@board-game-organizer/schemas";
import {
  CommunityApiError,
  communityAccessDenied,
  useInviteClaim,
} from "@board-game-organizer/shared";
import { useAuth, useUser } from "@clerk/expo";
import { Redirect } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useRef } from "react";
import { View } from "react-native";
import { useT } from "@/lib/i18n";
import { inviteTokenParam } from "@/lib/inviteLinks";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { TableInviteReview } from "./TableInviteReview";

export function InviteClaimScreen({ token: rawToken }: { token?: string | string[] }) {
  const t = useT();
  const token = inviteTokenParam(rawToken);
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { isLoaded: userLoaded, user } = useUser();
  const o = useCommunityApi();
  if (!token)
    return (
      <Typography accessibilityRole="alert" className="text-danger">
        {t("Invitation unavailable")}
      </Typography>
    );
  if (!isLoaded || (isSignedIn && !userLoaded)) return <Loading />;
  if (!isSignedIn)
    return <Redirect href={{ pathname: "/sign-in", params: { inviteToken: token } }} />;
  if (!getMobileNumber(user?.unsafeMetadata))
    return <Redirect href={{ pathname: "/mobile-number", params: { inviteToken: token } }} />;
  return <ClaimContent key={JSON.stringify([o.apiUrl, o.userId, token])} token={token} />;
}
function Loading() {
  return (
    <View style={{ padding: 20 }}>
      <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
    </View>
  );
}
function ClaimContent({ token }: { token: string }) {
  const t = useT();
  const o = useCommunityApi();
  const { review, claim } = useInviteClaim(o, token);
  const friendInFlight = useRef(false);
  if (claim.isSuccess)
    return (
      <Redirect
        href={
          claim.data.table
            ? {
                pathname: "/event/table",
                params: { eventId: claim.data.table.eventId, tableId: claim.data.table.tableId },
              }
            : "/contacts"
        }
      />
    );
  const unavailable =
    communityAccessDenied(review.error) ||
    (review.error instanceof CommunityApiError && [409, 410].includes(review.error.status));
  if (unavailable || (review.isError && !review.data))
    return (
      <View style={{ padding: 20, gap: 12 }}>
        <Typography accessibilityRole="alert" className="text-danger">
          {t(unavailable ? "Invitation unavailable" : "Could not load this invitation.")}
        </Typography>
        <Button variant="secondary" onPress={() => void review.refetch()}>
          <Button.Label>{t("Try again")}</Button.Label>
        </Button>
      </View>
    );
  if (!review.data) return <Loading />;
  const disabled =
    claim.isPending || review.isError || review.isFetching || review.isPlaceholderData;
  if (review.data.kind === "TABLE")
    return (
      <TableInviteReview
        key={JSON.stringify([review.data.event.version, review.data.ownRegistration?.version])}
        review={review.data}
        disabled={disabled}
        pending={claim.isPending}
        failed={claim.isError}
        readFailed={review.isError}
        onClaim={claim.mutateAsync}
        onRefresh={() => void review.refetch()}
      />
    );
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Typography>{t("Claiming this invite connects you with the inviter.")}</Typography>
      {review.isError || claim.isError ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {t("Could not claim this invite. Try again.")}
        </Typography>
      ) : null}
      {review.isError ? (
        <Button variant="secondary" onPress={() => void review.refetch()}>
          <Button.Label>{t("Try again")}</Button.Label>
        </Button>
      ) : null}
      <Button
        isDisabled={disabled}
        onPress={() => {
          if (disabled || friendInFlight.current) return;
          friendInFlight.current = true;
          void claim
            .mutateAsync({})
            .catch(() => {})
            .finally(() => {
              friendInFlight.current = false;
            });
        }}
      >
        <Button.Label>{t("Claim invite")}</Button.Label>
      </Button>
    </View>
  );
}
