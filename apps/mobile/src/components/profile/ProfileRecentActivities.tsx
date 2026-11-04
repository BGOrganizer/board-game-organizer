import type { ActivityAuthor } from "@board-game-organizer/schemas";
import { communityAccessDenied, useProfileActivities } from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { View } from "react-native";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileActivityRow } from "./ProfileActivityRow";

export function ProfileRecentActivities({
  userId,
  author,
}: {
  userId: string;
  author?: ActivityAuthor;
}) {
  const t = useT(),
    o = useCommunityApi(),
    router = useRouter(),
    q = useProfileActivities(o, userId);
  const items = communityAccessDenied(q.error) ? [] : q.data?.pages[0]?.items;
  return (
    <View style={{ gap: 12 }}>
      <Typography accessibilityRole="header" className="font-semibold text-foreground">
        {t("Recent activities")}
      </Typography>
      {q.isPending && !items ? (
        <Skeleton style={{ width: "100%", height: 180, borderRadius: 12 }} />
      ) : null}
      {q.isError ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {t("Could not load activities")}
          </Typography>
          <Button variant="secondary" onPress={() => void q.refetch()}>
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {items?.length ? (
        <GroupedList>
          {items.map((item) => (
            <ProfileActivityRow key={item.id} item={item} author={author} />
          ))}
        </GroupedList>
      ) : !q.isPending && !q.isError ? (
        <Typography className="text-muted">{t("No activities yet")}</Typography>
      ) : null}
      <Button
        variant="secondary"
        onPress={() => router.push({ pathname: "/user/[userId]/activities", params: { userId } })}
      >
        <Button.Label>{t("View all activities")}</Button.Label>
      </Button>
    </View>
  );
}
