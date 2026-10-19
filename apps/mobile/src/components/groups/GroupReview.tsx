import {
  communityAccessDenied,
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
    a = useGroupRecordActions(o),
    [reason, setReason] = useState(""),
    [error, setError] = useState(false),
    group = communityAccessDenied(q.error) ? undefined : q.data;
  const decide = async (decision: "approve" | "reject") => {
    if (!group) return;
    setError(false);
    try {
      await a.review.mutateAsync({
        id: group.id,
        input:
          decision === "approve"
            ? { decision, version: group.version }
            : { decision, version: group.version, reason: reason.trim() },
      });
      router.dismissTo("/moderation");
    } catch {
      setError(true);
    }
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
            editable={!a.busy}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button isDisabled={a.busy} onPress={() => void decide("approve")}>
              <Button.Label>{t("Approve")}</Button.Label>
            </Button>
            <Button
              variant="danger"
              isDisabled={a.busy || !reason.trim()}
              onPress={() => void decide("reject")}
            >
              <Button.Label>{t("Reject")}</Button.Label>
            </Button>
          </View>
        </>
      ) : (
        <Typography className="text-foreground">{t("Review completed")}</Typography>
      )}
      {error ? (
        <Typography accessibilityRole="alert" className="text-danger">
          {t("Could not update group review")}
        </Typography>
      ) : null}
    </ScreenScrollView>
  );
}
