import { Tabs } from "heroui-native/tabs";
import { useState } from "react";
import { View } from "react-native";
import { TabBar } from "@/components/common/ui/TabBar";
import { useT } from "@/lib/i18n";
import { GroupList } from "./GroupList";

export function Groups({
  initialSection = "private",
}: {
  initialSection?: "private" | "public" | "search";
}) {
  const t = useT();
  const [section, setSection] = useState<string>(initialSection);
  return (
    <Tabs value={section} onValueChange={setSection} style={{ flex: 1 }}>
      <View style={{ alignSelf: "center", marginTop: 16, maxWidth: "100%" }}>
        <TabBar>
          <Tabs.Trigger value="private">
            <Tabs.Label>{t("Private groups")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="public">
            <Tabs.Label>{t("Public groups")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="search">
            <Tabs.Label>{t("Search")}</Tabs.Label>
          </Tabs.Trigger>
        </TabBar>
      </View>
      <View style={{ flex: 1 }}>
        <GroupList
          key={section}
          scope={section === "search" ? "public" : "mine"}
          type={section === "private" ? "PRIVATE" : section === "public" ? "PUBLIC" : undefined}
        />
      </View>
    </Tabs>
  );
}
