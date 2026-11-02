import { type GroupRecord, groupRecordMemberRoles } from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Check, Crown, Mail, Plus, UsersRound } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { ListPage, listPageContentStyle } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { NotificationAttentionScope } from "@/components/notifications/NotificationAttentionScope";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { useFloatingActionLayout } from "@/lib/useFloatingActionLayout";
import { GroupCard } from "./GroupCard";
export function GroupList({
  scope = "mine",
  type,
}: {
  scope?: "mine" | "public";
  type?: GroupRecord["type"];
}) {
  const t = useT(),
    router = useRouter(),
    options = useCommunityApi(),
    layout = useFloatingActionLayout(),
    muted = useThemeColor("muted"),
    accentForeground = useThemeColor("accent-foreground");
  const filters = useListSearch(groupRecordMemberRoles, scope === "mine" ? 0 : 4),
    list = useGroupRecords(options, scope, filters.search, filters.selected, type);
  const searchable = scope !== "public" || Boolean(filters.search);
  return (
    <NotificationAttentionScope
      options={options}
      targets={(communityAccessDenied(list.error) ? [] : list.items)
        .filter((row) => !row.optimistic)
        .map((row) => ({ kind: "group", id: row.id }))}
    >
      <ListPage>
        <FlatList
          testID="groups-scroll"
          style={{ flex: 1 }}
          data={communityAccessDenied(list.error) ? [] : list.items}
          keyExtractor={(group) => group.id}
          contentContainerStyle={{
            ...listPageContentStyle,
            paddingTop: 8,
            paddingBottom: layout.paddingBottom,
          }}
          keyboardShouldPersistTaps="handled"
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
              void list.fetchNextPage();
          }}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <ListSearch
                query={filters.query}
                onQueryChange={filters.setQuery}
                label={scope === "mine" ? t("Filter") : t("Search groups")}
                placeholder={scope === "mine" ? t("Filter groups") : t("Search groups")}
                mode={scope === "mine" ? "filter" : "search"}
                selected={filters.selected}
                onToggle={filters.toggle}
                options={
                  scope === "mine"
                    ? [
                        { key: "admin", label: t("Admin"), icon: Crown },
                        { key: "invited", label: t("Invited"), icon: Mail },
                        { key: "accepted", label: t("Accepted"), icon: Check },
                      ]
                    : []
                }
              />
              {scope === "public" && !filters.search && !filters.query.trim() ? (
                <Typography className="text-muted">
                  {t("Enter at least 4 characters to search")}
                </Typography>
              ) : null}
            </View>
          }
          renderItem={({ item: group }) => (
            <GroupCard
              group={group}
              checking={list.isFetching}
              onVerify={() => void list.refetch({ cancelRefetch: false })}
            />
          )}
          ListEmptyComponent={
            searchable && list.isPending ? (
              <View style={{ gap: 12 }}>
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} style={{ width: "100%", height: 96, borderRadius: 12 }} />
                ))}
              </View>
            ) : searchable && !list.isError ? (
              <EmptyList icon={<UsersRound size={28} color={muted} />}>
                {t("No groups found")}
              </EmptyList>
            ) : null
          }
          ListFooterComponent={
            <View style={{ gap: 12 }}>
              {list.isError ? (
                <View style={{ gap: 8 }}>
                  <Typography accessibilityRole="alert" className="text-danger">
                    {t("Could not load groups")}
                  </Typography>
                  <Button variant="outline" onPress={() => void list.refetch()}>
                    <Button.Label>{t("Try again")}</Button.Label>
                  </Button>
                </View>
              ) : null}
              {list.isFetchingNextPage ? (
                <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ) : list.hasNextPage ? (
                <Button variant="outline" onPress={() => void list.fetchNextPage()}>
                  <Button.Label>
                    {list.isFetchNextPageError ? t("Could not load groups. Retry") : t("Load more")}
                  </Button.Label>
                </Button>
              ) : null}
            </View>
          }
        />
        {scope === "mine" ? (
          <FloatingActions
            label={t("Create group")}
            testID="create-group-fab"
            onPress={() => router.push("/group/wizard")}
            variant="primary"
          >
            <Plus size={26} color={accentForeground} />
          </FloatingActions>
        ) : null}
      </ListPage>
    </NotificationAttentionScope>
  );
}
