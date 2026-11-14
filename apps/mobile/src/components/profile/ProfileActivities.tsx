import { profileActivityKindSchema } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useProfileActivities,
  useProfileView,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityTypeSelect } from "@/components/activities/ActivityTypeSelect";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileActivityRow } from "./ProfileActivityRow";

export function ProfileActivities({ userId }: { userId: string }) {
  const t = useT(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets(),
    key = JSON.stringify([o.apiUrl, o.userId, userId]);
  const filter = useAppStore((s) => s.profileViews[key]?.activityKind ?? ""),
    setView = useAppStore((s) => s.setProfileView);
  const parsed = profileActivityKindSchema.safeParse(filter),
    kind = parsed.success ? parsed.data : undefined;
  const subject = useProfileView(o, userId);
  const q = useProfileActivities(o, userId, kind, 10),
    denied = communityAccessDenied(q.error) || q.data === null;
  const rows = denied ? [] : (q.data?.pages.flatMap((p) => p.items) ?? []);
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
      data={rows}
      keyExtractor={(row) => row.id}
      renderItem={({ item, index }) => (
        <GroupedList segment={{ index, count: rows.length }}>
          <ProfileActivityRow
            item={item}
            viewerId={o.userId}
            author={communityAccessDenied(subject.error) ? undefined : (subject.data ?? undefined)}
          />
        </GroupedList>
      )}
      onEndReached={() => {
        if (!denied && q.hasNextPage && !q.isFetchingNextPage && !q.isFetchNextPageError)
          void q.fetchNextPage();
      }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <ActivityTypeSelect
            value={kind}
            onChange={(activityKind) => setView(key, { activityKind: activityKind ?? "" })}
          />
          {q.isError || denied ? (
            <View style={{ gap: 8 }}>
              <Typography accessibilityRole="alert" className="text-danger">
                {denied ? t("Profile unavailable") : t("Could not load activities")}
              </Typography>
              <Button variant="secondary" onPress={() => void q.refetch()}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        q.isPending ? (
          <Skeleton style={{ width: "100%", height: 180, borderRadius: 12 }} />
        ) : !q.isError && !denied ? (
          <Typography className="text-muted">{t("No activities yet")}</Typography>
        ) : null
      }
      ListFooterComponent={
        q.isFetchingNextPage ? (
          <Skeleton style={{ width: "100%", height: 72, borderRadius: 12 }} />
        ) : q.isFetchNextPageError ? (
          <Button variant="secondary" onPress={() => void q.fetchNextPage()}>
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        ) : null
      }
    />
  );
}
