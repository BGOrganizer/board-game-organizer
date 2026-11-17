import { Tabs } from "heroui-native/tabs";
import { Globe, LockKeyhole, Search } from "lucide-react-native";
import { memo, useState } from "react";
import { MainTabBar } from "@/components/common/ui/MainTabBar";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { NotificationTabBadge } from "@/components/notifications/NotificationTabBadge";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupList } from "./GroupList";

const MemoizedGroupList = memo(GroupList);

export function Groups({
  initialSection = "private",
}: {
  initialSection?: "private" | "public" | "search";
}) {
  const t = useT();
  const options = useCommunityApi();
  const [selectedSection, setSection] = useState<string>(initialSection);
  return (
    <NotificationAttentionScope
      options={options}
      targets={[
        { kind: "group-list", id: "PRIVATE" },
        { kind: "group-list", id: "PUBLIC" },
        { kind: "group-list", id: "search" },
      ]}
    >
      <Tabs value={selectedSection} onValueChange={setSection} style={{ flex: 1 }}>
        <MainTabBar>
          <TabTrigger icon={LockKeyhole} value="private" style={{ flexDirection: "row", gap: 6 }}>
            <Tabs.Label>{t("Private groups")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "group-list", id: "PRIVATE" }} />
          </TabTrigger>
          <TabTrigger icon={Globe} value="public" style={{ flexDirection: "row", gap: 6 }}>
            <Tabs.Label>{t("Public groups")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "group-list", id: "PUBLIC" }} />
          </TabTrigger>
          <TabTrigger icon={Search} value="search" style={{ flexDirection: "row", gap: 6 }}>
            <Tabs.Label>{t("Search")}</Tabs.Label>
            <NotificationTabBadge target={{ kind: "group-list", id: "search" }} />
          </TabTrigger>
        </MainTabBar>
        {(["private", "public", "search"] as const).map((section) => (
          <RetainedTabPanel
            key={JSON.stringify([options.apiUrl, options.userId, section])}
            active={selectedSection === section}
          >
            <MemoizedGroupList
              scope={section === "search" ? "public" : "mine"}
              type={section === "private" ? "PRIVATE" : section === "public" ? "PUBLIC" : undefined}
            />
          </RetainedTabPanel>
        ))}
      </Tabs>
    </NotificationAttentionScope>
  );
}
