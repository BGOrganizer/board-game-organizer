import { Button } from "heroui-native/button";
import { Skeleton } from "heroui-native/skeleton";
import { Typography } from "heroui-native/text";
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { SectionList, View } from "react-native";
import { EmptyList } from "@/components/EmptyList";
import { GroupedList } from "@/components/GroupedList";
import { useT } from "@/lib/i18n";

type PageState = {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isFetchNextPageError?: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch?: () => Promise<unknown>;
};

type ContactSection<T> = {
  key: string;
  label: string;
  icon: LucideIcon;
  rows: T[];
  isLoading: boolean;
  isError: boolean;
  empty: string;
  error?: string;
  query: PageState;
};

export function ContactSections<T>({
  sections,
  renderRow,
  getRowKey,
  footer,
}: {
  sections: ContactSection<T>[];
  renderRow: (item: T, sectionKey: string) => ReactNode;
  getRowKey: (item: T) => string;
  footer?: ReactNode;
}) {
  const t = useT();
  return (
    <SectionList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24 }}
      sections={sections.map((section) => ({ ...section, data: section.rows }))}
      keyExtractor={getRowKey}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderSectionHeader={({ section }) => (
        <View style={{ gap: 8, paddingTop: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <section.icon size={18} color="#737373" />
            <Typography accessibilityRole="header" className="font-semibold text-foreground">
              {section.label}
            </Typography>
          </View>
          {section.isLoading ? (
            <Skeleton style={{ width: "100%", height: 52, borderRadius: 12 }} />
          ) : null}
          {section.isError ? (
            <View style={{ gap: 4 }}>
              <Typography accessibilityRole="alert" className="text-sm text-danger">
                {section.error ?? t("Could not load contacts")}
              </Typography>
              {section.query.refetch ? (
                <Button variant="ghost" onPress={() => void section.query.refetch?.()}>
                  <Typography>{t("Retry")}</Typography>
                </Button>
              ) : null}
            </View>
          ) : null}
          {!section.isLoading && !section.isError && section.rows.length === 0 ? (
            <EmptyList icon={<section.icon size={28} color="#737373" />}>{section.empty}</EmptyList>
          ) : null}
        </View>
      )}
      renderItem={({ item, section }) => <GroupedList>{renderRow(item, section.key)}</GroupedList>}
      onEndReached={() => {
        for (const section of sections) {
          const { query } = section;
          if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError)
            void query.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        <View style={{ gap: 8, paddingTop: 8 }}>
          {sections.some((section) => section.query.isFetchNextPageError) ? (
            <Button
              variant="ghost"
              onPress={() => {
                for (const section of sections) {
                  if (section.query.isFetchNextPageError) void section.query.fetchNextPage();
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
