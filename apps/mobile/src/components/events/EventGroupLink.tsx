import { communityAccessDenied, useGroupRecord } from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function EventGroupLink({ groupId, name }: { groupId: string; name?: string | null }) {
  const t = useT(),
    router = useRouter();
  const group = useGroupRecord(useCommunityApi(), groupId);
  const record =
    !communityAccessDenied(group.error) &&
    group.data?.id === groupId &&
    typeof group.data.name === "string"
      ? group.data
      : undefined;
  const label = record?.name ?? name;
  return (
    <View style={{ gap: 8 }}>
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {t("Group")}
      </Typography>
      <LinkedListCard
        label={`${t("Open group")}: ${label ?? t("Group")}`}
        onPress={() => router.push({ pathname: "/group/[groupId]", params: { groupId } })}
      >
        {record && record.logo !== undefined ? (
          <GroupArtwork group={record} />
        ) : (
          <Skeleton style={{ width: 64, height: 64, borderRadius: 12 }} />
        )}
        {label ? (
          <Typography
            className="font-medium text-foreground"
            style={{ flex: 1, alignSelf: "center" }}
          >
            {label}
          </Typography>
        ) : (
          <Skeleton style={{ width: 128, height: 16, borderRadius: 4 }} />
        )}
      </LinkedListCard>
      {group.isError ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load group")}
          </Typography>
          <Button variant="outline" onPress={() => void group.refetch()}>
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
