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
export function GroupList({ type }: { type: GroupRecord["type"] }) {
  const t = useT(),
    { _: translate } = useLingui(),
    router = useRouter(),
    options = useCommunityApi(),
    layout = useFloatingActionLayout(),
    muted = useThemeColor("muted"),
    accentForeground = useThemeColor("accent-foreground");
  const [order, setOrder] = useState<RecordListOrder>({ sort: "date", direction: "desc" });
  const filters = useListSearch(groupRecordMemberRoles, 0),
    list = useGroupRecords(options, "mine", filters.search, filters.selected, type, order);
  const items = communityAccessDenied(list.error) ? [] : list.items;
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
      type === "PRIVATE"
        ? {
            title: t("Private groups"),
            label: t("Private groups help"),
            icon: LockKeyhole,
            description: t(
              "Private groups you manage, belong to or have a pending invitation to join.",
            ),
          }
        : {
            title: t("Public groups"),
            label: t("Public groups help"),
            icon: Globe,
            description: t(
              "Public groups you manage or belong to, and groups with a pending request or invitation. Groups you manage may still be awaiting approval.",
            ),
          };
    return (
      <View style={{ gap: 12 }}>
        <HelpSectionCard
          title={sectionHelp.title}
          label={sectionHelp.label}
          icon={sectionHelp.icon}
        >
          <Typography className="text-foreground">{sectionHelp.description}</Typography>
        </HelpSectionCard>
        <ListSearch
          query={query}
          onQueryChange={setQuery}
          label={t("Filter")}
          placeholder={t("Filter groups")}
          mode="filter"
          showSearchGuidance={false}
          selected={selected}
          onToggle={toggle}
          options={[
            {
              key: "administrator",
              label: translate({ id: "list.filter.admin", message: "Admin" }),
              icon: Crown,
            },
            { key: "moderator", label: t("Moderator"), icon: ShieldCheck },
            { key: "member", label: t("Member"), icon: Check },
            { key: "pending", label: t("Pending"), icon: Clock3 },
          ]}
        />
        <ListOrdering order={order} onChange={setOrder} />
      </View>
    );
  }, [type, order, query, selected, setQuery, toggle, t, translate]);
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
            list.isPending ? (
              <View style={{ gap: 12 }}>
                {[1, 2, 3].map((key) => (
                  <Skeleton key={key} style={{ width: "100%", height: 96, borderRadius: 12 }} />
                ))}
              </View>
            ) : !list.isError && !list.hasNextPage ? (
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
        <FloatingActions
          label={t("Create group")}
          testID="create-group-fab"
          onPress={() => router.push("/group/wizard")}
          variant="primary"
        >
          <Plus size={26} color={accentForeground} />
        </FloatingActions>
      </ListPage>
    </NotificationAttentionScope>
  );
}
