import type { EventListSection } from "@board-game-organizer/schemas";
import { Tabs } from "heroui-native/tabs";
import { CalendarCheck, CalendarSearch } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { MainTabBar } from "@/components/common/ui/MainTabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventList } from "./EventList";

export function Events({
  groupId,
  canCreate = true,
  initialSection = "mine",
  header,
}: {
  groupId?: string;
  canCreate?: boolean;
  initialSection?: EventListSection;
  header?: ReactNode;
}) {
  const t = useT();
  const options = useCommunityApi();
  const [section, setSection] = useState<EventListSection>(initialSection);
  if (groupId) return <EventList groupId={groupId} canCreate={canCreate} header={header} />;
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "event-list", id: "mine" },
        { kind: "event-list", id: "available" },
      ]}
    >
      <Tabs
        value={section}
        onValueChange={(value) => {
          if (value === "mine" || value === "available") setSection(value);
        }}
        style={{ flex: 1 }}
      >
        <MainTabBar>
          <TabTrigger icon={CalendarCheck} value="mine" style={{ flexDirection: "row", gap: 6 }}>
            <Tabs.Label numberOfLines={1}>{t("Participation")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "event-list", id: "mine" }} />
          </TabTrigger>
          <TabTrigger
            icon={CalendarSearch}
            value="available"
            style={{ flexDirection: "row", gap: 6 }}
          >
            <Tabs.Label numberOfLines={1}>{t("Available")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "event-list", id: "available" }} />
          </TabTrigger>
        </MainTabBar>
        <View style={{ flex: 1 }}>
          <EventList key={section} section={section} canCreate={canCreate} />
        </View>
      </Tabs>
    </NotificationAttentionScope>
  );
}
