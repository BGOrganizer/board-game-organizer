import {
  communityAccessDenied,
  useListSearch,
  useOrganizationList,
  usePublicGroups,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Building2, UsersRound } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListPage, listPageContentStyle } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

const kinds = ["groups", "organizations"] as const;

export function CommunityDiscovery() {
  const options = useCommunityApi();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const filters = useListSearch(kinds);
  const search = filters.search;
  const ge = filters.selected.includes("groups");
  const oe = filters.selected.includes("organizations");
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
    <ListPage>
      <FlatList
        testID="community-search-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{ ...listPageContentStyle, paddingBottom: insets.bottom + 20 }}
        data={items}
        keyExtractor={(item) => `${item.kind}/${item.id}`}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => {
          if (
            ge &&
            groups.hasNextPage &&
            !groups.isFetchingNextPage &&
            !groups.isFetchNextPageError
          )
            void groups.fetchNextPage();
          if (oe && orgs.hasNextPage && !orgs.isFetchingNextPage && !orgs.isFetchNextPageError)
            void orgs.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <ListSearch
              query={filters.query}
              onQueryChange={filters.setQuery}
              label={t("Search groups and organizations")}
              placeholder={t("Search groups and organizations")}
              selected={filters.selected}
              onToggle={filters.toggle}
              options={[
                { key: "groups", label: t("Groups"), icon: UsersRound },
                { key: "organizations", label: t("Organizations"), icon: Building2 },
              ]}
            />
            {!search && !filters.query.trim() ? (
              <Typography>{t("Enter at least 4 characters to search")}</Typography>
            ) : null}
            {search && ((ge && groups.isPending) || (oe && orgs.isPending)) ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          search &&
          (!ge || !groups.isPending) &&
          (!oe || !orgs.isPending) &&
          (!ge || !groups.isError) &&
          (!oe || !orgs.isError) ? (
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
    </ListPage>
  );
}
