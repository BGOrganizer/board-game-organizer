import {
  communityAccessDenied,
  useGroupRecords,
  useListSearch,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";
export function GroupModeration() {
  const t = useT(),
    o = useCommunityApi(),
    f = useListSearch<never>([]),
    q = useGroupRecords(o, "moderation", f.search),
    router = useRouter(),
    insets = useSafeAreaInsets();
  return (
    <FlatList
      data={communityAccessDenied(q.error) ? [] : q.items}
      keyExtractor={(row) => row.id}
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: insets.bottom + 32 }}
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
        <Button
          variant="outline"
          onPress={() =>
            router.push({ pathname: "/moderation/[groupId]", params: { groupId: item.id } })
          }
        >
          <Button.Label>{item.name}</Button.Label>
        </Button>
      )}
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage && !q.isFetchNextPageError)
          void q.fetchNextPage();
      }}
      ListEmptyComponent={
        q.isPending ? (
          <Skeleton style={{ width: "100%", height: 128, borderRadius: 12 }} />
        ) : !q.isError ? (
          <Typography className="text-foreground">{t("No pending reviews")}</Typography>
        ) : null
      }
      ListFooterComponent={
        <View>
          {q.isError ? (
            <>
              <Typography accessibilityRole="alert" className="text-danger">
                {t("Could not load moderation queue")}
              </Typography>
              <Button onPress={() => void q.refetch()}>
                <Button.Label>{t("Try again")}</Button.Label>
              </Button>
            </>
          ) : null}
          {q.hasNextPage ? (
            <Button isDisabled={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()}>
              <Button.Label>{t("Load more")}</Button.Label>
            </Button>
          ) : null}
        </View>
      }
    />
  );
}
