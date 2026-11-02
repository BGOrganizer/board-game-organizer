import type { TableListSection } from "@board-game-organizer/schemas";
import { Tabs } from "heroui-native/tabs";
import { useState } from "react";
import { View } from "react-native";
import { TabBar } from "@/components/common/ui/TabBar";
import { useT } from "@/lib/i18n";
import { TableList } from "./TableList";

export function Tables() {
  const t = useT();
  const [section, setSection] = useState<TableListSection>("mine");
  return (
    <Tabs
      value={section}
      onValueChange={(value) => {
        if (value === "mine" || value === "waiting") setSection(value);
      }}
      style={{ flex: 1 }}
    >
      <View style={{ alignSelf: "center", marginTop: 16, maxWidth: "100%" }}>
        <TabBar>
          <Tabs.Trigger value="mine">
            <Tabs.Label numberOfLines={1}>{t("My tables")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="waiting">
            <Tabs.Label numberOfLines={1}>{t("Pending tables")}</Tabs.Label>
          </Tabs.Trigger>
        </TabBar>
      </View>
      <View style={{ flex: 1 }}>
        <TableList key={section} section={section} />
      </View>
    </Tabs>
  );
}
