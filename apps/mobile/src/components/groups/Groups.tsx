import { Tabs } from "heroui-native/tabs";
import { useState } from "react";
import { View } from "react-native";
import { MainTabBar } from "@/components/common/ui/MainTabBar";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupList } from "./GroupList";

export function Groups({
  initialSection = "private",
}: {
  initialSection?: "private" | "public" | "search";
}) {
  const t = useT();
  const options = useCommunityApi();
  const [section, setSection] = useState<string>(initialSection);
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "group-list", id: "PRIVATE" },
        { kind: "group-list", id: "PUBLIC" },
        { kind: "group-list", id: "search" },
      ]}
    >
      <Tabs value={section} onValueChange={setSection} style={{ flex: 1 }}>
        <MainTabBar>
          <Tabs.Trigger value="private" style={{ flexDirection: "row", gap: 6 }}>
            <Tabs.Label>{t("Private groups")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "group-list", id: "PRIVATE" }} />
          </Tabs.Trigger>
          <Tabs.Trigger value="public" style={{ flexDirection: "row", gap: 6 }}>
            <Tabs.Label>{t("Public groups")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "group-list", id: "PUBLIC" }} />
          </Tabs.Trigger>
          <Tabs.Trigger value="search" style={{ flexDirection: "row", gap: 6 }}>
            <Tabs.Label>{t("Search")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "group-list", id: "search" }} />
          </Tabs.Trigger>
        </MainTabBar>
        <View style={{ flex: 1 }}>
          <GroupList
            key={section}
            scope={section === "search" ? "public" : "mine"}
            type={section === "private" ? "PRIVATE" : section === "public" ? "PUBLIC" : undefined}
          />
        </View>
      </Tabs>
    </NotificationAttentionScope>
  );
}
