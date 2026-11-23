import { useAppStore } from "@board-game-organizer/store";
import { Tabs } from "heroui-native/tabs";
import { Activity, Medal, Store } from "lucide-react-native";
import { View } from "react-native";
import { MainTabBar } from "@/components/common/ui/MainTabBar";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { Leaderboard } from "@/components/ratings/Leaderboard";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { CommunityActivities } from "./CommunityActivities";
import { CommunityMarketplace } from "./CommunityMarketplace";

const tabStyle = { flexDirection: "row", gap: 4, minHeight: 44, paddingHorizontal: 4 } as const;
export function Community() {
  const t = useT(),
    o = useCommunityApi(),
    key = JSON.stringify([o.apiUrl, o.userId]);
  const tab = useAppStore((s) => s.communityViews[key]?.tab ?? "activity"),
    setView = useAppStore((s) => s.setCommunityView);
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        value={tab}
        style={{ flex: 1 }}
        onValueChange={(value) => {
          if (value === "activity" || value === "market" || value === "ranking")
            setView(key, { tab: value });
        }}
      >
        <MainTabBar>
          <TabTrigger icon={Activity} value="activity" style={tabStyle}>
            <Tabs.Label numberOfLines={1}>{t("Activities")}</Tabs.Label>
          </TabTrigger>
          <TabTrigger icon={Medal} value="ranking" style={tabStyle} testID="community-tab-ranking">
            <Tabs.Label numberOfLines={1}>{t("Rankings")}</Tabs.Label>
          </TabTrigger>
          <TabTrigger icon={Store} value="market" style={tabStyle}>
            <Tabs.Label numberOfLines={1}>{t("Marketplace")}</Tabs.Label>
          </TabTrigger>
        </MainTabBar>
        <RetainedTabPanel
          key={JSON.stringify([o.apiUrl, o.userId, "activity"])}
          active={tab === "activity"}
        >
          <CommunityActivities />
        </RetainedTabPanel>
        <RetainedTabPanel key={JSON.stringify([key, "ranking"])} active={tab === "ranking"}>
          <Leaderboard />
        </RetainedTabPanel>
        <RetainedTabPanel
          key={JSON.stringify([o.apiUrl, o.userId, "market"])}
          active={tab === "market"}
        >
          <CommunityMarketplace />
        </RetainedTabPanel>
      </Tabs>
    </View>
  );
}
