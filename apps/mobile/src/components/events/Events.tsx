import type { EventListSection } from "@board-game-organizer/schemas";
import { Tabs } from "heroui-native/tabs";
import { useState } from "react";
import { View } from "react-native";
import { TabBar } from "@/components/common/ui/TabBar";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { EventList } from "./EventList";

export function Events({
  groupId,
  canCreate = true,
  initialSection = "mine",
}: {
  groupId?: string;
  canCreate?: boolean;
  initialSection?: EventListSection;
}) {
  const t = useT();
  const options = useCommunityApi();
  const [section, setSection] = useState<EventListSection>(initialSection);
  if (groupId) return <EventList groupId={groupId} canCreate={canCreate} />;
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
        <View style={{ alignSelf: "center", marginTop: 8, maxWidth: "100%" }}>
          <TabBar>
            <Tabs.Trigger value="mine" style={{ flexDirection: "row", gap: 6 }}>
              <Tabs.Label numberOfLines={1}>{t("Registered events")}</Tabs.Label>
              <NotificationTabBadge target={{ kind: "event-list", id: "mine" }} />
            </Tabs.Trigger>
            <Tabs.Trigger value="available" style={{ flexDirection: "row", gap: 6 }}>
              <Tabs.Label numberOfLines={1}>{t("Available events")}</Tabs.Label>
              <NotificationTabBadge target={{ kind: "event-list", id: "available" }} />
            </Tabs.Trigger>
          </TabBar>
        </View>
        <View style={{ flex: 1 }}>
          <EventList key={section} section={section} canCreate={canCreate} />
        </View>
      </Tabs>
    </NotificationAttentionScope>
  );
}
