import { useLocalSearchParams, useRouter } from "expo-router";
import { Tabs } from "heroui-native/tabs";
import { View } from "react-native";
import { ListPage, listPageContentStyle } from "@/components/common/ui/ListPage";
import Groups from "@/components/groups/GroupsScreen";
import { Organizations } from "@/components/organizations/Organizations";
import { useT } from "@/lib/i18n";
import { CommunityDiscovery } from "./CommunityDiscovery";

export function CommunitySection() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section =
    params.section === "organizations" || params.section === "search" ? params.section : "groups";
  return (
    <ListPage>
      <View style={{ ...listPageContentStyle, flexGrow: 0, paddingBottom: 0 }}>
        <Tabs
          value={section}
          onValueChange={(section) => router.setParams({ section })}
          variant="primary"
        >
          <Tabs.List style={{ width: "100%" }}>
            <Tabs.Indicator />
            <Tabs.Trigger testID="community-tab-groups" value="groups" style={{ flex: 1 }}>
              <Tabs.Label>{t("Groups")}</Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger
              testID="community-tab-organizations"
              value="organizations"
              style={{ flex: 1 }}
            >
              <Tabs.Label>{t("Organizations")}</Tabs.Label>
            </Tabs.Trigger>
            <Tabs.Trigger testID="community-tab-search" value="search" style={{ flex: 1 }}>
              <Tabs.Label>{t("Search")}</Tabs.Label>
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs>
      </View>
      {section === "groups" ? (
        <Groups />
      ) : section === "organizations" ? (
        <Organizations />
      ) : (
        <CommunityDiscovery />
      )}
    </ListPage>
  );
}
