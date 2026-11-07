import { communityAccessDenied, useBggAccount, useProfileView } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { Gamepad2, LibraryBig, UsersRound } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { MainTabBar } from "@/components/common/ui/MainTabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { ProfileBggCard } from "./ProfileBggCard";
import { ProfileCollection } from "./ProfileCollection";
import { ProfileLogout } from "./ProfileLogout";
import { ProfilePlayer } from "./ProfilePlayer";
import { ProfileRecentActivities } from "./ProfileRecentActivities";
import { ProfileStats } from "./ProfileStats";

const tabStyle = { flexDirection: "row", gap: 4, minHeight: 44, paddingHorizontal: 4 } as const;
export function Profile({ userId }: { userId?: string }) {
  const t = useT(),
    { i18n } = useLingui(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets();
  const subject = userId ?? o.userId ?? "",
    own = Boolean(o.userId && subject === o.userId),
    q = useProfileView(o, subject);
  const bgg = useBggAccount({
    ...o,
    enabled: own || (!communityAccessDenied(q.error) && Boolean(q.data?.collection)),
  });
  const active = communityAccessDenied(q.error)
    ? null
    : own
      ? !communityAccessDenied(bgg.account.error)
        ? bgg.account.data?.active
        : null
      : q.data?.collection;
  const viewKey = JSON.stringify([o.apiUrl, o.userId, subject]);
  const storedTab = useAppStore((s) => s.profileViews[viewKey]?.tab ?? "activity"),
    setView = useAppStore((s) => s.setProfileView);
  const tab = storedTab === "collection" && !active ? "activity" : storedTab;
  const data = communityAccessDenied(q.error) ? undefined : q.data;
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 });
  const header = (
    <View style={{ gap: 16 }}>
      {q.isPending && !data ? (
        <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
      ) : null}
      {q.isError ? (
        <View style={{ gap: 8 }}>
          <Typography accessibilityRole="alert" className="text-danger">
            {communityAccessDenied(q.error)
              ? t("Profile unavailable")
              : t("Could not load profile")}
          </Typography>
          <Button variant="secondary" onPress={() => void q.refetch()}>
            <Button.Label>{t("Try again")}</Button.Label>
          </Button>
        </View>
      ) : null}
      {data ? (
        <GroupedList>
          <UserListRow
            name={data.name || data.username || t("Unknown")}
            avatarUrl={data.avatarUrl}
            secondary={data.username ? `@${data.username}` : undefined}
          />
        </GroupedList>
      ) : null}
      {own ? <ProfileBggCard bgg={bgg} /> : null}
      {data ? (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (value === "activity" || value === "player" || (active && value === "collection"))
              setView(viewKey, { tab: value });
          }}
        >
          <MainTabBar>
            <TabTrigger icon={UsersRound} value="activity" style={tabStyle}>
              <Tabs.Label numberOfLines={1}>{t("Activities")}</Tabs.Label>
            </TabTrigger>
            <TabTrigger icon={Gamepad2} value="player" style={tabStyle}>
              <Tabs.Label numberOfLines={1}>{t("Player")}</Tabs.Label>
            </TabTrigger>
            {active ? (
              <TabTrigger icon={LibraryBig} value="collection" style={tabStyle}>
                <Tabs.Label numberOfLines={1}>{t("Collection")}</Tabs.Label>
              </TabTrigger>
            ) : null}
          </MainTabBar>
        </Tabs>
      ) : null}
      {!data && !q.isPending && !q.isError ? (
        <Typography className="text-muted">{t("Profile unavailable")}</Typography>
      ) : null}
    </View>
  );
  if (data && tab === "collection" && active)
    return (
      <ProfileCollection
        key={`${viewKey}:${active.snapshot}`}
        snapshot={active.snapshot}
        counts={active.counts}
        subjectId={subject}
        viewerSnapshot={
          communityAccessDenied(bgg.account.error) ? undefined : bgg.account.data?.active?.snapshot
        }
        header={header}
      />
    );
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 16 }}
    >
      {header}
      {data && tab === "activity" ? (
        <>
          <ProfileStats
            items={[
              { label: t("Friends"), value: number.format(data.social.friends) },
              { label: t("Followers"), value: number.format(data.social.followers) },
              { label: t("Following"), value: number.format(data.social.following) },
            ]}
          />
          <ProfileRecentActivities userId={subject} author={data} />
        </>
      ) : data && tab === "player" ? (
        <>
          <ProfileStats
            items={[
              { label: t("Games played"), value: number.format(data.player.gamesPlayed) },
              { label: t("Games won"), value: number.format(data.player.gamesWon) },
              {
                label: t("Win %"),
                value:
                  data.player.winRate === null ? "—" : `${number.format(data.player.winRate)}%`,
              },
            ]}
          />
          <ProfilePlayer userId={subject} viewKey={viewKey} />
        </>
      ) : null}
      {own ? <ProfileLogout /> : null}
    </ScrollView>
  );
}
