import { Button } from "heroui-native/button";
import { Typography } from "heroui-native/text";
import type { ReactNode } from "react";
import { FlatList, View } from "react-native";
import { EmptyList } from "@/components/EmptyList";
import { GroupedList } from "@/components/GroupedList";
import { useT } from "@/lib/i18n";

type Page = {
  hasNextPage?: boolean;
  isLoading: boolean;
  isError: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
};

export function ContactList<T>({
  data,
  pages,
  keyExtractor,
  renderRow,
  empty,
  emptyIcon,
  error,
  skeleton,
  footer,
}: {
  data: T[];
  pages: Page[];
  keyExtractor: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  empty: string;
  emptyIcon: ReactNode;
  error: string;
  skeleton: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
      renderItem={({ item }) => <GroupedList>{renderRow(item)}</GroupedList>}
      onEndReached={() => {
        if (pages.some((page) => page.isError)) return;
        const page = pages.find((candidate) => candidate.hasNextPage);
        if (page && !page.isFetchingNextPage && !page.isFetchNextPageError)
          void page.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <>
          {pages.some((page) => page.isLoading) ? skeleton : null}
          {pages.some((page) => page.isError) ? (
            <View style={{ gap: 4 }}>
              <Typography accessibilityRole="alert" className="text-sm text-danger">
                {error}
              </Typography>
              <Button
                variant="ghost"
                onPress={() => {
                  for (const page of pages) {
                    if (page.isError) void page.refetch();
                  }
                }}
              >
                <Typography>{t("Retry")}</Typography>
              </Button>
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        pages.some((page) => page.isLoading || page.isError) ? null : (
          <EmptyList icon={emptyIcon}>{empty}</EmptyList>
        )
      }
      ListFooterComponent={
        <View style={{ gap: 8, paddingTop: 8 }}>
          {pages.some((page) => page.isFetchNextPageError) ? (
            <Button
              variant="ghost"
              onPress={() => {
                for (const page of pages) {
                  if (page.isFetchNextPageError) void page.fetchNextPage();
                }
              }}
            >
              <Typography>{t("Retry")}</Typography>
            </Button>
          ) : null}
          {footer}
        </View>
      }
    />
  );
}
