import { communityAccessDenied, useProfileView } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { useLingui } from "@lingui/react";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
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
import { ProfileLogout } from "./ProfileLogout";
import { ProfilePlayer } from "./ProfilePlayer";
import { ProfileRecentActivities } from "./ProfileRecentActivities";
import { ProfileStats } from "./ProfileStats";

const tabStyle = {
  flexDirection: "row",
  gap: 4,
  minHeight: 44,
  paddingHorizontal: 4,
} as const;

export function Profile({ userId }: { userId?: string }) {
  const t = useT(),
    { i18n } = useLingui(),
    o = useCommunityApi(),
    insets = useSafeAreaInsets();
  const subject = userId ?? o.userId ?? "",
    own = Boolean(o.userId && subject === o.userId),
    q = useProfileView(o, subject);
  const viewKey = JSON.stringify([o.apiUrl, o.userId, subject]);
  const storedTab = useAppStore((s) => s.profileViews[viewKey]?.tab ?? "activity"),
    setView = useAppStore((s) => s.setProfileView);
  const tab = !own && storedTab === "collection" ? "activity" : storedTab;
  const [accent, muted] = useThemeColor(["accent", "muted"]);
  const data = communityAccessDenied(q.error) ? undefined : q.data;
  const number = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 });
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 16 }}
    >
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
        <>
          <GroupedList>
            <UserListRow
              name={data.name || data.username || t("Unknown")}
              avatarUrl={data.avatarUrl}
              secondary={data.username ? `@${data.username}` : undefined}
            />
          </GroupedList>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              if (value === "activity" || value === "player" || (own && value === "collection"))
                setView(viewKey, { tab: value });
            }}
          >
            <MainTabBar>
              <TabTrigger value="activity" style={tabStyle}>
                <UsersRound
                  size={16}
                  color={tab === "activity" ? accent : muted}
                  accessible={false}
                />
                <Tabs.Label numberOfLines={1}>{t("Activities")}</Tabs.Label>
              </TabTrigger>
              <TabTrigger value="player" style={tabStyle}>
                <Gamepad2 size={16} color={tab === "player" ? accent : muted} accessible={false} />
                <Tabs.Label numberOfLines={1}>{t("Player")}</Tabs.Label>
              </TabTrigger>
              {own ? (
                <TabTrigger value="collection" style={tabStyle}>
                  <LibraryBig
                    size={16}
                    color={tab === "collection" ? accent : muted}
                    accessible={false}
                  />
                  <Tabs.Label numberOfLines={1}>{t("Collection")}</Tabs.Label>
                </TabTrigger>
              ) : null}
            </MainTabBar>
            <View style={{ gap: 16 }}>
              {tab === "activity" ? (
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
              ) : tab === "player" ? (
                <>
                  <ProfileStats
                    items={[
                      { label: t("Games played"), value: number.format(data.player.gamesPlayed) },
                      { label: t("Games won"), value: number.format(data.player.gamesWon) },
                      {
                        label: t("Win %"),
                        value:
                          data.player.winRate === null
                            ? "—"
                            : `${number.format(data.player.winRate)}%`,
                      },
                    ]}
                  />
                  <ProfilePlayer userId={subject} viewKey={viewKey} />
                </>
              ) : own ? (
                <ProfileBggCard />
              ) : null}
            </View>
          </Tabs>
        </>
      ) : null}
      {!data && !q.isPending && !q.isError ? (
        <Typography className="text-muted">{t("Profile unavailable")}</Typography>
      ) : null}
      {own ? <ProfileLogout /> : null}
    </ScrollView>
  );
}
