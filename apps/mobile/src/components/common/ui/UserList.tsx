import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { FlatList, type StyleProp, View, type ViewStyle } from "react-native";
import { useT } from "@/lib/i18n";
import { nextUserPage, type UserPage } from "@/lib/user-list";
import { EmptyList } from "./EmptyList";
import { GroupedList } from "./GroupedList";

export function UserList<T>({
  data,
  pages,
  keyExtractor,
  renderRow,
  empty,
  emptyIcon,
  error,
  skeleton,
  header,
  footer,
  testID,
  contentContainerStyle,
}: {
  data: T[];
  pages: UserPage[];
  keyExtractor: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  empty: string;
  emptyIcon: ReactNode;
  error: string;
  skeleton: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  testID?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const t = useT();
  const next = nextUserPage(pages);
  return (
    <FlatList
      testID={testID}
      data={data}
      keyExtractor={keyExtractor}
      style={{ flex: 1 }}
      contentContainerStyle={[{ gap: 8, paddingBottom: 24 }, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <GroupedList>{renderRow(item)}</GroupedList>}
      onEndReached={() => {
        if (next) void next.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          {header}
          {pages.some((page) => page.isLoading) ? skeleton : null}
          {pages.some((page) => page.isError) ? (
            <View style={{ gap: 4 }}>
              <Typography accessibilityRole="alert" className="text-sm text-danger">
                {error}
              </Typography>
              <Button
                variant="ghost"
                onPress={() => {
                  for (const page of pages) if (page.isError) void page.refetch();
                }}
              >
                <Typography>{t("Retry")}</Typography>
              </Button>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        pages.some((page) => page.isLoading || page.isError) ? null : (
          <EmptyList icon={emptyIcon}>{empty}</EmptyList>
        )
      }
      ListFooterComponent={
        <View style={{ gap: 8, paddingTop: 8 }}>
          {pages.some((page) => page.isFetchingNextPage) ? (
            <Skeleton style={{ width: "100%", height: 64, borderRadius: 12 }} />
          ) : null}
          {pages.some((page) => page.isFetchNextPageError) ? (
            <Button
              variant="ghost"
              onPress={() => {
                for (const page of pages) if (page.isFetchNextPageError) void page.fetchNextPage();
              }}
            >
              <Typography>{t("Retry")}</Typography>
            </Button>
          ) : next ? (
            <Button variant="outline" onPress={() => void next.fetchNextPage()}>
              {t("Load more")}
            </Button>
          ) : null}
          {footer}
        </View>
      }
    />
  );
}
