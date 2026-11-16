import { profileActivityKindSchema } from "@board-game-organizer/schemas";
import {
  activitySections,
  communityAccessDenied,
  useCommunityActivities,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useLingui } from "@lingui/react";
import { useFocusEffect } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Activity } from "lucide-react-native";
import { useCallback, useMemo, useRef } from "react";
import { SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityRow } from "@/components/activities/ActivityRow";
import { ActivityTypeSelect } from "@/components/activities/ActivityTypeSelect";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function CommunityActivities() {
  const muted = useThemeColor("muted");
  const t = useT(),
    { i18n } = useLingui(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets(),
    key = JSON.stringify([o.apiUrl, o.userId]);
  const filter = useAppStore((s) => s.communityViews[key]?.activityKind ?? ""),
    setView = useAppStore((s) => s.setCommunityView);
  const parsed = profileActivityKindSchema.safeParse(filter);
  const kind = parsed.success ? parsed.data : undefined;
  const q = useCommunityActivities(o, "all", kind),
    denied = communityAccessDenied(q.error);
  const today = t("Today"),
    yesterday = t("Yesterday");
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const day = midnight.getTime();
  const sections = useMemo(
    () => activitySections(denied ? [] : q.items, i18n.locale, today, yesterday, new Date(day)),
    [denied, q.items, i18n.locale, today, yesterday, day],
  );
  const refetch = q.refetch,
    refresh = useRef({ stale: q.isStale, fetching: q.isFetching });
  refresh.current = { stale: q.isStale, fetching: q.isFetching };
  useFocusEffect(
    useCallback(() => {
      if (refresh.current.stale && !refresh.current.fetching) void refetch();
    }, [refetch]),
  );
  return (
    <SectionList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      renderItem={({ item, index, section }) => (
        <GroupedList segment={{ index, count: section.data.length }}>
          <ActivityRow item={item} author={item.author} viewerId={o.userId} />
        </GroupedList>
      )}
      renderSectionHeader={({ section }) => (
        <Typography
          accessibilityRole="header"
          className="text-sm font-semibold text-muted"
          style={{ marginTop: 12, marginBottom: 8 }}
        >
          {section.title}
        </Typography>
      )}
      onEndReached={() => {
        if (!denied && q.hasNextPage && !q.isFetchingNextPage && !q.isFetchNextPageError)
          void q.fetchNextPage();
      }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 12 }}>
          <Typography accessibilityRole="header" className="font-semibold text-foreground">
            {t("Your network's activities")}
          </Typography>
          <Typography className="text-sm text-muted">
            {t("Updates from friends and people you follow, since your connection began.")}
          </Typography>
          <ActivityTypeSelect
            value={kind}
            onChange={(activityKind) => setView(key, { activityKind: activityKind ?? "" })}
          />
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
        </View>
      }
      ListEmptyComponent={
        q.isPending && !q.data ? (
          <Skeleton style={{ width: "100%", height: 180, borderRadius: 12 }} />
        ) : !q.isError ? (
          <EmptyList icon={<Activity size={28} color={muted} />}>
            {t("No activities yet")}
          </EmptyList>
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
