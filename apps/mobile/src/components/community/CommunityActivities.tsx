import { communityNetworkSchema } from "@board-game-organizer/schemas";
import {
  activitySections,
  communityAccessDenied,
  useCommunityActivities,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useLingui } from "@lingui/react";
import { useFocusEffect } from "expo-router";
import { Button } from "heroui-native/button";
import { Select } from "heroui-native/select";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { useCallback, useRef } from "react";
import { SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityRow } from "@/components/activities/ActivityRow";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function CommunityActivities() {
  const t = useT(),
    { i18n } = useLingui(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets(),
    key = JSON.stringify([o.apiUrl, o.userId]);
  const network = useAppStore((s) => s.communityViews[key]?.network ?? "all"),
    setView = useAppStore((s) => s.setCommunityView);
  const q = useCommunityActivities(o, network),
    denied = communityAccessDenied(q.error);
  const sections = activitySections(
    denied ? [] : (q.data?.pages.flatMap((p) => p.items) ?? []),
    i18n.locale,
    t("Today"),
    t("Yesterday"),
  );
  const labels = {
    all: t("All activities"),
    friends: t("Friends"),
    following: t("Followed users"),
  };
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
          <ActivityRow item={item} author={item.author} />
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
          <Select
            value={{ value: network, label: labels[network] }}
            onValueChange={(value) => {
              const parsed = communityNetworkSchema.safeParse(value?.value);
              if (parsed.success) setView(key, { network: parsed.data });
            }}
          >
            <Select.Trigger accessibilityLabel={t("Network")}>
              <Typography className="text-foreground" style={{ flex: 1 }}>
                {labels[network]}
              </Typography>
              <Select.TriggerIndicator />
            </Select.Trigger>
            <Select.Portal>
              <Select.Overlay />
              <Select.Content presentation="popover" width="trigger">
                {communityNetworkSchema.options.map((value) => (
                  <Select.Item key={value} value={value} label={labels[value]}>
                    <Typography className="text-foreground">{labels[value]}</Typography>
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Portal>
          </Select>
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
