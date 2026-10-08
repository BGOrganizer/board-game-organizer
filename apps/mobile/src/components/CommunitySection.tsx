import {
  communityAccessDenied,
  useOrganizationList,
  usePublicGroups,
} from "@board-game-organizer/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Tabs } from "heroui-native/tabs";
import { Typography } from "heroui-native/text";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import Groups from "@/components/Groups";
import { Organizations } from "@/components/Organizations";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function CommunitySection() {
  const t = useT();
  const params = useLocalSearchParams<{ section?: string }>();
  const router = useRouter();
  const section = params.section ?? "groups";
  const selected = ["groups", "organizations", "search"].includes(section) ? section : "groups";
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        value={selected}
        onValueChange={(section) => router.setParams({ section })}
        variant="primary"
      >
        <Tabs.List>
          <Tabs.Indicator />
          <Tabs.Trigger value="groups" testID="community-tab-groups" style={{ flex: 1 }}>
            <Tabs.Label>{t("Groups")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger
            value="organizations"
            testID="community-tab-organizations"
            style={{ flex: 1 }}
          >
            <Tabs.Label>{t("Organizations")}</Tabs.Label>
          </Tabs.Trigger>
          <Tabs.Trigger value="search" testID="community-tab-search" style={{ flex: 1 }}>
            <Tabs.Label>{t("Search")}</Tabs.Label>
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>
      <View style={{ flex: 1 }}>
        {selected === "groups" ? (
          <Groups />
        ) : selected === "organizations" ? (
          <Organizations />
        ) : (
          <CommunityDiscovery />
        )}
      </View>
    </View>
  );
}
function CommunityDiscovery() {
  const options = useCommunityApi();
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [ge, setGe] = useState(true);
  const [oe, setOe] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const groups = usePublicGroups({ ...options, enabled: options.enabled !== false && ge }, search);
  const orgs = useOrganizationList(
    { ...options, enabled: options.enabled !== false && oe },
    "public",
    search,
  );
  const items = [
    ...(ge && search && !communityAccessDenied(groups.error)
      ? groups.items.map((g) => ({ kind: "group" as const, ...g }))
      : []),
    ...(oe && search && !communityAccessDenied(orgs.error)
      ? orgs.items.map((o) => ({ kind: "organization" as const, ...o }))
      : []),
  ];
  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}
      data={items}
      keyExtractor={(item) => `${item.kind}/${item.id}`}
      keyboardShouldPersistTaps="handled"
      onEndReached={() => {
        if (ge && groups.hasNextPage && !groups.isFetchingNextPage && !groups.isFetchNextPageError)
          void groups.fetchNextPage();
        if (oe && orgs.hasNextPage && !orgs.isFetchingNextPage && !orgs.isFetchNextPageError)
          void orgs.fetchNextPage();
      }}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Input
            accessibilityLabel={t("Search groups and organizations")}
            value={query}
            onChangeText={setQuery}
            maxLength={120}
          />
          <Button variant="ghost" onPress={() => setQuery("")}>
            {t("Clear search")}
          </Button>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              variant={ge ? "primary" : "outline"}
              accessibilityState={{ selected: ge }}
              onPress={() => setGe(!ge)}
            >
              {t("Groups")}
            </Button>
            <Button
              variant={oe ? "primary" : "outline"}
              accessibilityState={{ selected: oe }}
              onPress={() => setOe(!oe)}
            >
              {t("Organizations")}
            </Button>
          </View>
          {!search ? <Typography>{t("Enter at least 4 characters to search")}</Typography> : null}
          {search && ((ge && groups.isPending) || (oe && orgs.isPending)) ? (
            <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        search &&
        (!ge || !groups.isPending) &&
        (!oe || !orgs.isPending) &&
        !groups.isError &&
        !orgs.isError ? (
          <Typography>{t("No results found")}</Typography>
        ) : null
      }
      ListFooterComponent={
        <View style={{ gap: 8 }}>
          {[ge ? groups : null, oe ? orgs : null].map((list) =>
            list && search ? (
              <View key={list === groups ? "groups" : "organizations"}>
                {list.isError ? (
                  <Button variant="outline" onPress={() => void list.refetch()}>
                    {t("Search failed. Retry")}
                  </Button>
                ) : null}
                {list.isFetchingNextPage ? (
                  <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
                ) : null}
                {list.isFetchNextPageError ? (
                  <Button variant="outline" onPress={() => void list.fetchNextPage()}>
                    {t("Retry")}
                  </Button>
                ) : null}
              </View>
            ) : null,
          )}
        </View>
      }
      renderItem={({ item }) =>
        item.kind === "organization" ? (
          <Button variant="secondary" onPress={() => router.push(`/organization/${item.id}`)}>
            {item.name}
          </Button>
        ) : (
          <View className="bg-surface" style={{ padding: 16, borderRadius: 12, gap: 4 }}>
            <Typography className="font-semibold">{item.name}</Typography>
            <Typography>
              {t("Public group")} · {item.memberCount} {t("members")}
            </Typography>
            <Typography className="text-muted">
              {t("Group join requests will be available later")}
            </Typography>
          </View>
        )
      }
    />
  );
}
