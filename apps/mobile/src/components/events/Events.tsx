import type { EventListSection } from "@board-game-organizer/schemas";
import { Tabs } from "heroui-native/tabs";
import { useState } from "react";
import { View } from "react-native";
import { TabBar } from "@/components/common/ui/TabBar";
import { useT } from "@/lib/i18n";
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
  const [section, setSection] = useState<EventListSection>(initialSection);
  if (groupId) return <EventList groupId={groupId} canCreate={canCreate} />;
  return (
    <Tabs
      value={section}
      onValueChange={(value) => {
        if (value === "mine" || value === "available") setSection(value);
      }}
      style={{ flex: 1 }}
    >
      <View style={{ alignSelf: "center", marginTop: 16, maxWidth: "100%" }}>
        <TabBar>
          <Tabs.Trigger value="mine">
            <Tabs.Label numberOfLines={1}>{t("My events")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="available">
            <Tabs.Label numberOfLines={1}>{t("Available events")}</Tabs.Label>
          </Tabs.Trigger>
        </TabBar>
      </View>
      <View style={{ flex: 1 }}>
        <EventList key={section} section={section} canCreate={canCreate} />
      </View>
    </Tabs>
  );
}
