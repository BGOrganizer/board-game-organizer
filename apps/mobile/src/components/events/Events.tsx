import {
  communityAccessDenied,
  formatLocationAddress,
  useEventList,
} from "@board-game-organizer/shared";
import { useRouter } from "expo-router";
import { Button } from "heroui-native/button";

import { Input } from "heroui-native/input";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import { Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { floatingActionLayout } from "@/lib/floating-actions";
import { useT } from "@/lib/i18n";
import { useCommunityApi } from "@/lib/useCommunityApi";

export function Events({ organizationId = "" }: { organizationId?: string }) {
  const t = useT();
  const o = useCommunityApi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim().length >= 4 ? query.trim() : ""), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const list = useEventList(o, organizationId, search);
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={{ flex: 1 }}
        data={communityAccessDenied(list.error) ? [] : list.items}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          gap: 12,
          paddingBottom: floatingActionLayout(insets.bottom, 16).paddingBottom,
        }}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError)
            void list.fetchNextPage();
        }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Input
              accessibilityLabel={t("Search events")}
              value={query}
              onChangeText={setQuery}
              maxLength={120}
            />
            <Button variant="ghost" onPress={() => setQuery("")}>
              {t("Clear")}
            </Button>
            {list.isPending ? (
              <Skeleton style={{ width: "100%", height: 96, borderRadius: 12 }} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !list.isPending && !list.isError ? <Typography>{t("No events found")}</Typography> : null
        }
        ListFooterComponent={
          <View style={{ gap: 8 }}>
            {list.isError ? (
              <Button onPress={() => void list.refetch()}>
                {t("Could not load events. Retry")}
              </Button>
            ) : null}
            {list.isFetchingNextPage ? (
              <Skeleton style={{ width: "100%", height: 80, borderRadius: 12 }} />
            ) : null}
            {list.isFetchNextPageError ? (
              <Button onPress={() => void list.fetchNextPage()}>{t("Retry")}</Button>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <LinkedListCard
            onPress={() => router.push(`/event/${item.id}`)}
            label={`${t("Open event")}: ${item.name}`}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Typography className="font-semibold">{item.name}</Typography>
              <Typography>
                {item.organizationName} · {item.status === "DRAFT" ? t("Draft") : t("Published")}
              </Typography>
              <Typography>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: item.timeZone,
                }).format(new Date(item.startsAt))}
              </Typography>
              <Typography className="text-muted">
                {formatLocationAddress(item.location.address)}
              </Typography>
            </View>
          </LinkedListCard>
        )}
      />
      <FloatingActions
        label="New event"
        testID="new-event-fab"
        onPress={() =>
          router.push({
            pathname: "/event/wizard",
            params: organizationId ? { organizationId } : {},
          })
        }
        extraBottom={16}
      >
        <Plus color="#fff" size={26} />
      </FloatingActions>
    </View>
  );
}
