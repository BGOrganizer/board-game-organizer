import { type ProfileActivityKind, profileActivityKindSchema } from "@board-game-organizer/schemas";
import { communityAccessDenied, useProfileActivities } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { Button } from "heroui-native/button";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const q = useProfileActivities(o, userId, kind, 10),
    denied = communityAccessDenied(q.error) || q.data === null;
  const rows = denied ? [] : (q.data?.pages.flatMap((p) => p.items) ?? []);
  const labels: Record<ProfileActivityKind, string> = {
    played: t("Game played"),
    friendship: t("New friendship"),
    event_join: t("Joined an event"),
    table_join: t("Joined a table"),
    group_join: t("Joined a group"),
    follower: t("New follower"),
    milestone: t("Victory milestone"),
  };
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 8 }}
      data={rows}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => (
        <GroupedList>
          <ProfileActivityRow item={item} />
        </GroupedList>
      )}
      onEndReached={() => {
        if (!denied && q.hasNextPage && !q.isFetchingNextPage && !q.isFetchNextPageError)
          void q.fetchNextPage();
      }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Select
            value={{ value: kind ?? "all", label: kind ? labels[kind] : t("All activity types") }}
            onValueChange={(value) =>
              setView(key, { activityKind: value?.value === "all" ? "" : (value?.value ?? "") })
            }
          >
            <Select.Trigger accessibilityLabel={t("Activity type")}>
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {kind ? labels[kind] : t("All activity types")}
              </Typography>
              <Select.TriggerIndicator />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="popover" width="trigger">
                <Select.Item value="all" label={t("All activity types")}>
                  <Typography className="text-foreground">{t("All activity types")}</Typography>
                  <Select.ItemIndicator />
                </Select.Item>
                {profileActivityKindSchema.options.map((value) => (
                  <Select.Item key={value} value={value} label={labels[value]}>
                    <Typography className="text-foreground">{labels[value]}</Typography>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Portal>
          </Select>
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
