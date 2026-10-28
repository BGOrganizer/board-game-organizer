import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { Button } from "heroui-native/button";
import { useThemeColor } from "heroui-native/hooks";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { UsersRound } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { ListPage, listPageContentStyle } from "@/components/common/ui/ListPage";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
import { GroupCard } from "./GroupCard";
export function GroupModeration() {
  const t = useT(),
    o = useCommunityApi(),
    f = useListSearch<never>([]),
    q = useGroupRecords(o, "moderation", f.search),
    muted = useThemeColor("muted"),
    insets = useSafeAreaInsets();
  return (
    <ListPage>
      <FlatList
        style={{ flex: 1 }}
        data={communityAccessDenied(q.error) ? [] : q.items}
        keyExtractor={(row) => row.id}
        contentContainerStyle={{ ...listPageContentStyle, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <ListSearch
            query={f.query}
            onQueryChange={f.setQuery}
            label={t("Search groups")}
            placeholder={t("Search groups")}
            options={[]}
            selected={[]}
            onToggle={f.toggle}
          />
        }
        renderItem={({ item }) => (
          <GroupCard
            group={item}
            href={{ pathname: "/moderation/[groupId]", params: { groupId: item.id } }}
          />
        )}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage && !q.isFetchNextPageError)
            void q.fetchNextPage();
        }}
        ListEmptyComponent={
          q.isPending ? (
            <View style={{ gap: 12 }}>
              {[1, 2, 3].map((key) => (
                <Skeleton key={key} style={{ width: "100%", height: 96, borderRadius: 12 }} />
              ))}
            </View>
          ) : !q.isError ? (
            <EmptyList icon={<UsersRound size={28} color={muted} />}>
              {t("No pending reviews")}
            </EmptyList>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: 12 }}>
            {q.isError ? (
              <View style={{ gap: 8 }}>
                <Typography accessibilityRole="alert" className="text-danger">
                  {t("Could not load moderation queue")}
                </Typography>
                <Button variant="outline" onPress={() => void q.refetch()}>
                  <Button.Label>{t("Try again")}</Button.Label>
                </Button>
              </View>
            ) : null}
            {q.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : q.hasNextPage ? (
              <Button variant="outline" onPress={() => void q.fetchNextPage()}>
                <Button.Label>{t("Load more")}</Button.Label>
              </Button>
            ) : null}
          </View>
        }
      />
    </ListPage>
  );
}
