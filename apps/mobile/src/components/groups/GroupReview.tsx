import {
  communityAccessDenied,
  groupRecordKeys,
  useClientMutationDraft,
  useGroupRecord,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useState } from "react";
import { View } from "react-native";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupDetailsCard } from "./GroupDetailsCard";
export function GroupReview({ groupId }: { groupId: string }) {
  const t = useT(),
    router = useRouter(),
    o = useCommunityApi(),
    q = useGroupRecord(o, groupId, true),
    a = useGroupRecordActions(o, groupId),
    draft = useClientMutationDraft<Parameters<typeof a.review.mutate>[0]>(
      groupRecordKeys.mutation(o, groupId, "review"),
      communityAccessDenied(q.error) ? undefined : q.data?.version,
    ),
    [reason, setReason] = useState(
      draft?.variables?.input.decision === "reject" ? draft.variables.input.reason : "",
    ),
    group = communityAccessDenied(q.error) ? undefined : q.data;
  const busy = a.busy || draft?.phase === "saving" || draft?.phase === "verifying";
  const decide = (decision: "approve" | "reject") => {
    if (
      !group ||
      busy ||
      group.reviewStatus !== "PENDING" ||
      (decision === "reject" && !reason.trim())
    )
      return;
    a.review.mutate({
      id: group.id,
      input:
        decision === "approve"
          ? { decision, version: group.version }
          : { decision, version: group.version, reason: reason.trim() },
    });
    router.dismissTo("/moderation");
  };
  if (!group)
    return (
      <View style={{ padding: 20 }}>
        {q.isPending ? (
          <Skeleton style={{ width: "100%", height: 160, borderRadius: 12 }} />
        ) : (
          <>
            <Typography accessibilityRole="alert" className="text-danger">
              {t("Could not load group review")}
            </Typography>
            <Button onPress={() => void q.refetch()}>
              <Button.Label>{t("Try again")}</Button.Label>
            </Button>
          </>
        )}
      </View>
    );
  return (
    <ScreenScrollView>
      <GroupDetailsCard group={group} />
      {group.reviewStatus === "PENDING" ? (
        <>
          <Typography className="text-foreground">{t("Rejection reason")}</Typography>
          <Input
            accessibilityLabel={t("Rejection reason")}
            value={reason}
            onChangeText={setReason}
            maxLength={1000}
            editable
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button isDisabled={busy} onPress={() => void decide("approve")}>
              <Button.Label>{t("Approve")}</Button.Label>
            </Button>
            <Button
              variant="danger"
              isDisabled={busy || !reason.trim()}
              onPress={() => void decide("reject")}
            >
              <Button.Label>{t("Reject")}</Button.Label>
            </Button>
          </View>
        </>
      ) : (
        <Typography className="text-foreground">{t("Review completed")}</Typography>
      )}
      {draft?.phase === "verifying" ? (
        <Typography accessibilityLiveRegion="polite" className="text-foreground">
          {t("Checking saved changes")}
        </Typography>
      ) : null}
    </ScreenScrollView>
  );
}
