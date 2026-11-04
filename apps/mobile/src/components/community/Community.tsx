import { useAppStore } from "@board-game-organizer/store";
import { useThemeColor } from "heroui-native/hooks";
import { Tabs } from "heroui-native/tabs";
import { Activity, Store } from "lucide-react-native";
import { View } from "react-native";
import { MainTabBar } from "@/components/common/ui/MainTabBar";
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
  const [accent, muted] = useThemeColor(["accent", "muted"]);
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        value={tab}
        style={{ flex: 1 }}
        onValueChange={(value) => {
          if (value === "activity" || value === "market") setView(key, { tab: value });
        }}
      >
        <MainTabBar>
          <Tabs.Trigger value="activity" style={tabStyle}>
            <Activity size={16} color={tab === "activity" ? accent : muted} accessible={false} />
            <Tabs.Label className="text-xs sm:text-sm">{t("Activities")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="market" style={tabStyle}>
            <Store size={16} color={tab === "market" ? accent : muted} accessible={false} />
            <Tabs.Label className="text-xs sm:text-sm">{t("Marketplace")}</Tabs.Label>
          </Tabs.Trigger>
        </MainTabBar>
        {tab === "activity" ? <CommunityActivities /> : <CommunityMarketplace />}
      </Tabs>
    </View>
  );
}
