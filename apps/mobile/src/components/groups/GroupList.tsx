import {
  type GroupRecord,
  groupRecordMemberRoles,
  type RecordListOrder,
} from "@board-game-organizer/schemas";
import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { useLingui } from "@lingui/react";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import {
  Check,
  Clock3,
  Crown,
  Globe,
  LockKeyhole,
  Plus,
  Search,
  SearchX,
  ShieldCheck,
  UsersRound,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { InputFlatList } from "@/components/common/ui/InputFlatList";
import { ListOrdering } from "@/components/common/ui/ListOrdering";
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
    { _: translate } = useLingui(),
    router = useRouter(),
    options = useCommunityApi(),
    layout = useFloatingActionLayout(scope === "mine"),
    muted = useThemeColor("muted"),
    accentForeground = useThemeColor("accent-foreground");
  const minimumLength = scope === "public" ? 4 : 0;
  const [order, setOrder] = useState<RecordListOrder>({ sort: "date", direction: "desc" });
  const filters = useListSearch(groupRecordMemberRoles, minimumLength),
    list = useGroupRecords(options, scope, filters.search, filters.selected, type, order);
  const needsQuery = filters.query.trim().length < minimumLength;
  const searchable = !needsQuery && (scope === "mine" || Boolean(filters.search));
  const items = searchable && !communityAccessDenied(list.error) ? list.items : [];
  const EmptyIcon = scope === "public" ? SearchX : UsersRound;
  const verify = useCallback(() => void list.refetch({ cancelRefetch: false }), [list.refetch]);
  const renderItem = useCallback(
    ({ item: group }: { item: (typeof list.items)[number] }) => (
      <GroupCard
        group={group}
        checking={group.optimistic?.phase === "verifying" && list.isFetching}
        onVerify={group.optimistic?.phase === "verifying" ? verify : undefined}
      />
    ),
    [list.isFetching, verify],
  );
  const { query, setQuery, selected, toggle } = filters;
  const listHeader = useMemo(() => {
    const sectionHelp =
      scope === "public"
        ? {
            title: t("Search"),
            label: t("Group search help"),
            icon: Search,
            description: t(
              "Search for approved public groups by name. Enter at least four characters.",
            ),
          }
        : type === "PRIVATE"
          ? {
              title: t("Private groups"),
              label: t("Private groups help"),
              icon: LockKeyhole,
              description: t(
                "Private groups you manage, belong to or have a pending invitation to join.",
              ),
            }
          : type === "PUBLIC"
            ? {
                title: t("Public groups"),
                label: t("Public groups help"),
                icon: Globe,
                description: t(
                  "Public groups you manage or belong to, and groups with a pending request or invitation. Groups you manage may still be awaiting approval.",
                ),
              }
            : null;
    return (
      <View style={{ gap: 12 }}>
        {sectionHelp ? (
          <HelpSectionCard
            title={sectionHelp.title}
            label={sectionHelp.label}
            icon={sectionHelp.icon}
          >
            <Typography className="text-foreground">{sectionHelp.description}</Typography>
          </HelpSectionCard>
        ) : null}
        <ListSearch
          query={query}
          onQueryChange={setQuery}
          label={scope === "mine" ? t("Filter") : t("Search groups")}
          placeholder={scope === "mine" ? t("Filter groups") : t("Search groups")}
          mode={scope === "mine" ? "filter" : "search"}
          showSearchGuidance={false}
          selected={selected}
          onToggle={toggle}
          options={
            scope === "mine"
              ? [
                  {
                    key: "administrator",
                    label: translate({ id: "list.filter.admin", message: "Admin" }),
                    icon: Crown,
                  },
                  { key: "moderator", label: t("Moderator"), icon: ShieldCheck },
                  { key: "member", label: t("Member"), icon: Check },
                  { key: "pending", label: t("Pending"), icon: Clock3 },
                ]
              : []
          }
        />
        {scope === "mine" ? <ListOrdering order={order} onChange={setOrder} /> : null}
      </View>
    );
  }, [scope, type, order, query, selected, setQuery, toggle, t, translate]);
  return (
    <NotificationAttentionScope
      options={options}
      targets={items.filter((row) => !row.optimistic).map((row) => ({ kind: "group", id: row.id }))}
    >
      <ListPage>
        <InputFlatList
          testID="groups-scroll"
          style={{ flex: 1 }}
          data={items}
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
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          ListEmptyComponent={
            needsQuery ? (
              <EmptyList icon={<Search size={28} color={muted} />}>
                {t("Enter at least 4 characters to search")}
              </EmptyList>
            ) : searchable && list.isPending ? (
              <View style={{ gap: 12 }}>
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} style={{ width: "100%", height: 96, borderRadius: 12 }} />
                ))}
              </View>
            ) : searchable && !list.isError && !list.hasNextPage ? (
              <EmptyList icon={<EmptyIcon size={28} color={muted} />}>
                {t("No groups found")}
              </EmptyList>
            ) : null
          }
          ListFooterComponent={
            <View style={{ gap: 12 }}>
              {searchable && list.isError ? (
                <View style={{ gap: 8 }}>
                  <Typography accessibilityRole="alert" className="text-danger">
                    {t("Could not load groups")}
                  </Typography>
                  <Button variant="outline" onPress={() => void list.refetch()}>
                    <Button.Label>{t("Try again")}</Button.Label>
                  </Button>
                </View>
              ) : null}
              {searchable && list.isFetchingNextPage ? (
                <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ) : searchable && list.hasNextPage ? (
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
